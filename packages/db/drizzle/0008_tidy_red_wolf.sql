ALTER TABLE "templates" ALTER COLUMN "body" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "meta_template_id" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "components" jsonb;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "parameter_format" text DEFAULT 'named';