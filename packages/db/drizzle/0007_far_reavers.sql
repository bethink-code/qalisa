ALTER TABLE "templates" ADD COLUMN "meta_template_name" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "whatsapp_category" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "whatsapp_language" text DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "whatsapp_rejection_reason" text;