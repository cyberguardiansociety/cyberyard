import { Prisma } from '@prisma/client';
import { UserActivityType, NotificationType, CommunityCategory, CommunityReactionType, CommunityReportReason, CommunityReportStatus } from '../constants/enums';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { createActivity } from './activity.service';
import { createNotification } from './notification.service';
import { getCategoryProgress, getDifficultyProgress } from './gamification.service';
import { CommunityCommentCreateInput, CommunityCommentUpdateInput, CommunityPostCreateInput, CommunityPostUpdateInput, ProfileUpdateInput, ReportCreateInput } from '../validation/community.schema';

const userPublicSelect = { id: true, username: true } satisfies Prisma.UserSelect;
const commentSelect = { id: true, content: true, createdAt: true, updatedAt: true, user: { select: userPublicSelect } } satisfies Prisma.CommunityCommentSelect;
const postSelect = {
  id: true, title: true, content: true, category: true, createdAt: true, updatedAt: true,
  user: { select: { id: true, username: true, profile: { select: { avatarUrl: true } } } },
  _count: { select: { comments: true, reactions: true } },
} satisfies Prisma.CommunityPostSelect;

function publicComment(row: any) {
  return { id: row.id, content: row.content, createdAt: row.createdAt, updatedAt: row.updatedAt, author: { id: row.user.id, username: row.user.username } };
}
function publicPost(row: any, viewerReaction = false) {
  return {
    id: row.id, title: row.title, content: row.content, category: row.category,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    author: { id: row.user.id, username: row.user.username, avatarUrl: row.user.profile?.avatarUrl ?? null },
    reactionCount: row._count?.reactions ?? 0,
    commentCount: row._count?.comments ?? 0,
    viewerReacted: viewerReaction,
  };
}

async function blockPairExists(userA: string, userB: string): Promise<boolean> {
  const row = await prisma.block.findFirst({ where: { OR: [{ blockerId: userA, blockedId: userB }, { blockerId: userB, blockedId: userA }] }, select: { id: true } });
  return !!row;
}

async function assertUsersCanInteract(actorId: string, targetUserId: string) {
  if (actorId === targetUserId) return;
  if (await blockPairExists(actorId, targetUserId)) throw new ApiError(403, 'This interaction is not available.', 'SOCIAL_INTERACTION_BLOCKED');
}

async function getBlockedUserIds(userId: string): Promise<string[]> {
  const [given, received] = await prisma.$transaction([
    prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
    prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
  ]);
  return [...new Set([...given.map((x) => x.blockedId), ...received.map((x) => x.blockerId)])];
}

export async function getPublicProfile(viewerId: string | null, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: {
    id: true, username: true, createdAt: true, profile: { select: { bio: true, avatarUrl: true } },
    _count: { select: { followsReceived: true, followsGiven: true, solves: true, firstBloods: true } },
    gamification: { select: { totalXp: true, currentLevel: true, currentStreak: true, longestStreak: true } },
    badgeAwards: { orderBy: { awardedAt: 'desc' }, take: 12, select: { awardedAt: true, badge: { select: { id: true, name: true, slug: true, icon: true, description: true } } } },
  } });
  if (!user) throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
  if (viewerId && viewerId !== userId) {
    const hiddenByTarget = await prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId: userId, blockedId: viewerId } }, select: { id: true } });
    if (hiddenByTarget) throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
  }
  const pointAggregate = await prisma.solve.aggregate({ where: { userId }, _sum: { pointsAwarded: true } });
  const points = pointAggregate._sum.pointsAwarded ?? 0;
  const following = viewerId ? !!await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: userId } }, select: { id: true } }) : false;
  const blocked = viewerId ? !!await prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId: viewerId, blockedId: userId } }, select: { id: true } }) : false;
  const [recentPosts, categories, difficulties] = await Promise.all([
    prisma.communityPost.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10, select: postSelect }),
    getCategoryProgress(userId),
    getDifficultyProgress(userId),
  ]);
  return {
    id: user.id, username: user.username, bio: user.profile?.bio ?? null, avatarUrl: user.profile?.avatarUrl ?? null, joinedAt: user.createdAt,
    level: user.gamification?.currentLevel ?? 1, xp: user.gamification?.totalXp ?? 0, points, solveCount: user._count.solves,
    firstBloodCount: user._count.firstBloods, currentStreak: user.gamification?.currentStreak ?? 0, longestStreak: user.gamification?.longestStreak ?? 0,
    followersCount: user._count.followsReceived, followingCount: user._count.followsGiven,
    badges: user.badgeAwards.map((a) => ({ ...a.badge, awardedAt: a.awardedAt })),
    categories, difficulties,
    isFollowing: following, isBlocked: blocked, recentPosts: recentPosts.map((p) => publicPost(p)),
  };
}

