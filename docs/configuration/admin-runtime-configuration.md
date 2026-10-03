# Admin runtime configuration

Product configuration is persisted in the deployment-wide platform settings singleton. Superadmins edit it at **Admin → Administration → Platform settings**. API processes refresh the cache within 15 seconds; writes invalidate the writer’s cache immediately. Notification and file processes fetch only their non-secret presentation settings through the authenticated internal API, also cached for 15 seconds. A failed fetch blocks a send or transformation until configuration is available again.

## Notifications

Create a Discord, Telegram, or email destination in the System notifications section. Each destination has its own enable switch and signup/billing event filters. Discord still uses a webhook: create it in the desired Discord channel and paste its URL in admin. Changing that URL changes the server/channel without restarting the application. Stored URLs are encrypted using `TOKEN_ENCRYPTION_KEY`; admin responses expose only whether a webhook exists. Leave the webhook field blank while editing to preserve it. Telegram requires the server bot to have access to the target chat. Email uses the configured Resend account and verified sender.

Use **Send test** to verify a saved destination, then enable **Record system events** below. Only events in the configured recording window are eligible; enabling recording does not replay older accounts. Destinations are selected once for an event. Changing a destination updates future attempts; adding one does not subscribe it to already resolved events. Removed, disabled, or filtered destinations are skipped. Each destination has independent acknowledgement and retry state, so an email failure does not resend an already accepted Discord delivery. Delivery remains at least once across ambiguous provider/network failures; email uses a stable provider idempotency key. The existing deployment-wide pause/filter remains an additional gate.

## Rollout

1. Apply the additive Prisma migration before rolling out the new API, workers, file, and notification processes.
2. While the previous env configuration is still available, run `bun scripts/migrations/import-platform-runtime-config.ts` for a dry run, then run the same command with `--apply` against the upgraded database. Do not dump environment values or command output containing secrets. The importer prints names and presence only, rejects invalid settings, imports only untouched defaults, and preserves existing admin destinations. `TOKEN_ENCRYPTION_KEY` must match the API’s key.
3. Deploy the services together; the notification/file clients require the new internal runtime-settings endpoint. Verify a test destination and then remove the retired env keys from deployment secrets. The provider tokens, encryption key, and internal service API key remain required.

The importer never changes the recording window, clears delivery history, or replays accepted deliveries. Runtime configuration is no longer read from the retired env keys after deployment.

## Migrated settings

| Retired environment variable | Admin setting |
| --- | --- |
| `AGENT_CONTEXT_COMPRESSION_MODEL` | Agent compression model (`agentContextCompressionModel`) |
| `AGENT_CONTEXT_WINDOW_SIZE` | Recent messages kept in context (`agentContextWindowSize`) |
| `MAX_TOKENS` | Maximum text generation tokens (`generationMaxTokens`) |
| `TYPED_DECISION_TIMEOUT_MS` | Typed decision timeout (ms) (`typedDecisionTimeoutMs`) |
| `TRAINING_TRAINING_CREDITS_COST` | Training credits per 1,000 steps (`trainingCreditsCost`) |
| `TRAINING_CUSTOM_MODEL_CREDITS_COST` | Custom model credits (`customModelCreditsCost`) |
| `REPLICATE_MODEL_HARDWARE` | Training model hardware (`replicateModelHardware`) |
| `REPLICATE_MODEL_VISIBILITY` | Training model visibility (`replicateModelVisibility`) |
| `REPLICATE_MODELS_TRAINER` | Replicate trainer model (`replicateTrainerModel`) |
| `REPLICATE_TARGET_FPS` | Video conversion frame rate (`replicateTargetFps`) |
| `REPLICATE_TARGET_RESOLUTION` | Video conversion resolution (`replicateTargetResolution`) |
| `KLINGAI_MODEL` | Kling default model (`klingModel`) |
| `ELEVENLABS_MODEL` | ElevenLabs default model (`elevenlabsModel`) |
| `MUREKA_MODEL` | Mureka default model (`murekaModel`) |
| `DISCORD_CHANNEL_ID_DEPLOYMENTS` | Discord deployments channel (`discordChannelIdDeployments`) |
| `DISCORD_CHANNEL_ID_POSTS` | Discord posts channel (`discordChannelIdPosts`) |
| `DISCORD_CHANNEL_ID_STUDIO` | Discord studio channel (`discordChannelIdStudio`) |
| `DISCORD_CHANNEL_ID_USERS` | Discord users channel (`discordChannelIdUsers`) |
| `DISCORD_CHANNEL_ID_MODELS` | Discord models channel (`discordChannelIdModels`) |
| `DISCORD_BOT_AVATAR_URL` | Discord notification avatar URL (`discordBotAvatarUrl`) |
| `DISCORD_WEBHOOK_NAME_PREFIX` | Discord webhook name prefix (`discordWebhookNamePrefix`) |
| `DISCORD_WEBHOOK_REASON` | Discord webhook creation reason (`discordWebhookReason`) |
| `RESEND_FROM_EMAIL` | Email sender address (`emailFromAddress`) |
| `RESEND_REPLY_TO_EMAIL` | Email reply-to address (`emailReplyToAddress`) |
| `AWS_IMAGE_COMPRESSION` | Image compression quality (`imageCompressionQuality`) |
| `STRIPE_PAYG_CREDITS` | Legacy checkout fallback credits (`paygFallbackCredits`) |
| `LINKEDIN_TREND_SOURCE_URLS` | LinkedIn trend source URLs (`linkedinTrendSourceUrls`) |

`SYSTEM_NOTIFICATIONS_DISCORD_WEBHOOK_URL` becomes an encrypted Discord destination. Unused `TELEGRAM_ADMIN_IDS`, `DISCORD_GUILD_ID`, `STRIPE_PROMOTION_CODE_LAUNCH`, and `STRIPE_PROMOTION_CODE_SKILLS_PRO` are removed.

## Configuration that stays in env

Provider/API credentials, OAuth client IDs and redirect URIs, webhook signing secrets, database/Redis/internal service URLs, S3 buckets/CDN URLs, encryption keys, and account bindings such as Stripe price IDs and `REPLICATE_OWNER` configure deployment capabilities. Keep them in the deployment secret/config store. Hard spend ceilings and process resource limits (Apify limits, FFmpeg threads/concurrency/timeouts/temp paths, Redis token coalescing) are operational guardrails. FFmpeg codecs, pixel format, preset, and CRF describe the deployed encoder compatibility/profile rather than a customer rollout switch. Existing feature flags and recording controls were already migrated to platform settings and remain there.

`check:env-product-flags` rejects reintroducing the migrated product settings into env schemas. Legacy names remain only in the one-time importer, migration fixtures/tests, and this mapping.
