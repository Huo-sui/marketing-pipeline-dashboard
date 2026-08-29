-- CreateEnum
CREATE TYPE "LifecycleStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "AccountSessionStatus" AS ENUM ('login_required', 'verifying', 'healthy', 'needs_reauth', 'challenged', 'identity_mismatch');

-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('pending', 'ready', 'failed', 'deleted');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "SourceAction" AS ENUM ('unreviewed', 'engage', 'adapt', 'ignored');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('candidate', 'approved', 'rejected', 'generating', 'ready_for_review');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'waiting_review', 'cancelled');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('draft', 'approved', 'submitting', 'succeeded', 'failed_retryable', 'unknown_requires_review');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "target_markets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "LifecycleStatus" NOT NULL DEFAULT 'active',
    "prompt_pack_version" TEXT,
    "settings" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_config_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_packs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_pack_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "prompt_pack_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "prompts" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_pack_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_watches" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exclude_terms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cadence" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'running',
    "min_likes" INTEGER NOT NULL DEFAULT 0,
    "min_comments" INTEGER NOT NULL DEFAULT 0,
    "max_age_hours" INTEGER NOT NULL DEFAULT 24,
    "min_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "collector_account_binding_id" UUID,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_watch_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "topic_watch_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_watch_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "handle" TEXT NOT NULL DEFAULT '',
    "external_user_id" TEXT,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "profile_url" TEXT,
    "identity_confirmed_at" TIMESTAMP(3),
    "lifecycle_status" "LifecycleStatus" NOT NULL DEFAULT 'active',
    "sharing_policy" TEXT NOT NULL DEFAULT 'shared_workspace',
    "connector" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_runners" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "runner_type" TEXT NOT NULL,
    "profile_name" TEXT NOT NULL,
    "profile_ref" TEXT NOT NULL,
    "browser_environment_id" TEXT,
    "device_id" TEXT,
    "device_model" TEXT,
    "app_package" TEXT,
    "session_status" "AccountSessionStatus" NOT NULL DEFAULT 'login_required',
    "lock_state" TEXT NOT NULL DEFAULT 'available',
    "last_verified_at" TIMESTAMP(3),
    "last_health_check" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_runners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_identity_checks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "runner_id" UUID,
    "external_user_id" TEXT,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatar_url" TEXT,
    "profile_url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_identity_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_account_bindings" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_primary_discovery" BOOLEAN NOT NULL DEFAULT false,
    "is_primary_publishing" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_account_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_runs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "topic_watch_id" UUID,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL,
    "provider_version" TEXT,
    "trace_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "input_snapshot" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_posts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "canonical_hash" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "published_at" TIMESTAMP(3),
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "media_type" TEXT,
    "review_state" "ReviewStatus" NOT NULL DEFAULT 'pending',
    "action" "SourceAction" NOT NULL DEFAULT 'unreviewed',
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_post_matches" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_post_id" UUID NOT NULL,
    "topic_watch_id" UUID,
    "score" DOUBLE PRECISION,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_post_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_metric_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_post_id" UUID NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "views" INTEGER,
    "score" DOUBLE PRECISION,
    "raw_payload" JSONB,

    CONSTRAINT "source_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_reviews" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_post_id" UUID NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "action" "SourceAction" NOT NULL,
    "reason" TEXT,
    "reviewer" TEXT,
    "object_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_cards" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_post_id" UUID NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pattern_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_card_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "pattern_card_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "provider" TEXT,
    "provider_version" TEXT,
    "prompt_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pattern_card_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideas" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "IdeaStatus" NOT NULL DEFAULT 'candidate',
    "format" TEXT NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "generation_batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_revisions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "idea_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "hook" TEXT NOT NULL DEFAULT '',
    "copy" TEXT NOT NULL DEFAULT '',
    "video_spec" JSONB,
    "asset_decision" TEXT,
    "prompt_version" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idea_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_sources" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "idea_id" UUID NOT NULL,
    "source_post_id" UUID,
    "pattern_card_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idea_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idea_platform_targets" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "idea_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "locale" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idea_platform_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decisions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "status" "ReviewStatus" NOT NULL,
    "reason" TEXT,
    "reviewer" TEXT,
    "object_version" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "usage" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'available',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "artifact_id" UUID,
    "version" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "kind" TEXT NOT NULL,
    "storage_provider" TEXT NOT NULL DEFAULT 'local',
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifact_links" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "artifact_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_specs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "idea_id" UUID NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creative_specs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_spec_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "creative_spec_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "provider" TEXT,
    "prompt_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_spec_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_runs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "idea_id" UUID,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL,
    "provider_version" TEXT,
    "prompt_version" TEXT,
    "trace_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "input_snapshot" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_attempts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "generation_run_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "RunStatus" NOT NULL,
    "provider_params" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_outputs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "generation_run_id" UUID NOT NULL,
    "attempt_id" UUID,
    "artifact_id" UUID,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_batches" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_renditions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "idea_id" UUID,
    "release_batch_id" UUID,
    "platform" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "copy" TEXT NOT NULL DEFAULT '',
    "artifact_id" UUID,
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_renditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_drafts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "rendition_id" UUID,
    "account_id" UUID,
    "platform" TEXT NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMP(3),
    "idempotency_key" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publication_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_attempts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "publication_draft_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "PublicationStatus" NOT NULL,
    "external_request_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "evidence_artifact_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_receipts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "publication_draft_id" UUID NOT NULL,
    "platform_post_id" TEXT,
    "canonical_url" TEXT,
    "published_at" TIMESTAMP(3),
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publication_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL,
    "provider_version" TEXT,
    "prompt_version" TEXT,
    "trace_id" TEXT NOT NULL,
    "input_artifact_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "output_artifact_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "input_snapshot" JSONB,
    "output_snapshot" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "provider" TEXT NOT NULL,
    "provider_version" TEXT,
    "prompt_version" TEXT,
    "trace_id" TEXT NOT NULL,
    "input_count" INTEGER NOT NULL DEFAULT 0,
    "output_count" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "event_type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "project_id" UUID,
    "actor" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_workspace_id_status_idx" ON "projects"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "project_config_versions_workspace_id_project_id_idx" ON "project_config_versions"("workspace_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_config_versions_project_id_version_key" ON "project_config_versions"("project_id", "version");

