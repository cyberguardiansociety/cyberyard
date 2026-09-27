/**
 * Canonical enum values for the whole platform.
 *
 * SQLite has no native enum type — Prisma models enum fields as TEXT — so
 * these const objects plus string-literal unions are the single source of
 * truth for every enum-like column (role, statuses, notification/activity
 * types, security events, …).
 *
 * Why this shape:
 *   * Call sites keep the familiar `NotificationType.CHALLENGE_SOLVED`
 *     syntax with zero behavioral change — only the import path moves.
 *   * `export type X = (typeof X)[keyof typeof X]` gives TypeScript a
 *     closed union: assigning an unknown status stops compiling, which is
 *     exactly the constraint the database can no longer provide.
 *   * The `*_VALUES` tuples feed zod (`z.enum(ROLE_VALUES)`) so request
 *     validation is exhaustive and typo-proof.
 *
 * When adding a value: add it here first, then in the Prisma schema doc
 * comment for that field, and (for a fresh database) nothing else — the
 * SQLite init migration stores whatever string the app writes.
 */

export const Role = { USER: 'USER', ADMIN: 'ADMIN' } as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ROLE_VALUES = ['USER', 'ADMIN'] as const satisfies readonly Role[];

export const ChallengeStatus = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' } as const;
export type ChallengeStatus = (typeof ChallengeStatus)[keyof typeof ChallengeStatus];
export const CHALLENGE_STATUS_VALUES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const satisfies readonly ChallengeStatus[];

