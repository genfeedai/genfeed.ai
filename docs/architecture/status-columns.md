# Plain-string status columns

Inventory for #9740 (part of #9732). Every Prisma column named `status`, `state`,
`stage`, `phase` or ending in one of those that is typed `String` rather than a
Prisma enum. `Credential.oauthState` is left out: it holds an OAuth `state`
value, not a lifecycle.

**Status** says how explicit the lifecycle is in code:

- **explicit**: a transition table or `can…Transition` guard names the legal edges.
- **derived**: the column is computed from other state; the named function or
  table is the lifecycle.
- **union only**: a TypeScript enum or union names the values, but no table
  names the edges.
- **none**: no shared vocabulary; writers use string literals.

Policy (see #9732): a column with more than one writer gets a contracts union and
a transition table built with `defineStateMachine`. The schema does not change
here; promoting a column to a Prisma enum is a separate migration PR.

## How the columns were found

`Writer files` counts non-test source files that call `create`, `createMany`,
`update`, `updateMany` or `upsert` on the model and set the field by name.
`Main writer` is the one that sets it most often. Both come from a script over
`apps/` and `packages/`, so writes through a generic repository helper are not
counted: treat `0` as "no direct Prisma write found", not "never written".
`Vocabulary` is the enum or union the column's values come from, found by name.
Rows marked explicit or derived were checked by hand; the rest are the
script's reading and should be confirmed before a table is written for them.

| Column | Default | Writer files | Main writer | Vocabulary | Status |
|---|---|---|---|---|---|
| `Invitation.status` | `pending` | 2 | `api/collections/members/services/invitation.service.ts` | `InvitationStatus` | union only |
| `Credential.warmupState` | `not_started` | 1 | `api/collections/credentials/services/provider-account-purge.service.ts` |  | none |
| `Ingredient.generationStage` |  | 3 | `api/services/video-stitch/video-stitch.service.ts` |  | none |
| `Post.status` | `draft` | 22 | `api/collections/outliers/services/breakout-output-recovery.util.ts` | `PostStatus` | union only |
| `Post.analyticsCollectionState` | `unavailable` | 4 | `api/analytics/services/post-analytics-collection-state.service.ts` |  | none |
| `Post.targetValidationState` | `pending` | 4 | `api/collections/post-groups/services/post-group-target.operations.ts` | `TargetValidationState` | explicit: `TARGET_VALIDATION_STATE_MACHINE` (contracts `scheduler.enum.ts`, #9740) |
| `Post.targetExecutionState` | `draft` | 25 | `api/post-lifecycle/post-lifecycle.service.ts` | `TargetExecutionState` | explicit: `POST_LIFECYCLE_TRANSITIONS` (`apps/server/api/src/post-lifecycle/post-lifecycle.service.ts`) |
| `Post.brandedReceiptState` |  | 0 |  |  | none |
| `PostProviderPublishReceipt.status` |  | 2 | `apps/server/workers/src/services/scheduled-post-provider-receipt.util.ts` | `PostProviderPublishReceiptStatus` | union only |
| `PublishApproval.status` | `approved` | 2 | `api/publish-approvals/publish-approvals.service.ts` | `PublishApprovalStatus` | explicit: `canTransitionPublishApprovalStatus` (contracts `publish-approval.contract.ts`) |
| `Campaign.status` | `draft` | 2 | `api/collections/campaigns/services/campaign-lifecycle.service.ts` | `ContentCampaignStatus` | explicit: `CONTENT_CAMPAIGN_STATE_MACHINE` (contracts `content-campaign.enum.ts`, #9740) |
| `CampaignPaidActivation.status` | `paused` | 1 | `api/collections/campaigns/services/campaign-paid-activation.service.ts` | `ContentCampaignPaidActivationStatus` | union only |
| `PostGroup.status` | `draft` | 6 | `apps/server/workers/src/services/release-recurrence-materializer.service.ts` | `ReleaseStatus` | derived: `deriveReleaseStatusFromTargets` from its targets' `targetExecutionState` |
| `PostingCadence.status` | `active` | 0 |  | `PostingCadenceStatus` | union only |
| `SlotReservation.state` | `missing` | 0 |  |  | none |
| `Distribution.status` |  | 1 | `api/collections/distributions/services/distributions.service.ts` |  | none |
| `LifecycleEmailDelivery.status` | `scheduled` | 4 | `api/services/email-performance/email-performance.service.ts` | `LifecycleEmailDeliveryStatus` | union only |
| `NotificationDelivery.status` | `pending` | 3 | `api/services/notifications/workflow-notifications/workflow-notification-delivery.service.ts` | `NotificationDeliveryStatus` | union only |
| `MediaPerception.framesStatus` |  | 2 | `api/services/media-perception/media-perception.service.ts` |  | none |
| `MediaPerception.ocrStatus` |  | 1 | `api/services/media-perception/media-perception.service.ts` |  | none |
| `MediaPerception.transcriptStatus` |  | 1 | `api/services/media-perception/media-perception.service.ts` |  | none |
| `MediaPerception.descriptionStatus` |  | 1 | `api/services/media-perception/media-perception.service.ts` |  | none |
| `CustomerInstance.status` |  | 0 |  | `CustomerInstanceStatus` | union only |
| `Newsletter.status` | `draft` | 2 | `api/collections/workflows/services/youtube-long-form-workflow.service.ts` | `NewsletterStatus` | union only |
| `Model.reviewStatus` |  | 9 | `api/endpoints/admin/model-pricing/model-pricing.service.ts` | `ModelReviewStatus` | union only: `MODEL_REVIEW_STATUS_TRANSITIONS` lists values a PATCH may set, not edges |
| `Model.providerSyncStatus` |  | 7 | `apps/server/workers/src/services/fal-model-contract-sync.service.ts` | `ModelProviderSyncStatus` | union only |
| `ModelProviderContract.mappingStatus` |  | 8 | `api/endpoints/admin/model-pricing/model-pricing.service.ts` | `ModelProviderContractMappingStatus` | union only |
| `ModelProviderContract.reviewStatus` | `pending` | 8 | `api/endpoints/admin/model-pricing/model-pricing.service.ts` | `ModelProviderContractReviewStatus` | union only |
| `AgentThread.status` | `active` | 6 | `api/collections/agent-threads/services/agent-threads.service.ts` | `AgentThreadStatus` | union only |
| `AvatarTwin.providerLookStatus` |  | 1 | `api/collections/avatar-twins/services/avatar-twins.service.ts` |  | none |
| `SocialConversation.status` | `open` | 2 | `api/collections/social-inbox/services/social-inbox-action.service.ts` | `SocialConversationStatus` | union only |
| `SocialConversation.automationState` | `manual` | 3 | `api/collections/social-inbox/services/ingestion/comment-trigger-ingestion.ts` |  | none |
| `SocialMessage.status` | `received` | 2 | `api/collections/social-inbox/services/social-inbox-action.service.ts` |  | none |
| `SocialMessage.workflowTriggerStatus` |  | 2 | `api/collections/social-inbox/services/ingestion/comment-trigger-ingestion.ts` | `SocialMessageWorkflowTriggerStatus` | union only |
| `SocialReplyCampaign.status` | `draft` | 2 | `api/collections/social-inbox/services/social-reply-campaign-dispatch.service.ts` | `SocialReplyCampaignStatus` | union only |
| `SocialReplyCampaignRecipient.status` | `pending` | 2 | `api/collections/social-inbox/services/social-reply-campaign-dispatch.service.ts` | `SocialReplyCampaignRecipientStatus` | union only |
| `AgentStrategyOpportunity.status` |  | 1 | `api/collections/agent-strategies/services/agent-strategy-opportunities.service.ts` | `AgentStrategyOpportunityStatus` | union only |
| `AgentCampaign.status` | `draft` | 2 | `api/collections/agent-campaigns/services/agent-campaign-execution.service.ts` | `AgentCampaignStatus` | union only |
| `Workflow.status` | `draft` | 10 | `api/collections/workflows/services/workflow-execution-runner.service.ts` | `WorkflowStatus` | union only |
| `WorkflowExecution.etaCurrentPhase` |  | 1 | `api/collections/workflow-executions/services/workflow-executions.service.ts` |  | none |
| `WorkflowExecutionNodeResult.status` |  | 1 | `api/collections/workflows/services/workflow-node-continuation.service.ts` |  | none |
| `WorkflowNodeClaim.status` |  | 2 | `api/collections/workflows/services/workflow-node-continuation.service.ts` |  | none |
| `ContentRun.status` |  | 6 | `api/endpoints/onboarding/services/onboarding-draft-runs.service.ts` | `ContentRunStatus` | derived for brand remix: `BRAND_REMIX_PHASE_RUN_STATUS` (#9740); onboarding draft runs write it directly |
| `ContentRun.phase` |  | 1 | `api/collections/content-runs/services/brand-remix-run-persistence.service.ts` | BrandRemixPhase (brand remix runs) | union only |
| `Task.status` | `backlog` | 2 | `api/collections/clipper-projects/services/clipper-continuity-workflow.service.ts` | `TaskStatus` | explicit: `STATUS_TRANSITIONS` (`tasks.service.ts`) |
| `Task.reviewState` | `none` | 0 |  | `TaskReviewState` | union only: `TASK_REVIEW_STATE_TRANSITIONS` lists values a PATCH may set, not edges |
| `BotActivity.status` |  | 1 | `api/collections/bot-activities/services/bot-activities.service.ts` | `BotActivityStatus` | union only |
| `SocialSource.lastSyncStatus` |  | 2 | `api/services/social-timeline/social-timeline.service.ts` |  | none |
| `ListeningTopicSource.collectionState` | `pending` | 1 | `api/collections/listening-topics/services/listening-topic-collector.service.ts` |  | none |
| `ListeningTheme.reviewState` | `unreviewed` | 1 | `api/collections/listening-topics/services/listening-topic-analysis.service.ts` | `ListeningThemeReviewState` | union only |
| `ListeningSignal.status` |  | 1 | `api/collections/listening-topics/services/listening-topic-analysis.service.ts` | `ListeningSignalStatus` | union only |
| `ContentPlanItem.status` | `pending` | 1 | `api/collections/content-plan-items/services/content-plan-items.service.ts` | `ContentPlanItemStatus` | union only |
| `ResearchCollectionJob.status` |  | 1 | `api/services/research-access/research-collection-job.service.ts` | `ResearchCollectionJobStatus` | union only |
| `AdPerformance.researchFreshnessState` |  | 1 | `api/collections/ad-performance/services/ad-performance.service.ts` |  | none |
| `AdWatchedAdvertiser.freshnessState` | `unavailable` | 1 | `api/collections/ad-performance/services/ad-performance.service.ts` | `AdWatchedAdvertiserFreshnessState` | union only |
| `AdWatchedAdvertiser.lastIngestionStatus` |  | 1 | `api/collections/ad-performance/services/ad-performance.service.ts` |  | none |
| `OutreachCampaign.status` | `draft` | 2 | `api/collections/campaign-targets/services/campaign-targets.service.ts` | `CampaignStatus` | union only |
| `CampaignTarget.status` | `PENDING` | 2 | `api/collections/campaign-targets/services/campaign-targets.service.ts` | `CampaignTargetStatus` | union only |
| `ClipperProject.continuityQaStatus` | `not-required` | 1 | `api/collections/clipper-projects/services/clipper-continuity-workflow.service.ts` |  | none |
| `ClipperProject.status` | `pending` | 3 | `api/collections/clipper-projects/clipper-projects.service.ts` | `ClipperProjectStatus` | union only |
| `ClipperResult.status` | `pending` | 2 | `api/collections/clipper-projects/services/public-youtube-clipper-claim.service.ts` | `ClipperResultStatus` | union only |
| `Project.status` | `active` | 0 |  | `ProjectStatus` | union only |
| `GenerationPromptSnapshot.retentionState` | `retained` | 1 | `api/services/branded-generation-receipts/branded-generation-prompt-store.service.ts` |  | none |
| `GenerationPromptSnapshot.brandedGenerationReceiptStage` |  | 1 | `api/services/branded-generation-receipts/branded-generation-prompt-store.service.ts` |  | none |
| `SkillReceipt.status` | `completed` | 2 | `api/skills-pro/services/skill-download.service.ts` |  | none |
| `Goal.status` |  | 0 |  | `GoalStatus` | union only |
| `DesktopThread.status` | `idle` | 1 | `api/services/sync/desktop-sync.service.ts` | `DesktopThreadStatus` | union only |
| `KnowledgeSourceVersion.transcriptState` |  | 2 | `api/collections/contexts/services/knowledge-transcript-ingest.service.ts` |  | none |
| `KnowledgeCaptureRequest.status` | `queued` | 4 | `api/collections/contexts/services/knowledge-embedding-completion.service.ts` | `KnowledgeCaptureRequestStatus` | union only |
| `BreakoutResponse.state` | `detected` | 1 | `api/collections/outliers/services/breakout-response-identity.util.ts` | `BreakoutResponseState` | union only |
| `BreakoutResponseOutput.state` | `reserved` | 4 | `api/collections/outliers/services/breakout-media-output-generation.service.ts` | `BreakoutResponseOutputState` | union only |
| `OutlierBaselineSnapshot.status` |  | 1 | `api/collections/outliers/services/outliers.service.ts` |  | none |
| `VisualRevision.status` | `queued` | 3 | `api/collections/visual-projects/services/visual-project-workflow.service.ts` | `VisualCodeStatus` | union only: `VISUAL_CODE_TERMINAL_STATUSES` names the settled values (#9733) |
| `CrunGenerationTask.state` | `prepared` | 2 | `api/services/integrations/crun/crun-task.service.ts` |  | none |
| `BrandedGenerationReceipt.state` |  | 1 | `api/services/branded-generation-receipts/branded-generation-receipts.service.ts` | `BrandedGenerationStateV1` | explicit: `canTransitionBrandedGenerationStateV1` (`branded-generation-state.util.ts`) |
| `MediaDeliveryVariant.state` | `PENDING` | 2 | `api/services/media-urls/media-variant-recovery.service.ts` |  | none |
| `SourcePostNativeAction.status` | `pending` | 1 | `api/services/social-timeline/social-timeline.service.ts` | `SourcePostNativeActionStatus` | union only |
| `BrandRelocation.status` | `processing` | 2 | `api/collections/brands/services/brand-relocation-jobs.service.ts` | `BrandRelocationStatus` | union only |
