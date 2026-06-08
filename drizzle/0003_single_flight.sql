ALTER TABLE "sync_runs" ADD COLUMN "heartbeat" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_runs_one_running_per_kind" ON "sync_runs" ("kind") WHERE (status = 'running');