export const NotificationType = {
  CHALLENGE_PUBLISHED: 'CHALLENGE_PUBLISHED',
  CHALLENGE_SOLVED: 'CHALLENGE_SOLVED',
  FIRST_BLOOD: 'FIRST_BLOOD',
  BADGE_EARNED: 'BADGE_EARNED',
  SYSTEM: 'SYSTEM',
  COMMUNITY: 'COMMUNITY',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
export const NOTIFICATION_TYPE_VALUES = [
  'CHALLENGE_PUBLISHED', 'CHALLENGE_SOLVED', 'FIRST_BLOOD', 'BADGE_EARNED', 'SYSTEM', 'COMMUNITY',
] as const satisfies readonly NotificationType[];

export const UserActivityType = {
  ACCOUNT_REGISTERED: 'ACCOUNT_REGISTERED',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  CHALLENGE_SOLVED: 'CHALLENGE_SOLVED',
  FIRST_BLOOD: 'FIRST_BLOOD',
  BADGE_EARNED: 'BADGE_EARNED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  COMMUNITY_POST_CREATED: 'COMMUNITY_POST_CREATED',
  COMMUNITY_POST_UPDATED: 'COMMUNITY_POST_UPDATED',
  COMMUNITY_POST_DELETED: 'COMMUNITY_POST_DELETED',
  COMMUNITY_COMMENT_CREATED: 'COMMUNITY_COMMENT_CREATED',
  COMMUNITY_COMMENT_UPDATED: 'COMMUNITY_COMMENT_UPDATED',
  COMMUNITY_COMMENT_DELETED: 'COMMUNITY_COMMENT_DELETED',
  COMMUNITY_REACTION_ADDED: 'COMMUNITY_REACTION_ADDED',
  COMMUNITY_REACTION_REMOVED: 'COMMUNITY_REACTION_REMOVED',
  USER_FOLLOWED: 'USER_FOLLOWED',
  USER_UNFOLLOWED: 'USER_UNFOLLOWED',
  USER_BLOCKED: 'USER_BLOCKED',
  USER_UNBLOCKED: 'USER_UNBLOCKED',
  COMMUNITY_REPORT_CREATED: 'COMMUNITY_REPORT_CREATED',
  COMMUNITY_REPORT_RESOLVED: 'COMMUNITY_REPORT_RESOLVED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  LEVEL_UP: 'LEVEL_UP',
  STREAK_MILESTONE: 'STREAK_MILESTONE',
  EVENT_REGISTERED: 'EVENT_REGISTERED',
  EVENT_UNREGISTERED: 'EVENT_UNREGISTERED',
  EVENT_ANNOUNCEMENT_CREATED: 'EVENT_ANNOUNCEMENT_CREATED',
  EVENT_CREATED: 'EVENT_CREATED',
  EVENT_UPDATED: 'EVENT_UPDATED',
  EVENT_PUBLISHED: 'EVENT_PUBLISHED',
  EVENT_ARCHIVED: 'EVENT_ARCHIVED',
  EVENT_CHALLENGE_CHANGED: 'EVENT_CHALLENGE_CHANGED',
  TEAM_CREATED: 'TEAM_CREATED',
  TEAM_JOINED: 'TEAM_JOINED',
  TEAM_LEFT: 'TEAM_LEFT',
  TEAM_DISSOLVED: 'TEAM_DISSOLVED',
} as const;
export type UserActivityType = (typeof UserActivityType)[keyof typeof UserActivityType];
export const USER_ACTIVITY_TYPE_VALUES = Object.values(UserActivityType) as readonly UserActivityType[];

export const XpTransactionSource = {
  CHALLENGE_SOLVE: 'CHALLENGE_SOLVE',
  FIRST_BLOOD: 'FIRST_BLOOD',
  BADGE_EARNED: 'BADGE_EARNED',
} as const;
export type XpTransactionSource = (typeof XpTransactionSource)[keyof typeof XpTransactionSource];
export const XP_TRANSACTION_SOURCE_VALUES = Object.values(XpTransactionSource) as readonly XpTransactionSource[];

export const TeamRole = { CAPTAIN: 'CAPTAIN', MEMBER: 'MEMBER' } as const;
export type TeamRole = (typeof TeamRole)[keyof typeof TeamRole];
export const TEAM_ROLE_VALUES = ['CAPTAIN', 'MEMBER'] as const satisfies readonly TeamRole[];

export const ScoringMode = { STATIC: 'STATIC', DYNAMIC: 'DYNAMIC' } as const;
export type ScoringMode = (typeof ScoringMode)[keyof typeof ScoringMode];
export const SCORING_MODE_VALUES = ['STATIC', 'DYNAMIC'] as const satisfies readonly ScoringMode[];

export const FlagMode = { STATIC: 'STATIC', DYNAMIC: 'DYNAMIC' } as const;
export type FlagMode = (typeof FlagMode)[keyof typeof FlagMode];
export const FLAG_MODE_VALUES = ['STATIC', 'DYNAMIC'] as const satisfies readonly FlagMode[];

export const CommunityCategory = {
  GENERAL: 'GENERAL',
  CTF: 'CTF',
  WEB_SECURITY: 'WEB_SECURITY',
  NETWORK_SECURITY: 'NETWORK_SECURITY',
  CRYPTOGRAPHY: 'CRYPTOGRAPHY',
  FORENSICS: 'FORENSICS',
  REVERSE_ENGINEERING: 'REVERSE_ENGINEERING',
  OSINT: 'OSINT',
  LEARNING: 'LEARNING',
  ANNOUNCEMENTS: 'ANNOUNCEMENTS',
} as const;
export type CommunityCategory = (typeof CommunityCategory)[keyof typeof CommunityCategory];
export const COMMUNITY_CATEGORY_VALUES = Object.values(CommunityCategory) as readonly CommunityCategory[];

export const CommunityReactionType = { LIKE: 'LIKE' } as const;
export type CommunityReactionType = (typeof CommunityReactionType)[keyof typeof CommunityReactionType];
export const COMMUNITY_REACTION_TYPE_VALUES = Object.values(CommunityReactionType) as readonly CommunityReactionType[];

export const CommunityReportReason = {
  SPAM: 'SPAM',
  HARASSMENT: 'HARASSMENT',
  ABUSE: 'ABUSE',
  OFFENSIVE_CONTENT: 'OFFENSIVE_CONTENT',
  MALICIOUS_CONTENT: 'MALICIOUS_CONTENT',
  SECURITY_ABUSE: 'SECURITY_ABUSE',
  OTHER: 'OTHER',
} as const;
export type CommunityReportReason = (typeof CommunityReportReason)[keyof typeof CommunityReportReason];
export const COMMUNITY_REPORT_REASON_VALUES = Object.values(CommunityReportReason) as readonly CommunityReportReason[];

export const CommunityReportStatus = {
  PENDING: 'PENDING',
  REVIEWED: 'REVIEWED',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const;
export type CommunityReportStatus = (typeof CommunityReportStatus)[keyof typeof CommunityReportStatus];
export const COMMUNITY_REPORT_STATUS_VALUES = Object.values(CommunityReportStatus) as readonly CommunityReportStatus[];

export const SecurityEventType = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETION: 'PASSWORD_RESET_COMPLETION',
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  SESSION_REVOKED: 'SESSION_REVOKED',
  ADMIN_CHALLENGE_CREATED: 'ADMIN_CHALLENGE_CREATED',
  ADMIN_CHALLENGE_UPDATED: 'ADMIN_CHALLENGE_UPDATED',
  ADMIN_CHALLENGE_PUBLISHED: 'ADMIN_CHALLENGE_PUBLISHED',
  ADMIN_CHALLENGE_UNPUBLISHED: 'ADMIN_CHALLENGE_UNPUBLISHED',
  ADMIN_CHALLENGE_ARCHIVED: 'ADMIN_CHALLENGE_ARCHIVED',
  ADMIN_CHALLENGE_DELETED: 'ADMIN_CHALLENGE_DELETED',
  ADMIN_HINT_CHANGED: 'ADMIN_HINT_CHANGED',
  ADMIN_WRITEUP_CHANGED: 'ADMIN_WRITEUP_CHANGED',
  ADMIN_CHALLENGE_FILE_CHANGED: 'ADMIN_CHALLENGE_FILE_CHANGED',
  ADMIN_CHALLENGE_FLAG_CHANGED: 'ADMIN_CHALLENGE_FLAG_CHANGED',
} as const;
export type SecurityEventType = (typeof SecurityEventType)[keyof typeof SecurityEventType];
export const SECURITY_EVENT_TYPE_VALUES = Object.values(SecurityEventType) as readonly SecurityEventType[];

export const EventStatus = {
  DRAFT: 'DRAFT',
  UPCOMING: 'UPCOMING',
  LIVE: 'LIVE',
  ENDED: 'ENDED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];
export const EVENT_STATUS_VALUES = ['DRAFT', 'UPCOMING', 'LIVE', 'ENDED', 'ARCHIVED'] as const satisfies readonly EventStatus[];
