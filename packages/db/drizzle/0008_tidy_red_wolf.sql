ALTER TABLE "templates" ALTER COLUMN "body" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "meta_template_id" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "components" jsonb;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "parameter_format" text DEFAULT 'named';