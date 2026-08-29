BEGIN;

-- Keep source-post identity project-scoped. The same real post may inform more
-- than one project without moving the earlier project's review record.
UPDATE "source_posts"
SET "canonical_url" = 'https://www.xiaohongshu.com/explore/' || "external_id"
WHERE "platform" = '小红书'
  AND "external_id" ~ '^[a-f0-9]{16,32}$';
UPDATE "source_posts"
SET "raw_payload" = "raw_payload" - 'rawClipboard'
WHERE jsonb_typeof("raw_payload") = 'object'
  AND "raw_payload" ? 'rawClipboard';
UPDATE "source_posts" SET "canonical_hash" = md5("canonical_url");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "source_posts"
    GROUP BY "project_id", "platform", "external_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '0004_topic_workbench: project-scoped external_id collision';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "source_posts"
    GROUP BY "project_id", "platform", "canonical_hash"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '0004_topic_workbench: project-scoped canonical URL collision';
  END IF;
END $$;

DROP INDEX "source_posts_platform_external_id_key";
DROP INDEX "source_posts_platform_canonical_hash_key";
CREATE UNIQUE INDEX "source_posts_project_id_platform_external_id_key"
  ON "source_posts"("project_id", "platform", "external_id");
CREATE UNIQUE INDEX "source_posts_project_id_platform_canonical_hash_key"
  ON "source_posts"("project_id", "platform", "canonical_hash");

CREATE TABLE "source_comments" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "source_post_id" UUID NOT NULL,
  "evidence_hash" TEXT NOT NULL,
  "external_id" TEXT,
  "author" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL,
  "likes" INTEGER,
  "published_at" TIMESTAMP(3),
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raw_payload" JSONB,
  CONSTRAINT "source_comments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_comments_source_post_id_evidence_hash_key"
  ON "source_comments"("source_post_id", "evidence_hash");
CREATE INDEX "source_comments_workspace_id_project_id_source_post_id_captured_at_idx"
  ON "source_comments"("workspace_id", "project_id", "source_post_id", "captured_at");
ALTER TABLE "source_comments" ADD CONSTRAINT "source_comments_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_comments" ADD CONSTRAINT "source_comments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_comments" ADD CONSTRAINT "source_comments_source_post_id_fkey"
  FOREIGN KEY ("source_post_id") REFERENCES "source_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "idea_revisions"
  ADD COLUMN "asset_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "image_brief" TEXT,
  ADD COLUMN "video_brief" JSONB;

-- Freeze the exact analysis version used to derive each Idea. Backfill legacy
-- rows from the newest version available at migration time, then require new
-- writes to choose a version explicitly when a PatternCard is present.
ALTER TABLE "idea_sources" ADD COLUMN "pattern_card_version_id" UUID;
UPDATE "idea_sources" AS source
SET "pattern_card_version_id" = (
  SELECT candidate."id"
  FROM "pattern_card_versions" AS candidate
  WHERE candidate."pattern_card_id" = source."pattern_card_id"
  ORDER BY candidate."version" DESC
  LIMIT 1
)
WHERE source."pattern_card_id" IS NOT NULL;
CREATE INDEX "idea_sources_pattern_card_version_id_idx" ON "idea_sources"("pattern_card_version_id");
ALTER TABLE "idea_sources" ADD CONSTRAINT "idea_sources_pattern_card_version_id_fkey"
  FOREIGN KEY ("pattern_card_version_id") REFERENCES "pattern_card_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "insights" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "source_post_id" UUID,
  "idea_id" UUID,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "evidence_type" TEXT NOT NULL DEFAULT 'inference',
  "comment_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "status" "ReviewStatus" NOT NULL DEFAULT 'pending',
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "insights_workspace_id_project_id_kind_status_idx"
  ON "insights"("workspace_id", "project_id", "kind", "status");
CREATE INDEX "insights_source_post_id_idx" ON "insights"("source_post_id");
CREATE INDEX "insights_idea_id_idx" ON "insights"("idea_id");
ALTER TABLE "insights" ADD CONSTRAINT "insights_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insights" ADD CONSTRAINT "insights_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insights" ADD CONSTRAINT "insights_source_post_id_fkey"
  FOREIGN KEY ("source_post_id") REFERENCES "source_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "insights" ADD CONSTRAINT "insights_idea_id_fkey"
  FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "ContentDraftStatus" AS ENUM ('pending_review', 'approved', 'rejected');

CREATE TABLE "content_drafts" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "idea_id" UUID NOT NULL,
  "status" "ContentDraftStatus" NOT NULL DEFAULT 'pending_review',
  "current_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "content_drafts_workspace_id_project_id_status_idx"
  ON "content_drafts"("workspace_id", "project_id", "status");
CREATE INDEX "content_drafts_idea_id_idx" ON "content_drafts"("idea_id");
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_idea_id_fkey"
  FOREIGN KEY ("idea_id") REFERENCES "ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "content_draft_revisions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "content_draft_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "copy" TEXT NOT NULL DEFAULT '',
  "format" TEXT NOT NULL,
  "asset_strategy" TEXT NOT NULL DEFAULT 'pending',
  "asset_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "image_brief" TEXT,
  "video_brief" JSONB,
  "source_snapshot" JSONB NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_draft_revisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "content_draft_revisions_content_draft_id_version_key"
  ON "content_draft_revisions"("content_draft_id", "version");
CREATE INDEX "content_draft_revisions_workspace_id_project_id_created_at_idx"
  ON "content_draft_revisions"("workspace_id", "project_id", "created_at");
ALTER TABLE "content_draft_revisions" ADD CONSTRAINT "content_draft_revisions_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_draft_revisions" ADD CONSTRAINT "content_draft_revisions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "content_draft_revisions" ADD CONSTRAINT "content_draft_revisions_content_draft_id_fkey"
  FOREIGN KEY ("content_draft_id") REFERENCES "content_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "publication_drafts" ADD COLUMN "content_draft_id" UUID;
ALTER TABLE "publication_drafts" ADD CONSTRAINT "publication_drafts_content_draft_id_fkey"
  FOREIGN KEY ("content_draft_id") REFERENCES "content_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "publication_drafts_content_draft_id_idx" ON "publication_drafts"("content_draft_id");

COMMIT;
