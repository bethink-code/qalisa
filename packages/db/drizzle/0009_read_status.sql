ALTER TYPE "message_status" ADD VALUE IF NOT EXISTS 'read';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "read_at" timestamp with time zone;