export async function updateOwnProfile(userId: string, input: ProfileUpdateInput) {
  const userData: Prisma.UserUpdateInput = {};
  if (input.username !== undefined) userData.username = input.username;
  const profileData: Prisma.ProfileUpdateInput = {};
  if (input.bio !== undefined) profileData.bio = input.bio;
  if (input.avatarUrl !== undefined) profileData.avatarUrl = input.avatarUrl;
  if (input.username !== undefined) {
    const duplicate = await prisma.user.findFirst({ where: { username: { equals: input.username }, NOT: { id: userId } }, select: { id: true } });
    if (duplicate) throw new ApiError(409, 'That username is already in use.', 'USERNAME_TAKEN');
  }
  try {
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: userId }, data: userData, select: { id: true, username: true, createdAt: true } });
      const profile = await tx.profile.upsert({ where: { userId }, update: profileData, create: { userId, bio: input.bio, avatarUrl: input.avatarUrl } , select: { bio: true, avatarUrl: true } });
      await createActivity(tx, { userId, type: UserActivityType.PROFILE_UPDATED, description: 'Updated the public profile.', targetId: userId, targetType: 'profile' });
      return { ...updated, ...profile };
    });
    return user;
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') throw new ApiError(409, 'That username is already in use.', 'USERNAME_TAKEN');
    throw error;
  }
}

export async function listPosts(userId: string, options: { limit: number; offset: number; category?: CommunityCategory; search?: string; sort: 'newest'|'most_liked'|'most_discussed' }) {
  const blockedIds = await getBlockedUserIds(userId);
  const where: Prisma.CommunityPostWhereInput = { ...(blockedIds.length ? { userId: { notIn: blockedIds } } : {}), ...(options.category ? { category: options.category } : {}), ...(options.search ? { OR: [{ title: { contains: options.search } }, { content: { contains: options.search } }] } : {}) };
  const orderBy: Prisma.CommunityPostOrderByWithRelationInput[] = options.sort === 'most_liked' ? [{ reactions: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }] : options.sort === 'most_discussed' ? [{ comments: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }] : [{ createdAt: 'desc' }, { id: 'desc' }];
  const [rows, total] = await prisma.$transaction([
    prisma.communityPost.findMany({ where, orderBy, skip: options.offset, take: options.limit, select: postSelect }),
    prisma.communityPost.count({ where }),
  ]);
  const reactionIds = rows.length ? await prisma.communityReaction.findMany({ where: { userId, postId: { in: rows.map((p) => p.id) }, type: CommunityReactionType.LIKE }, select: { postId: true } }) : [];
  const reacted = new Set(reactionIds.map((x) => x.postId));
  return { posts: rows.map((row) => publicPost(row, reacted.has(row.id))), total, limit: options.limit, offset: options.offset };
}

