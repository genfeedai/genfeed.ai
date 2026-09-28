-- Module and feature flags move from PostHog and env onto the platform
-- settings singleton (#5468). An empty object leaves every flag on, so the
-- deploy changes nothing until an operator switches a flag off in Admin.
ALTER TABLE "platform_settings" ADD COLUMN "flags" JSONB NOT NULL DEFAULT '{}';
