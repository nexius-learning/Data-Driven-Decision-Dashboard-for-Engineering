ALTER TABLE "sync_runs" ADD COLUMN "current_phase" text;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "phase_done" integer;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "phase_total" integer;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "in_flight_repos" jsonb;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "phase_timings" jsonb;
