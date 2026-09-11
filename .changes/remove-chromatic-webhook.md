packages: contracts config libs

Remove the dead Chromatic webhook integration. Storybook left the repo, so no
Chromatic builds can call `POST /webhooks/chromatic/callback`.

- `@genfeedai/contracts`: `IChromaticNotificationPayload` is removed and is no
  longer part of the `INotificationPayloadTypes` union.
- `@genfeedai/config`: `CHROMATIC_WEBHOOK_SECRET` is removed from `IEnvConfig`
  and the webhooks Joi schema. Drop it from deployed environments.
- `@genfeedai/libs`: `ChromaticWebhookPayload` is removed from
  `interfaces/webhook-payload.interface`.

No replacement. Consumers referencing these symbols should delete that code.