export async function getPost(userId: string, id: string) {
  const row = await prisma.communityPost.findUnique({ where: { id }, select: postSelect });
  if (!row) throw new ApiError(404, 'Post not found.', 'POST_NOT_FOUND');
  if (await blockPairExists(userId, row.user.id)) throw new ApiError(404, 'Post not found.', 'POST_NOT_FOUND');
  const reaction = await prisma.communityReaction.findUnique({ where: { userId_postId_type: { userId, postId: id, type: CommunityReactionType.LIKE } }, select: { id: true } });
  return publicPost(row, !!reaction);
}

export async function listComments(userId: string, postId: string, limit: number, offset: number) {
  const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, userId: true } });
  if (!post) throw new ApiError(404, 'Post not found.', 'POST_NOT_FOUND');
  if (await blockPairExists(userId, post.userId)) throw new ApiError(404, 'Post not found.', 'POST_NOT_FOUND');
  const where = { postId, user: { id: { notIn: await getBlockedUserIds(userId) } } };
  const [rows, total] = await prisma.$transaction([
    prisma.communityComment.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: offset, take: limit, select: commentSelect }),
    prisma.communityComment.count({ where }),
  ]);
  return { comments: rows.map(publicComment), total, limit, offset };
}

export async function createPost(userId: string, input: CommunityPostCreateInput) {
  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.communityPost.create({ data: { userId, title: input.title, content: input.content, category: input.category }, select: postSelect });
    await createActivity(tx, { userId, type: UserActivityType.COMMUNITY_POST_CREATED, description: `Created community post “${created.title}”.`, targetId: created.id, targetType: 'community_post' });
    return created;
  });
  return publicPost(post);
}

export async function updatePost(userId: string, id: string, input: CommunityPostUpdateInput) {
  const existing = await prisma.communityPost.findFirst({ where: { id, userId }, select: { id: true, title: true } });
  if (!existing) throw new ApiError(404, 'Post not found.', 'POST_NOT_FOUND');
  const post = await prisma.$transaction(async (tx) => {
    const updated = await tx.communityPost.update({ where: { id }, data: input, select: postSelect });
    await createActivity(tx, { userId, type: UserActivityType.COMMUNITY_POST_UPDATED, description: `Updated community post “${updated.title}”.`, targetId: id, targetType: 'community_post' });
    return updated;
  });
  return publicPost(post);
}

export async function deletePost(userId: string, id: string, admin = false) {
  const existing = await prisma.communityPost.findUnique({ where: { id }, select: { id: true, userId: true, title: true } });
  if (!existing || (!admin && existing.userId !== userId)) throw new ApiError(404, 'Post not found.', 'POST_NOT_FOUND');
  await prisma.$transaction(async (tx) => {
    await tx.communityPost.delete({ where: { id } });
    await createActivity(tx, { userId, type: UserActivityType.COMMUNITY_POST_DELETED, description: admin ? `Removed community post “${existing.title}” as an administrator.` : `Deleted community post “${existing.title}”.`, targetId: id, targetType: 'community_post' });
  });
  return { deleted: true };
}

export async function createComment(userId: string, postId: string, input: CommunityCommentCreateInput) {
  const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, userId: true, title: true } });
  if (!post) throw new ApiError(404, 'Post not found.', 'POST_NOT_FOUND');
  await assertUsersCanInteract(userId, post.userId);
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.communityComment.create({ data: { postId, userId, content: input.content }, select: commentSelect });
    await createActivity(tx, { userId, type: UserActivityType.COMMUNITY_COMMENT_CREATED, description: `Replied to community post “${post.title}”.`, targetId: postId, targetType: 'community_post' });
    if (post.userId !== userId) await createNotification(tx, { userId: post.userId, type: NotificationType.COMMUNITY, title: 'New community reply', message: `${created.user.username} replied to your post “${post.title}”.`, link: '/community', targetId: postId, dedupeKey: `community-comment:${created.id}` });
    return created;
  });
  return publicComment(comment);
}

