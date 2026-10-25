-- fal answers 404 "Endpoint(s) not found" for these three keys (checked against
-- https://api.fal.ai/v1/models?endpoint_id=..., 2026-10-25). Seedance 2.0 now
-- lives under bytedance/seedance-2.0/*, ElevenLabs TTS under
-- fal-ai/elevenlabs/tts/* and Stable Video under fal-ai/stable-video. The
-- catalog seed no longer owns these rows and none is callable, so the weekly fal
-- refresh alerted "model_fetch_failed" for each of them forever. Only this
-- removes them.
UPDATE "models"
SET "isDeleted" = true,
    "isActive" = false,
    "isDefault" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN (
    'fal-ai/seedance-2.0',
    'fal-ai/eleven-labs-tts',
    'fal-ai/stable-video-diffusion'
  )
  AND "organizationId" IS NULL
  AND "isDeleted" = false;
