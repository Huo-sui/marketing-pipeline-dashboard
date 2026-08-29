ALTER TABLE "topic_watches"
  ADD COLUMN "search_mode" TEXT NOT NULL DEFAULT 'sequential',
  ADD COLUMN "anomaly_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "anomaly_method" TEXT NOT NULL DEFAULT 'robust_mad',
  ADD COLUMN "anomaly_baseline_days" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "anomaly_min_samples" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "anomaly_z_threshold" DOUBLE PRECISION NOT NULL DEFAULT 3.5;
