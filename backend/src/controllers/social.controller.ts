import { Request, Response } from 'express';
import * as social from '../services/social.service';
import { communityFeedQuerySchema, communityCommentListQuerySchema, communityPostCreateSchema, communityPostUpdateSchema, communityCommentCreateSchema, communityCommentUpdateSchema, postIdParamSchema, commentIdParamSchema, userIdParamSchema, userListQuerySchema, reportCreateSchema, profileUpdateSchema, reportListQuerySchema, reportIdParamSchema, reportResolutionSchema } from '../validation/community.schema';

export async function getCommunityFeed(req: Request, res: Response) { const q = communityFeedQuerySchema.parse(req.query); res.json(await social.listPosts(req.user!.id, q)); }
export async function getCommunityPost(req: Request, res: Response) { const { id } = postIdParamSchema.parse(req.params); res.json({ post: await social.getPost(req.user!.id, id) }); }
export async function getCommunityComments(req: Request, res: Response) { const { id } = postIdParamSchema.parse(req.params); const q = communityCommentListQuerySchema.parse(req.query); res.json(await social.listComments(req.user!.id, id, q.limit, q.offset)); }
export async function createCommunityPost(req: Request, res: Response) { res.status(201).json({ post: await social.createPost(req.user!.id, communityPostCreateSchema.parse(req.body)) }); }
export async function updateCommunityPost(req: Request, res: Response) { const { id } = postIdParamSchema.parse(req.params); res.json({ post: await social.updatePost(req.user!.id, id, communityPostUpdateSchema.parse(req.body)) }); }
export async function deleteCommunityPost(req: Request, res: Response) { const { id } = postIdParamSchema.parse(req.params); res.json(await social.deletePost(req.user!.id, id)); }
export async function createCommunityComment(req: Request, res: Response) { const { id } = postIdParamSchema.parse(req.params); res.status(201).json({ comment: await social.createComment(req.user!.id, id, communityCommentCreateSchema.parse(req.body)) }); }
export async function updateCommunityComment(req: Request, res: Response) { const { id, commentId } = commentIdParamSchema.parse(req.params); res.json({ comment: await social.updateComment(req.user!.id, id, commentId, communityCommentUpdateSchema.parse(req.body)) }); }
export async function deleteCommunityComment(req: Request, res: Response) { const { id, commentId } = commentIdParamSchema.parse(req.params); res.json(await social.deleteComment(req.user!.id, id, commentId)); }
export async function addPostReaction(req: Request, res: Response) { const { id } = postIdParamSchema.parse(req.params); res.json(await social.addReaction(req.user!.id, id)); }
export async function removePostReaction(req: Request, res: Response) { const { id } = postIdParamSchema.parse(req.params); res.json(await social.removeReaction(req.user!.id, id)); }
export async function reportCommunityContent(req: Request, res: Response) { res.status(201).json({ report: await social.createReport(req.user!.id, reportCreateSchema.parse(req.body)) }); }

export async function getProfile(req: Request, res: Response) { const { id } = userIdParamSchema.parse(req.params); res.json({ profile: await social.getPublicProfile(req.user?.id ?? null, id) }); }
export async function getMyProfile(req: Request, res: Response) { res.json({ profile: await social.getPublicProfile(req.user!.id, req.user!.id) }); }
export async function patchMyProfile(req: Request, res: Response) { res.json({ profile: await social.updateOwnProfile(req.user!.id, profileUpdateSchema.parse(req.body)) }); }
export async function followUser(req: Request, res: Response) { const { id } = userIdParamSchema.parse(req.params); res.status(201).json(await social.followUser(req.user!.id, id)); }
export async function unfollowUser(req: Request, res: Response) { const { id } = userIdParamSchema.parse(req.params); res.json(await social.unfollowUser(req.user!.id, id)); }
export async function getFollowers(req: Request, res: Response) { const { id } = userIdParamSchema.parse(req.params); const q = userListQuerySchema.parse(req.query); res.json(await social.listFollowers(id, q.limit, q.offset, req.user!.id)); }
export async function getFollowing(req: Request, res: Response) { const { id } = userIdParamSchema.parse(req.params); const q = userListQuerySchema.parse(req.query); res.json(await social.listFollowing(id, q.limit, q.offset, req.user!.id)); }
export async function blockUser(req: Request, res: Response) { const { id } = userIdParamSchema.parse(req.params); res.status(201).json(await social.blockUser(req.user!.id, id)); }
export async function unblockUser(req: Request, res: Response) { const { id } = userIdParamSchema.parse(req.params); res.json(await social.unblockUser(req.user!.id, id)); }
export async function getBlockedUsers(req: Request, res: Response) { const q = userListQuerySchema.parse(req.query); res.json(await social.listBlocked(req.user!.id, q.limit, q.offset)); }

export async function getAdminReports(req: Request, res: Response) { const q = reportListQuerySchema.parse(req.query); res.json(await social.listReports(q.status, q.limit, q.offset)); }
export async function resolveAdminReport(req: Request, res: Response) { const { id } = reportIdParamSchema.parse(req.params); const input = reportResolutionSchema.parse(req.body); res.json({ report: await social.resolveReport(req.user!.id, id, input.status as any) }); }
export async function getAdminReport(req: Request, res: Response) { const { id } = reportIdParamSchema.parse(req.params); res.json({ report: await social.getAdminReport(id) }); }
export async function adminDeletePost(req: Request, res: Response) { const { id } = postIdParamSchema.parse(req.params); res.json(await social.deletePost(req.user!.id, id, true)); }
export async function adminDeleteComment(req: Request, res: Response) { const { id, commentId } = commentIdParamSchema.parse(req.params); res.json(await social.deleteComment(req.user!.id, id, commentId, true)); }