-- CreateIndex
CREATE INDEX "prompt_packs_workspace_id_project_id_idx" ON "prompt_packs"("workspace_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_pack_versions_prompt_pack_id_version_key" ON "prompt_pack_versions"("prompt_pack_id", "version");

-- CreateIndex
CREATE INDEX "topic_watches_workspace_id_project_id_state_idx" ON "topic_watches"("workspace_id", "project_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "topic_watch_versions_topic_watch_id_version_key" ON "topic_watch_versions"("topic_watch_id", "version");

-- CreateIndex
CREATE INDEX "social_accounts_workspace_id_lifecycle_status_idx" ON "social_accounts"("workspace_id", "lifecycle_status");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_workspace_id_platform_external_user_id_key" ON "social_accounts"("workspace_id", "platform", "external_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_runners_workspace_id_account_id_key" ON "account_runners"("workspace_id", "account_id");

-- CreateIndex
CREATE INDEX "account_identity_checks_workspace_id_account_id_detected_at_idx" ON "account_identity_checks"("workspace_id", "account_id", "detected_at");

-- CreateIndex
CREATE INDEX "project_account_bindings_workspace_id_project_id_idx" ON "project_account_bindings"("workspace_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_account_bindings_project_id_account_id_key" ON "project_account_bindings"("project_id", "account_id");

-- CreateIndex
CREATE INDEX "collection_runs_workspace_id_project_id_status_idx" ON "collection_runs"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "collection_runs_workspace_id_idempotency_key_key" ON "collection_runs"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "source_posts_workspace_id_project_id_review_state_idx" ON "source_posts"("workspace_id", "project_id", "review_state");

-- CreateIndex
CREATE UNIQUE INDEX "source_posts_platform_external_id_key" ON "source_posts"("platform", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_posts_platform_canonical_hash_key" ON "source_posts"("platform", "canonical_hash");

-- CreateIndex
CREATE UNIQUE INDEX "source_post_matches_source_post_id_topic_watch_id_key" ON "source_post_matches"("source_post_id", "topic_watch_id");

-- CreateIndex
CREATE INDEX "source_metric_snapshots_source_post_id_captured_at_idx" ON "source_metric_snapshots"("source_post_id", "captured_at");

-- CreateIndex
CREATE INDEX "source_reviews_workspace_id_project_id_source_post_id_idx" ON "source_reviews"("workspace_id", "project_id", "source_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "pattern_cards_source_post_id_key" ON "pattern_cards"("source_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "pattern_card_versions_pattern_card_id_version_key" ON "pattern_card_versions"("pattern_card_id", "version");

-- CreateIndex
CREATE INDEX "ideas_workspace_id_project_id_status_idx" ON "ideas"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "idea_revisions_idea_id_version_key" ON "idea_revisions"("idea_id", "version");

-- CreateIndex
CREATE INDEX "idea_sources_idea_id_idx" ON "idea_sources"("idea_id");

-- CreateIndex
CREATE UNIQUE INDEX "idea_platform_targets_idea_id_platform_locale_key" ON "idea_platform_targets"("idea_id", "platform", "locale");

-- CreateIndex
CREATE INDEX "review_decisions_workspace_id_project_id_entity_type_entity_idx" ON "review_decisions"("workspace_id", "project_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "assets_workspace_id_project_id_status_idx" ON "assets"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "asset_versions_asset_id_version_key" ON "asset_versions"("asset_id", "version");

-- CreateIndex
CREATE INDEX "artifacts_workspace_id_project_id_kind_status_idx" ON "artifacts"("workspace_id", "project_id", "kind", "status");

-- CreateIndex
CREATE INDEX "artifacts_sha256_idx" ON "artifacts"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_storage_provider_storage_key_key" ON "artifacts"("storage_provider", "storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "artifact_links_artifact_id_entity_type_entity_id_role_key" ON "artifact_links"("artifact_id", "entity_type", "entity_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "creative_specs_idea_id_key" ON "creative_specs"("idea_id");

-- CreateIndex
CREATE UNIQUE INDEX "creative_spec_versions_creative_spec_id_version_key" ON "creative_spec_versions"("creative_spec_id", "version");

-- CreateIndex
CREATE INDEX "generation_runs_workspace_id_project_id_status_idx" ON "generation_runs"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "generation_runs_workspace_id_idempotency_key_key" ON "generation_runs"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "generation_attempts_generation_run_id_attempt_no_key" ON "generation_attempts"("generation_run_id", "attempt_no");

-- CreateIndex
CREATE INDEX "generation_outputs_generation_run_id_idx" ON "generation_outputs"("generation_run_id");

-- CreateIndex
CREATE INDEX "release_batches_workspace_id_project_id_status_idx" ON "release_batches"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "platform_renditions_workspace_id_project_id_platform_locale_idx" ON "platform_renditions"("workspace_id", "project_id", "platform", "locale");

-- CreateIndex
CREATE INDEX "publication_drafts_workspace_id_project_id_status_idx" ON "publication_drafts"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "publication_drafts_workspace_id_idempotency_key_key" ON "publication_drafts"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "publication_attempts_publication_draft_id_attempt_no_key" ON "publication_attempts"("publication_draft_id", "attempt_no");

-- CreateIndex
CREATE INDEX "publication_receipts_publication_draft_id_idx" ON "publication_receipts"("publication_draft_id");

-- CreateIndex
CREATE INDEX "agent_runs_workspace_id_project_id_status_idx" ON "agent_runs"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "runs_workspace_id_project_id_status_idx" ON "runs"("workspace_id", "project_id", "status");

-- CreateIndex
CREATE INDEX "run_events_run_id_created_at_idx" ON "run_events"("run_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_project_id_created_at_idx" ON "audit_logs"("workspace_id", "project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_workspace_id_key_operation_key" ON "idempotency_keys"("workspace_id", "key", "operation");

-- Core ownership constraints keep records inside their Workspace and Project.
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_config_versions" ADD CONSTRAINT "project_config_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topic_watches" ADD CONSTRAINT "topic_watches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topic_watch_versions" ADD CONSTRAINT "topic_watch_versions_topic_watch_id_fkey" FOREIGN KEY ("topic_watch_id") REFERENCES "topic_watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_runners" ADD CONSTRAINT "account_runners_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_identity_checks" ADD CONSTRAINT "account_identity_checks_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_account_bindings" ADD CONSTRAINT "project_account_bindings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_account_bindings" ADD CONSTRAINT "project_account_bindings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_posts" ADD CONSTRAINT "source_posts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_post_matches" ADD CONSTRAINT "source_post_matches_source_post_id_fkey" FOREIGN KEY ("source_post_id") REFERENCES "source_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_metric_snapshots" ADD CONSTRAINT "source_metric_snapshots_source_post_id_fkey" FOREIGN KEY ("source_post_id") REFERENCES "source_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_reviews" ADD CONSTRAINT "source_reviews_source_post_id_fkey" FOREIGN KEY ("source_post_id") REFERENCES "source_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idea_revisions" ADD CONSTRAINT "idea_revisions_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idea_sources" ADD CONSTRAINT "idea_sources_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idea_platform_targets" ADD CONSTRAINT "idea_platform_targets_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "artifact_links" ADD CONSTRAINT "artifact_links_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publication_drafts" ADD CONSTRAINT "publication_drafts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_publication_draft_id_fkey" FOREIGN KEY ("publication_draft_id") REFERENCES "publication_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publication_receipts" ADD CONSTRAINT "publication_receipts_publication_draft_id_fkey" FOREIGN KEY ("publication_draft_id") REFERENCES "publication_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