export async function updateComment(userId: string, postId: string, id: string, input: CommunityCommentUpdateInput) {
  const existing = await prisma.communityComment.findFirst({ where: { id, postId, userId }, select: { id: true } });
  if (!existing) throw new ApiError(404, 'Comment not found.', 'COMMENT_NOT_FOUND');
  const comment = await prisma.$transaction(async (tx) => {
    const updated = await tx.communityComment.update({ where: { id }, data: input, select: commentSelect });
    await createActivity(tx, { userId, type: UserActivityType.COMMUNITY_COMMENT_UPDATED, description: 'Updated a community reply.', targetId: id, targetType: 'community_comment' });
    return updated;
  });
  return publicComment(comment);
}

export async function deleteComment(userId: string, postId: string, id: string, admin = false) {
  const existing = await prisma.communityComment.findFirst({ where: { id, postId }, select: { id: true, userId: true } });
  if (!existing || (!admin && existing.userId !== userId)) throw new ApiError(404, 'Comment not found.', 'COMMENT_NOT_FOUND');
  await prisma.$transaction(async (tx) => {
    await tx.communityComment.delete({ where: { id } });
    await createActivity(tx, { userId, type: UserActivityType.COMMUNITY_COMMENT_DELETED, description: admin ? 'Removed a community reply as an administrator.' : 'Deleted a community reply.', targetId: id, targetType: 'community_comment' });
  });
  return { deleted: true };
}

export async function addReaction(userId: string, postId: string) {
  const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, userId: true, title: true } });
  if (!post) throw new ApiError(404, 'Post not found.', 'POST_NOT_FOUND');
  await assertUsersCanInteract(userId, post.userId);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.communityReaction.create({ data: { userId, postId, type: CommunityReactionType.LIKE } });
      await createActivity(tx, { userId, type: UserActivityType.COMMUNITY_REACTION_ADDED, description: `Liked community post “${post.title}”.`, targetId: postId, targetType: 'community_post' });
      if (post.userId !== userId) await createNotification(tx, { userId: post.userId, type: NotificationType.COMMUNITY, title: 'Your post was liked', message: 'Someone reacted to your community post.', link: '/community', targetId: postId, dedupeKey: `community-like:${userId}:${postId}` });
    });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return { reacted: true, duplicate: true };
    throw error;
  }
  return { reacted: true, duplicate: false };
}

export async function removeReaction(userId: string, postId: string) {
  const existing = await prisma.communityReaction.findUnique({ where: { userId_postId_type: { userId, postId, type: CommunityReactionType.LIKE } }, select: { id: true } });
  if (!existing) return { reacted: false };
  await prisma.$transaction(async (tx) => {
    await tx.communityReaction.delete({ where: { id: existing.id } });
    await createActivity(tx, { userId, type: UserActivityType.COMMUNITY_REACTION_REMOVED, description: 'Removed a community reaction.', targetId: postId, targetType: 'community_post' });
  });
  return { reacted: false };
}

export async function followUser(actorId: string, targetId: string) {
  if (actorId === targetId) throw new ApiError(400, 'You cannot follow yourself.', 'SELF_FOLLOW');
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, username: true } });
  if (!target) throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
  await assertUsersCanInteract(actorId, targetId);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.follow.create({ data: { followerId: actorId, followingId: targetId } });
      await createActivity(tx, { userId: actorId, type: UserActivityType.USER_FOLLOWED, description: `Followed ${target.username}.`, targetId, targetType: 'user' });
      await createNotification(tx, { userId: targetId, type: NotificationType.COMMUNITY, title: 'New follower', message: 'Someone started following you.', link: '/community', targetId, dedupeKey: `follow:${actorId}:${targetId}` });
    });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return { following: true, duplicate: true };
    throw error;
  }
  return { following: true, duplicate: false };
}

export async function unfollowUser(actorId: string, targetId: string) {
  const existing = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: actorId, followingId: targetId } }, select: { id: true } });
  if (!existing) return { following: false };
  await prisma.$transaction(async (tx) => {
    await tx.follow.delete({ where: { id: existing.id } });
    await createActivity(tx, { userId: actorId, type: UserActivityType.USER_UNFOLLOWED, description: 'Unfollowed a user.', targetId, targetType: 'user' });
  });
  return { following: false };
}

