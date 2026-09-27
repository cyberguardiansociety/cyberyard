-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "last_login_at" DATETIME,
    "email_verified_at" DATETIME
);

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "bio" TEXT,
    "avatar_url" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "theme" TEXT NOT NULL DEFAULT 'default',
    "notify_challenge_updates" BOOLEAN NOT NULL DEFAULT true,
    "notify_leaderboard_alerts" BOOLEAN NOT NULL DEFAULT false,
    "notify_product_news" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "target_id" TEXT,
    "read_at" DATETIME,
    "dedupe_key" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ACCOUNT_REGISTERED',
    "description" TEXT NOT NULL,
    "target_id" TEXT,
    "target_type" TEXT,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "gamification_profiles" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "current_level" INTEGER NOT NULL DEFAULT 1,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_qualifying_solve_date" DATETIME,
    "blood_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "gamification_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "xp_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CHALLENGE_SOLVE',
    "event_key" TEXT NOT NULL,
    "target_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "xp_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "invite_code" TEXT NOT NULL,
    "captain_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "teams_captain_id_fkey" FOREIGN KEY ("captain_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "score_adjustments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "score_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "score_adjustments_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "target_challenge_id" TEXT,
    "type" TEXT NOT NULL DEFAULT 'LOGIN_SUCCESS',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challenge_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "hints_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hint_unlocks" (
    "user_id" TEXT NOT NULL,
    "hint_id" TEXT NOT NULL,
    "cost_paid" INTEGER NOT NULL,
    "unlocked_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("user_id", "hint_id"),
    CONSTRAINT "hint_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hint_unlocks_hint_id_fkey" FOREIGN KEY ("hint_id") REFERENCES "hints" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "challenge_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challenge_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "challenge_files_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "writeups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "challenge_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "writeups_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "criteria" TEXT NOT NULL DEFAULT '{}',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "user_badges" (
    "user_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "awarded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("user_id", "badge_id"),
    CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "follower_id" TEXT NOT NULL,
    "following_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "community_posts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "community_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "community_comments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "community_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "community_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "community_reactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LIKE',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "community_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "community_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "community_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reporter_id" TEXT NOT NULL,
    "post_id" TEXT,
    "comment_id" TEXT,
    "reason" TEXT NOT NULL DEFAULT 'SPAM',
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME,
    "resolved_by" TEXT,
    CONSTRAINT "community_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "community_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "community_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "community_comments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "community_reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "short_description" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "start_at" DATETIME NOT NULL,
    "end_at" DATETIME NOT NULL,
    "registration_start_at" DATETIME NOT NULL,
    "registration_end_at" DATETIME NOT NULL,
    "max_participants" INTEGER,
    "registration_required" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "registered_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "event_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "event_challenges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "available_from" DATETIME,
    "available_until" DATETIME,
    CONSTRAINT "event_challenges_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "event_challenges_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "event_announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "event_announcements_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "event_announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "categories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "difficulties" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "difficulty_id" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "scoring_mode" TEXT NOT NULL DEFAULT 'STATIC',
    "teaser" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" DATETIME,
    "archived_at" DATETIME,
    "created_by" TEXT,
    "prerequisite_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "challenges_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "challenges_difficulty_id_fkey" FOREIGN KEY ("difficulty_id") REFERENCES "difficulties" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "challenges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "challenges_prerequisite_id_fkey" FOREIGN KEY ("prerequisite_id") REFERENCES "challenges" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "first_bloods" (
    "challenge_id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "solved_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "first_bloods_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "first_bloods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "flags" (
    "challenge_id" TEXT NOT NULL PRIMARY KEY,
    "flag_hash" TEXT NOT NULL,
    "case_sensitive" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'STATIC',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "flags_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "submitted_value_hash" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "ip_address" TEXT,
    "submitted_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "submissions_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "solves" (
    "user_id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "solved_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "points_awarded" INTEGER NOT NULL,

    PRIMARY KEY ("user_id", "challenge_id"),
    CONSTRAINT "solves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "solves_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_type_created_at_idx" ON "notifications"("type", "created_at");

-- CreateIndex
CREATE INDEX "user_activities_user_id_idx" ON "user_activities"("user_id");

-- CreateIndex
CREATE INDEX "user_activities_user_id_created_at_idx" ON "user_activities"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "user_activities_type_created_at_idx" ON "user_activities"("type", "created_at");

-- CreateIndex
CREATE INDEX "gamification_profiles_total_xp_idx" ON "gamification_profiles"("total_xp");

-- CreateIndex
CREATE INDEX "gamification_profiles_current_level_idx" ON "gamification_profiles"("current_level");

-- CreateIndex
CREATE UNIQUE INDEX "xp_transactions_event_key_key" ON "xp_transactions"("event_key");

-- CreateIndex
CREATE INDEX "xp_transactions_user_id_created_at_idx" ON "xp_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "xp_transactions_user_id_source_created_at_idx" ON "xp_transactions"("user_id", "source", "created_at");

-- CreateIndex
CREATE INDEX "xp_transactions_target_id_idx" ON "xp_transactions"("target_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "teams_invite_code_key" ON "teams"("invite_code");

-- CreateIndex
CREATE INDEX "teams_captain_id_idx" ON "teams"("captain_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_user_id_key" ON "team_members"("user_id");

-- CreateIndex
CREATE INDEX "team_members_team_id_idx" ON "team_members"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");

-- CreateIndex
CREATE INDEX "score_adjustments_user_id_idx" ON "score_adjustments"("user_id");

-- CreateIndex
CREATE INDEX "score_adjustments_created_at_idx" ON "score_adjustments"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_expires_at_idx" ON "password_reset_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_expires_at_idx" ON "email_verification_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "security_events_user_id_created_at_idx" ON "security_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "security_events_target_challenge_id_created_at_idx" ON "security_events"("target_challenge_id", "created_at");

-- CreateIndex
CREATE INDEX "security_events_type_created_at_idx" ON "security_events"("type", "created_at");

-- CreateIndex
CREATE INDEX "hints_challenge_id_sort_order_idx" ON "hints"("challenge_id", "sort_order");

-- CreateIndex
CREATE INDEX "hint_unlocks_hint_id_idx" ON "hint_unlocks"("hint_id");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_files_storage_name_key" ON "challenge_files"("storage_name");

-- CreateIndex
CREATE INDEX "challenge_files_challenge_id_idx" ON "challenge_files"("challenge_id");

-- CreateIndex
CREATE UNIQUE INDEX "writeups_challenge_id_key" ON "writeups"("challenge_id");

-- CreateIndex
CREATE UNIQUE INDEX "badges_slug_key" ON "badges"("slug");

-- CreateIndex
CREATE INDEX "badges_is_enabled_idx" ON "badges"("is_enabled");

-- CreateIndex
CREATE INDEX "user_badges_badge_id_idx" ON "user_badges"("badge_id");

-- CreateIndex
CREATE INDEX "user_badges_user_id_awarded_at_idx" ON "user_badges"("user_id", "awarded_at");

-- CreateIndex
CREATE INDEX "follows_follower_id_created_at_idx" ON "follows"("follower_id", "created_at");

-- CreateIndex
CREATE INDEX "follows_following_id_created_at_idx" ON "follows"("following_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "follows_follower_id_following_id_key" ON "follows"("follower_id", "following_id");

-- CreateIndex
CREATE INDEX "blocks_blocker_id_created_at_idx" ON "blocks"("blocker_id", "created_at");

-- CreateIndex
CREATE INDEX "blocks_blocked_id_created_at_idx" ON "blocks"("blocked_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "blocks_blocker_id_blocked_id_key" ON "blocks"("blocker_id", "blocked_id");

-- CreateIndex
CREATE INDEX "community_posts_created_at_idx" ON "community_posts"("created_at");

-- CreateIndex
CREATE INDEX "community_posts_category_created_at_idx" ON "community_posts"("category", "created_at");

-- CreateIndex
CREATE INDEX "community_posts_user_id_created_at_idx" ON "community_posts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "community_comments_post_id_created_at_idx" ON "community_comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "community_comments_user_id_created_at_idx" ON "community_comments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "community_reactions_post_id_created_at_idx" ON "community_reactions"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "community_reactions_user_id_created_at_idx" ON "community_reactions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "community_reactions_user_id_post_id_type_key" ON "community_reactions"("user_id", "post_id", "type");

-- CreateIndex
CREATE INDEX "community_reports_status_created_at_idx" ON "community_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "community_reports_post_id_idx" ON "community_reports"("post_id");

-- CreateIndex
CREATE INDEX "community_reports_comment_id_idx" ON "community_reports"("comment_id");

-- CreateIndex
CREATE INDEX "community_reports_reporter_id_created_at_idx" ON "community_reports"("reporter_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "community_reports_reporter_id_post_id_key" ON "community_reports"("reporter_id", "post_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_reports_reporter_id_comment_id_key" ON "community_reports"("reporter_id", "comment_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_status_start_at_idx" ON "events"("status", "start_at");

-- CreateIndex
CREATE INDEX "events_status_end_at_idx" ON "events"("status", "end_at");

-- CreateIndex
CREATE INDEX "events_registration_start_at_registration_end_at_idx" ON "events"("registration_start_at", "registration_end_at");

-- CreateIndex
CREATE INDEX "events_created_by_created_at_idx" ON "events"("created_by", "created_at");

-- CreateIndex
CREATE INDEX "event_registrations_event_id_registered_at_idx" ON "event_registrations"("event_id", "registered_at");

-- CreateIndex
CREATE INDEX "event_registrations_user_id_registered_at_idx" ON "event_registrations"("user_id", "registered_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_user_id_event_id_key" ON "event_registrations"("user_id", "event_id");

-- CreateIndex
CREATE INDEX "event_challenges_event_id_position_idx" ON "event_challenges"("event_id", "position");

-- CreateIndex
CREATE INDEX "event_challenges_challenge_id_event_id_idx" ON "event_challenges"("challenge_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_challenges_event_id_challenge_id_key" ON "event_challenges"("event_id", "challenge_id");

-- CreateIndex
CREATE INDEX "event_announcements_event_id_created_at_idx" ON "event_announcements"("event_id", "created_at");

-- CreateIndex
CREATE INDEX "event_announcements_created_by_created_at_idx" ON "event_announcements"("created_by", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "difficulties_name_key" ON "difficulties"("name");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_slug_key" ON "challenges"("slug");

-- CreateIndex
CREATE INDEX "challenges_category_id_idx" ON "challenges"("category_id");

-- CreateIndex
CREATE INDEX "challenges_difficulty_id_idx" ON "challenges"("difficulty_id");

-- CreateIndex
CREATE INDEX "challenges_status_idx" ON "challenges"("status");

-- CreateIndex
CREATE INDEX "challenges_is_published_idx" ON "challenges"("is_published");

-- CreateIndex
CREATE INDEX "challenges_published_at_idx" ON "challenges"("published_at");

-- CreateIndex
CREATE INDEX "challenges_archived_at_idx" ON "challenges"("archived_at");

-- CreateIndex
CREATE INDEX "challenges_prerequisite_id_idx" ON "challenges"("prerequisite_id");

-- CreateIndex
CREATE INDEX "first_bloods_user_id_idx" ON "first_bloods"("user_id");

-- CreateIndex
CREATE INDEX "submissions_user_id_idx" ON "submissions"("user_id");

-- CreateIndex
CREATE INDEX "submissions_challenge_id_idx" ON "submissions"("challenge_id");

-- CreateIndex
CREATE INDEX "submissions_user_id_challenge_id_idx" ON "submissions"("user_id", "challenge_id");

-- CreateIndex
CREATE INDEX "submissions_submitted_at_idx" ON "submissions"("submitted_at");

-- CreateIndex
CREATE INDEX "solves_challenge_id_idx" ON "solves"("challenge_id");

