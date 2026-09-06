# Daily X and LinkedIn publishing

Install the **Daily Brand Social Publishing** customer workflow (`daily-brand-social-publishing`) from the workflow template picker. It starts with recurrence disabled and automatic publishing disabled. This workflow creates X posts and LinkedIn feed posts, not native LinkedIn articles.

The graph resolves selected accounts, refreshes scoped trends, and runs an account child graph that collects provider analytics, selects a winner/trend/topic, reserves a daily slot, generates brand-aware content, evaluates quality, and either leaves a review draft or schedules it.

## Configuration

- `brandId`: required brand in the current organization.
- `credentialIds`: connected X/LinkedIn account IDs; an empty array selects all eligible accounts of the brand.
- `topics`: evergreen topic strings used when no unused winner or trend is available.
- `timezone`: IANA timezone for the daily account date. Match the workflow schedule timezone.
- `minScore`: minimum quality score, 7–10; default 8.
- `autoPublish`: default false. Explicit true schedules passing drafts through the canonical publishing approval and queue path.
- `agentStrategyId`: optional strategy of the same brand for post attribution.

Generation loads the existing brand identity, guidance, memory, recent posts, performance patterns and harness context. Winner source text is abstracted into a new hook/angle rather than copied. Trend-provider failures are returned as `refreshError` and account analytics collection failures as `analyticsRefreshError`; the workflow can still use account winners or configured topics. No usable source produces an explicit failed node, not placeholder content.

## API use

Use the deployment's normal API prefix and authenticated organization/brand context:

1. `GET /workflows/templates` lists the template.
2. `POST /workflows` with `{ "templateId": "daily-brand-social-publishing", "label": "Daily social content" }` installs it.
3. `POST /workflows/:workflowId/execute` accepts `{ "inputValues": { "brandId": "...", "credentialIds": ["..."], "topics": ["..."], "timezone": "Europe/Malta", "autoPublish": false, "minScore": 8 } }` for a review run.
4. For recurrence, save configuration as `defaultValue` on each corresponding workflow `inputVariables` entry through `PATCH /workflows/:workflowId`, preserving the other input definitions. Scheduled runs use these defaults, not previous manual-run inputs.
5. When ready, `PATCH /workflows/:workflowId` with `{ "schedule": "0 9 * * *", "timezone": "Europe/Malta", "isScheduleEnabled": true }` enables daily runs. Enable `autoPublish` in saved defaults only when unattended scheduling is intended.

## Delivery and recovery

The unique daily slot key contains organization (database scope), brand, credential and local date. Multiple workflows targeting the same account/date reuse the original slot. Existing failed and deleted slots remain explicit outcomes; they do not silently create replacement sends. Retry the failed original execution to resume its owned slot. Tomorrow creates a new date slot.

Generated drafts retain workflow execution, strategy attribution, source provenance, source text and date slot on the post. Quality evidence is bound to the exact content digest and owning execution. Editing content invalidates automatic approval. Empty, copied, over-limit and duplicate account content fails closed. Weak content stays a draft with quality feedback; passing content also stays a review draft unless automatic publishing is enabled.

The final output reflects the persisted post execution state after scheduling, including any approval hold. `scheduled` means queued for canonical delivery, not published. Confirm actual delivery from the post's execution state/provider identifiers. Inspect child workflow outputs for `postId`, source, score and outcome; inspect post errors for failures. This change does not enable schedules or publish content in any live account by installation alone.
