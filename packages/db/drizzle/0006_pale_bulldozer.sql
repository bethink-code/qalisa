ALTER TABLE "provider_credentials" ADD COLUMN "remaining_balance" real;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD COLUMN "balance_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "cost" real;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "parts" integer;