async function listUserIds(kind: 'followers'|'following', userId: string, limit: number, offset: number, viewerId?: string) {
  const blockedIds = viewerId ? await getBlockedUserIds(viewerId) : [];
  const base = kind === 'followers' ? { followingId: userId } : { followerId: userId };
  const where: Prisma.FollowWhereInput = blockedIds.length ? { ...base, ...(kind === 'followers' ? { followerId: { notIn: blockedIds } } : { followingId: { notIn: blockedIds } }) } : base;
  const select = kind === 'followers' ? { follower: { select: { id: true, username: true, profile: { select: { avatarUrl: true } } } } } : { following: { select: { id: true, username: true, profile: { select: { avatarUrl: true } } } } };
  const [rows, total] = await prisma.$transaction([
    prisma.follow.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: limit, select }),
    prisma.follow.count({ where }),
  ]);
  return { users: rows.map((row: any) => kind === 'followers' ? row.follower : row.following), total, limit, offset };
}
export const listFollowers = (userId: string, limit: number, offset: number, viewerId?: string) => listUserIds('followers', userId, limit, offset, viewerId);
export const listFollowing = (userId: string, limit: number, offset: number, viewerId?: string) => listUserIds('following', userId, limit, offset, viewerId);
export async function blockUser(actorId: string, targetId: string) {
  if (actorId === targetId) throw new ApiError(400, 'You cannot block yourself.', 'SELF_BLOCK');
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) throw new ApiError(404, 'User not found.', 'USER_NOT_FOUND');
  const existing = await prisma.block.findUnique({ where: { blockerId_blockedId: { blockerId: actorId, blockedId: targetId } }, select: { id: true } });
  if (existing) return { blocked: true, duplicate: true };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.block.create({ data: { blockerId: actorId, blockedId: targetId } });
      await tx.follow.deleteMany({ where: { OR: [{ followerId: actorId, followingId: targetId }, { followerId: targetId, followingId: actorId }] } });
      await createActivity(tx, { userId: actorId, type: UserActivityType.USER_BLOCKED, description: 'Blocked a user.', targetId, targetType: 'user' });
    });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return { blocked: true, duplicate: true };
    throw error;
  }
  return { blocked: true, duplicate: false };
}
export async function unblockUser(actorId: string, targetId: string) {
  const result = await prisma.block.deleteMany({ where: { blockerId: actorId, blockedId: targetId } });
  if (result.count) await prisma.$transaction(async (tx) => { await createActivity(tx, { userId: actorId, type: UserActivityType.USER_UNBLOCKED, description: 'Unblocked a user.', targetId, targetType: 'user' }); });
  return { blocked: false };
}
export async function listBlocked(actorId: string, limit: number, offset: number) {
  const where = { blockerId: actorId };
  const [rows, total] = await prisma.$transaction([
    prisma.block.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: limit, select: { blocked: { select: { id: true, username: true, profile: { select: { avatarUrl: true } } } } } }),
    prisma.block.count({ where }),
  ]);
  return { users: rows.map((row) => row.blocked), total, limit, offset };
}

