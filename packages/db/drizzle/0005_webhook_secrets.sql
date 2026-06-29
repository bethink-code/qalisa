-- Add a random webhookSecret to existing smsportal and mailjet credentials
-- that were created before automatic secret injection was added.
-- The secret is used as a path segment to authenticate inbound callbacks
-- from providers that don't sign their webhook payloads.
UPDATE "public"."provider_credentials"
SET "config" = "config" || jsonb_build_object('webhookSecret', gen_random_uuid()::text)
WHERE "provider" IN ('smsportal', 'mailjet')
  AND ("config"->>'webhookSecret') IS NULL;
