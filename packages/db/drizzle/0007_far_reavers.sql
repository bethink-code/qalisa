ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "meta_template_name" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "whatsapp_category" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "whatsapp_language" text DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN IF NOT EXISTS "whatsapp_rejection_reason" text;