export async function createReport(userId: string, input: ReportCreateInput) {
  let postId = input.postId ?? null;
  let commentId = input.commentId ?? null;
  if (commentId) {
    const comment = await prisma.communityComment.findUnique({ where: { id: commentId }, select: { id: true, postId: true, userId: true } });
    if (!comment) throw new ApiError(404, 'Comment not found.', 'COMMENT_NOT_FOUND');
    if (await blockPairExists(userId, comment.userId)) throw new ApiError(404, 'Comment not found.', 'COMMENT_NOT_FOUND');
  }
  if (postId) {
    const post = await prisma.communityPost.findUnique({ where: { id: postId }, select: { id: true, userId: true } });
    if (!post) throw new ApiError(404, 'Post not found.', 'POST_NOT_FOUND');
    if (await blockPairExists(userId, post.userId)) throw new ApiError(404, 'Post not found.', 'POST_NOT_FOUND');
  }
  try {
    const report = await prisma.$transaction(async (tx) => {
      const created = await tx.communityReport.create({ data: { reporterId: userId, postId, commentId, reason: input.reason as CommunityReportReason, description: input.description ?? null } });
      await createActivity(tx, { userId, type: UserActivityType.COMMUNITY_REPORT_CREATED, description: 'Submitted a community report.', targetId: created.id, targetType: 'community_report' });
      return created;
    });
    return { id: report.id, status: report.status, createdAt: report.createdAt };
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') throw new ApiError(409, 'You have already reported this content.', 'REPORT_ALREADY_EXISTS');
    throw error;
  }
}

export async function listReports(status: CommunityReportStatus | undefined, limit: number, offset: number) {
  const where: Prisma.CommunityReportWhereInput = status ? { status } : {};
  const [rows, total] = await prisma.$transaction([
    prisma.communityReport.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: limit, select: {
      id: true, reason: true, description: true, status: true, createdAt: true, resolvedAt: true,
      reporter: { select: { id: true, username: true } },
      post: { select: { id: true, title: true, content: true, category: true, user: { select: { id: true, username: true } } } },
      comment: { select: { id: true, content: true, postId: true, user: { select: { id: true, username: true } } } },
      resolver: { select: { id: true, username: true } },
    } }),
    prisma.communityReport.count({ where }),
  ]);
  return { reports: rows, total, limit, offset };
}

export async function resolveReport(adminId: string, reportId: string, status: CommunityReportStatus) {
  if (status !== CommunityReportStatus.REVIEWED && status !== CommunityReportStatus.RESOLVED && status !== CommunityReportStatus.DISMISSED) throw new ApiError(400, 'Invalid moderation status.', 'INVALID_REPORT_STATUS');
  const report = await prisma.communityReport.findUnique({ where: { id: reportId }, select: { id: true, status: true, reporterId: true } });
  if (!report) throw new ApiError(404, 'Report not found.', 'REPORT_NOT_FOUND');
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.communityReport.update({ where: { id: reportId }, data: { status, resolvedAt: status === CommunityReportStatus.RESOLVED || status === CommunityReportStatus.DISMISSED ? new Date() : null, resolvedBy: status === CommunityReportStatus.RESOLVED || status === CommunityReportStatus.DISMISSED ? adminId : null }, select: { id: true, status: true, resolvedAt: true } });
    await createActivity(tx, { userId: adminId, type: UserActivityType.COMMUNITY_REPORT_RESOLVED, description: `Updated a community report to ${status.toLowerCase()}.`, targetId: reportId, targetType: 'community_report' });
    if (report.reporterId !== adminId) await createNotification(tx, { userId: report.reporterId, type: NotificationType.COMMUNITY, title: 'Report updated', message: 'A community report you submitted was reviewed.', link: '/notifications', targetId: reportId, dedupeKey: `report-resolved:${reportId}:${status}` });
    return result;
  });
  return updated;
}

export async function getAdminReport(reportId: string) {
  const report = await prisma.communityReport.findUnique({ where: { id: reportId }, select: {
    id: true, reason: true, description: true, status: true, createdAt: true, resolvedAt: true,
    reporter: { select: { id: true, username: true } },
    post: { select: { id: true, title: true, content: true, category: true, user: { select: { id: true, username: true } } } },
    comment: { select: { id: true, content: true, postId: true, user: { select: { id: true, username: true } } } },
    resolver: { select: { id: true, username: true } },
  } });
  if (!report) throw new ApiError(404, 'Report not found.', 'REPORT_NOT_FOUND');
  return report;
}
