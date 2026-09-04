# Memory Index

Link index only. Descriptions are one line by design — open the file for detail.
Keep it that way: this file is auto-loaded into every request.

## Rules (permanent — user corrections)

- [better_auth_user_ids_are_opaque](rules/better_auth_user_ids_are_opaque.md) — authenticated user IDs span legacy Better Auth base62 values and new UUIDs; authorize them as opaque canonical users.id values
- [never_lose_code](never_lose_code.md) — branch+push WIP before destructive git ops
- [trunk_pr_workflow](trunk_pr_workflow.md) — short-lived branches → PR; `master` is PR-only; secret-scan every commit
- [feedback_explicit_immediate_pr_merge](feedback_explicit_immediate_pr_merge.md) — explicit merge-without-checks orders use a per-PR admin bypass; never aggregate first
- [feedback_deps_update_canonical](feedback_deps_update_canonical.md) — `bun run deps:update` owns package + Action pins; Dependabot is retired
- [end_to_end_implementation](end_to_end_implementation.md) — wire the full user path, never half-architecture
- [feedback_finish_diagnosed_surface](feedback_finish_diagnosed_surface.md) — finish every leftover on a diagnosed incident surface in the same pass
- [ui_primitives](ui_primitives.md) — no raw HTML controls; enforced by `scripts/ui/control-guard.ts`
- [proxy_middleware](proxy_middleware.md) — Next.js 16 renamed `middleware.ts` → `proxy.ts`
- [ready_pr_default](ready_pr_default.md) — ready PRs by default; draft only on request
- [no_external_symlinks](no_external_symlinks.md) — internal symlinks only (public repo)
- [p0_priority_not_label](p0_priority_not_label.md) — priority lives in native organization Issue Fields, not labels or project-local duplicates
- [no_issue_body_frontmatter](no_issue_body_frontmatter.md) — no YAML in issue bodies
- [issue_titles_imperative](issue_titles_imperative.md) — short imperative titles, no conventional-commit prefix, about 50 chars
- [skill_boundary](skill_boundary.md) — `.agents/skills` build the app; `skills/` are product content
- [genfeed_project_kanban](genfeed_project_kanban.md) — Project #12 owns workflow Status; native Issue Fields own shared metadata
- [epic_status_on_child_start](epic_status_on_child_start.md) — epics go In Progress when a child starts
- [positive_memory_framing](positive_memory_framing.md) — write memory as target state
- [shared_checkout_automation](shared_checkout_automation.md) — path-scope `git add`; checkout state moves
- [claim_work_before_starting](claim_work_before_starting.md) — search open PRs before branching or spawning a fix; push early to claim
- [feedback_fix_branch_ends_in_pr](feedback_fix_branch_ends_in_pr.md) — a pushed fix branch is done only when a ready PR exists; no "pushed, no PR" handoffs
- [feedback_desktop_local_workspace_disabled](feedback_desktop_local_workspace_disabled.md) — desktop local/PGlite workspace is a PostHog-gated slice, not a void coming-soon page
- [feedback_pr_closes_one_issue_per_keyword](feedback_pr_closes_one_issue_per_keyword.md) — one `Closes #N` line per issue; a comma list only auto-closes the first
- [feedback_stacked_pr_merge_target](feedback_stacked_pr_merge_target.md) — retarget stacked PRs to `master` before merging; closing keywords never fire on a feature-branch base
- [feedback_no_new_ci_guard_steps](feedback_no_new_ci_guard_steps.md) — no new named CI guard steps; #2946 owns YAML-ratchet cleanup
- [inference_servers_private_boundary](inference_servers_private_boundary.md) — inference impls stay private
- [feedback_strategy_lives_in_vault](feedback_strategy_lives_in_vault.md) — competitive strategy lives in private `genfeedai/vault`, not this public repo or board
- [genfeedai_managed_provider](genfeedai_managed_provider.md) — managed inference is `provider=genfeedai`
- [system_workflows_content_os](system_workflows_content_os.md) — automation via immutable system workflows
- [system_workflows_admin_only](system_workflows_admin_only.md) — persisted system clones are Admin-only; customer library never lists them
- [decisions-workflow-only-action-execution](decisions-workflow-only-action-execution.md) — hard cut to one action-backed workflow execution model with no runtime legacy support
- [spec-workflow-only-action-execution](spec-workflow-only-action-execution.md) — full Website/API/Agent/MCP/worker refactor and YouTube-to-long-form acceptance contract
- [page_org_brand_scope](page_org_brand_scope.md) — org always selected; brand empty (`~/`) or brand selected on every customer list
- [curated_agent_mcp_actions](curated_agent_mcp_actions.md) — one reviewed action catalog; OpenAPI ≠ tool parity
- [curated_action_surface_boundaries](curated_action_surface_boundaries.md) — why each agent-only / MCP-only action stays that way
- [pricing_output_meter](pricing_output_meter.md) — credits throttle usage; no hard product caps
- [spec-native-referral-credits](spec-native-referral-credits.md) — native first-touch referral attribution and recurring PAYG credit rewards
- [decisions-native-referral-credits](decisions-native-referral-credits.md) — product, ownership, fraud, and fulfillment decisions for referral credits
- [release_tag_after_green_deploy](release_tag_after_green_deploy.md) — one manual stable release ships community + SaaS from one SHA; failed deploys reuse the same version
- [feedback_release_e2e_board_signal](feedback_release_e2e_board_signal.md) — release E2E red → native issue Priority P0 + auto-close on green; never prose-only triage
- [feedback_vercel_release_gate](feedback_vercel_release_gate.md) — Vercel deploys only via the release workflow
- [feedback_hosted_saas_public_deploy](feedback_hosted_saas_public_deploy.md) — hosted SaaS deploys from public genfeed.ai; do not dispatch console
- [feedback_seo_hard_cut_routes](feedback_seo_hard_cut_routes.md) — retired/moved public routes are hard cuts: remove current references, add no redirects
- [feedback_library_information_architecture](feedback_library_information_architecture.md) — Library destinations live in nav; folders and asset types are filters
- [feedback_campaign_information_architecture](feedback_campaign_information_architecture.md) — Campaign = Publish content program; Automate Programs; outreach in Messages
- [feedback_messages_conversation_inbox](feedback_messages_conversation_inbox.md) — Messages nav lists social conversations; disconnected state connects accounts; read-only platforms have no composer
- [feedback_local_dev_portless_only](feedback_local_dev_portless_only.md) — interactive local app always `https://app.genfeed.localhost/` via package `dev` (Portless); fixed ports only as `dev:debug*`
- [feedback_dev_orphan_watchdog](feedback_dev_orphan_watchdog.md) — wrappers reap orphan next-server children; `dev:status` before blaming Genfeed; never kill :443
- [feedback_local_replicate_key_source](feedback_local_replicate_key_source.md) — edit only root `.env.local`; `env:sync local` regenerates app copies; never hand-edit generated env files
- [feedback_lowest_cost_local_models](feedback_lowest_cost_local_models.md) — local/e2e/self-hosted default to FLUX Schnell, P-Video, DeepSeek V4 Flash; cloud production keeps quality defaults
- [feedback_local_saas_staging_cdn](feedback_local_saas_staging_cdn.md) — local SaaS publishes media via staging-cdn; files host is API-only, never `/local/` paths
- [feedback_tdd_first](feedback_tdd_first.md) — TDD first (red→green→refactor); deterministic tests; MacBook keeps full suites CI-only
- [feedback_code_ci_not_workflow_gates](feedback_code_ci_not_workflow_gates.md) — product contracts are tests; do not add named `check:*` steps to the CI guards job
- [feedback_qa_queue_branch_protocol](feedback_qa_queue_branch_protocol.md) — stay on named QA closeout branch; respect PR push policy; no re-implement of complete items
- [feedback_commit_after_each_qa_fix](feedback_commit_after_each_qa_fix.md) — commit each finished QA fix before starting the next one
- [feedback_next_agent_rules_off](feedback_next_agent_rules_off.md) — Next must not rewrite CLAUDE.md or AGENTS.md
- [feedback_no_nested_claude_md](feedback_no_nested_claude_md.md) — only the repo-root CLAUDE.md; no apps/* or packages/* copies
- [feedback_simple_mode_minimal_prompt_bar](feedback_simple_mode_minimal_prompt_bar.md) — Advanced Mode off = prompt/voice/generate only; Cursor-style sticky turns, queued follow-ups, real Studio Stop
- [feedback_no_composer_context_meter](feedback_no_composer_context_meter.md) — no token / context-window meter on the agent composer
- [feedback_model_picker_family_rows](feedback_model_picker_family_rows.md) — model picker is one flat ranked list: filter pills, capability icons, hover spec
- [feedback_generation_card_model_survives_refresh](feedback_generation_card_model_survives_refresh.md) — generation-card model/priority/outputs persist in a Zustand store separate from chat
- [feedback_thread_generation_type_lock](feedback_thread_generation_type_lock.md) — a thread is image or video generation, not both
- [feedback_command_palette_registration_quiet](feedback_command_palette_registration_quiet.md) — command register/unregister is debug, never info in the browser
- [feedback_arrays_only_mutation_apis](feedback_arrays_only_mutation_apis.md) — public mutations take arrays; no singular+plural twins or T | T[] overloads
- [feedback_toolbar_ghost_icon_cluster](feedback_toolbar_ghost_icon_cluster.md) — toolbar icon actions are ghost, 14px, clustered at the far right
- [feedback_generation_card_single_model_outputs_stepper](feedback_generation_card_single_model_outputs_stepper.md) — one model per generate; N images via the Outputs ButtonDropdown
- [feedback_generation_card_one_line_prompt](feedback_generation_card_one_line_prompt.md) — generation-card prompt is one line; Read & edit sits on that row
- [feedback_generation_card_prompt_bar_send](feedback_generation_card_prompt_bar_send.md) — generation card uses the prompt-bar toolbar and square ArrowUp send
- [feedback_composer_docked_cards](feedback_composer_docked_cards.md) — composer-top cards sit flush on the prompt bar at full width; keep the generate form open
- [feedback_composer_opaque_dock](feedback_composer_opaque_dock.md) — prompt bar is opaque; dock uses a top-transparent / bottom-black gradient; do not slab the full stack
- [feedback_studio_generate_agent_dock](feedback_studio_generate_agent_dock.md) — Studio generate floats the composer over the masonry like Agent; no inflow black slab; card click opens inspector
- [feedback_composer_outer_shadow](feedback_composer_outer_shadow.md) — docked prompt bar lifts with outer --shadow-lg only; no inset or 1px ring hairline
- [feedback_onboarding_conversation_prompt_card](feedback_onboarding_conversation_prompt_card.md) — post-brand /agent/onboarding is a conversation; compact card sits on the prompt bar
- [feedback_onboarding_brand_shared](feedback_onboarding_brand_shared.md) — `/onboarding/brand` is shared across Cloud and Desktop; Skip completes the gate, brand stays re-enterable
- [feedback_onboarding_org_from_user](feedback_onboarding_org_from_user.md) — first-login org/brand is named from the signed-in user; onboarding sits on their membership org
- [feedback_prompt_bar_drop_placeholder](feedback_prompt_bar_drop_placeholder.md) — file drag over the prompt bar swaps the empty placeholder to "drop it here?"
- [feedback_overlay_menus_elevated_surface](feedback_overlay_menus_elevated_surface.md) — dropdowns and popovers use bg-secondary + shadow-dropdown, never elevated or canvas
- [feedback_conversation_contrast](feedback_conversation_contrast.md) — void chrome stays dark; conversation type is AA white/gray; chroma comes from media
- [feedback_user_prompt_no_composer_chrome](feedback_user_prompt_no_composer_chrome.md) — agent user prompts render through @ui/card/Card; not PromptBarComposer chrome
- [feedback_generation_card_retry_after_failure](feedback_generation_card_retry_after_failure.md) — failed generate keeps Generate on the card; UI-action false is not Done
- [feedback_article_card_editorial_system](feedback_article_card_editorial_system.md) — article covers and OG cards use the dark physical-studio Genfeed system with article-specific metaphors
- [feedback_generation_card_manual_collapse_on_error](feedback_generation_card_manual_collapse_on_error.md) — failed generation cards stay expandable; the operator can collapse them by hand
- [feedback_ui_action_403_not_provider](feedback_ui_action_403_not_provider.md) — confirm-generate 403s are our API (allowlist/brand/org), not a provider block
- [feedback_generate_picker_reads_allowlist](feedback_generate_picker_reads_allowlist.md) — generate/agent pickers honor enabledModelIds; Settings → Models stays the catalog
- [feedback_request_abort_not_body_close](feedback_request_abort_not_body_close.md) — cancel Replicate only on response.close; request.close is the body finishing
- [claude_local_env_access](claude_local_env_access.md) — Claude may Read/Edit local `.env*`; deny stays on `secrets/` and key files
- [project_generation_harness_worldclass_audit](project_generation_harness_worldclass_audit.md) — image/video/ads vs harness map; private packs required for taste; media path gaps
- [project_content_memory_pgvector](project_content_memory_pgvector.md) — day-one vector store is Postgres pgvector; brand memory layers for generation
- [project_x_algorithm_harness](project_x_algorithm_harness.md) — X open-source ranking → platform-x pack + winner scoring (not a separate product)
- [project_x_author_reply_loop](project_x_author_reply_loop.md) — Automate **Replies** surface (inbox + auto-replies + closed-loop memory for X)
- [project_x_activity_pipes](project_x_activity_pipes.md) — XAA webhook + post-watch + reply-inbound queues (connect later)
- [project_agent_workflow_run](project_agent_workflow_run.md) — content agents fill workflow slots + run deterministic graphs (Team Run Workflow)
- [project_agent_workflow_binding_columns](project_agent_workflow_binding_columns.md) — preferredWorkflow* + typed overrides are columns, not open JSON maps
- [project_restream_livestream_bot](project_restream_livestream_bot.md) — Restream-first live chat + external STT for host speech (not OBS)
- [project_trends_digest_reminders](project_trends_digest_reminders.md) — daily/weekly Trends reminders only after the surface is live; no unsolicited digest mail until then

Personal multi-host fleet notes (Claude/Codex/Grok routing) live in **gitignored** `.agents/memory/local/` and global user memory — not in this public index.

## Rules (via the `.claude/rules` symlink)

Always in context — repo-wide prohibitions, do not re-read them to "check":

- [enum_source_of_truth](rules/enum_source_of_truth.md) · [prisma_legacy_alias_fields](rules/prisma_legacy_alias_fields.md) · [server_not_core](rules/server_not_core.md)

Scoped by `paths` frontmatter — load only when the matching files are in play:

- [00-security](rules/00-security.md) · [10-backend-services](rules/10-backend-services.md) · [20-web-apps](rules/20-web-apps.md) · [30-shared-packages](rules/30-shared-packages.md) · [nestjs_value_imports_for_di](rules/nestjs_value_imports_for_di.md) (`apps/server/**`) · [better_auth_additional_fields](rules/better_auth_additional_fields.md) (`apps/server/api/src/auth/**`)

On-demand skills — invoked by task, formerly always-loaded rules:

- [local-development-host](../skills/local-development-host/SKILL.md) · [prd-pass-verify-state](../skills/prd-pass-verify-state/SKILL.md) · [worktree-env-sync](../skills/worktree-env-sync/SKILL.md)

## Architecture decisions

- [shared-package-message-catalogs](project_shared_package_message_catalogs.md) — shared packages consume the host app next-intl catalog (`ui` / `pages` / `agent` / `contexts`); no COPY consts (#2686)
- [ADR-DEPLOYMENT-MODES](architecture/ADR-DEPLOYMENT-MODES.md) — 3 modes (SaaS/Community/Desktop) as `deployment × client`; Better Auth is the active baseline; platform admin via `users.platformRole`; multi-tenancy is SaaS-mode; managed credits cloud-only; billing is AGPL in-tree, runtime-gated. Supersedes the auth half of #95. Contributor doc: `docs/deployment-modes.md`
- [ADR-CONVERSATION-SHELL-CONTRACTS](architecture/ADR-CONVERSATION-SHELL-CONTRACTS.md) — v3.2: conversation is a surface, composer follows it, frame/nav are route-owned, and the topbar breadcrumb owns visible page identity
- [ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL](architecture/ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md) — scheduling via the workflow engine
- [ADR-PLG-BOUNDARY-OSS-CLOUD](architecture/ADR-PLG-BOUNDARY-OSS-CLOUD.md) — OSS vs cloud feature split
- [ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION](architecture/ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION.md) — recurring agent automation
- [ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY](architecture/ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY.md) — OSS single-player vs cloud governance
- [ADR-PROMPT-MODERATION-STANCE](architecture/ADR-PROMPT-MODERATION-STANCE.md) — no first-party prompt-reading or conversation-review surface; enforce via scope/fence/rate-limit + provider checkers (#3012)
- [VERSIONED-AGENT-ARTIFACTS](architecture/VERSIONED-AGENT-ARTIFACTS.md) — canonical refs, immutable pins, #1673 gate
- [ADR-AGENT-NATIVE-REPO-PUBLIC](architecture/ADR-AGENT-NATIVE-REPO-PUBLIC.md) — `.agents/`, CLAUDE.md, AGENTS.md are public by design; unfit content never enters the tree
- [ADR-EARS-ON-EVERY-ISSUE](architecture/ADR-EARS-ON-EVERY-ISSUE.md) — EARS required on every public issue form; triage rewrites, never bounces
- [ADR-OSS-DISCOVERY-BOUNDARY](architecture/ADR-OSS-DISCOVERY-BOUNDARY.md) — homepage never mentions OSS; discovery via docs + footer; Sponsors on the org
- [ADR-CLA-FLA-2-1](architecture/ADR-CLA-FLA-2-1.md) — FSFE FLA 2.1 CLA via CLA Assistant (`ICLA.md`/`CCLA.md`), DCO retired, `ee/` maintainer-only
- Glossary for OSS launch vocabulary lives at repo root [CONTEXT.md](../../CONTEXT.md)

## Specs and decisions (per issue)

- [agent-fleet-runtime-api](spec-agent-fleet-runtime-api.md) · [decisions](decisions-agent-fleet-runtime-api.md) — durable hired-agent identity + bot chat + capabilities + routines + account assignments + reports + live/replayable Fleet activity
- [terminal-content-workspace](spec-terminal-content-workspace.md) · [decisions](decisions-terminal-content-workspace.md) — #52 shared `gf` CLI/TUI, browser auth, credits, generation, brands, workflows, assets
- [agentic-workflow-email-notifications](spec-agentic-workflow-email-notifications.md) · [decisions](decisions-agentic-workflow-email-notifications.md) — durable preferences + transactional outbox + Resend workflow-owner delivery across every run source
- [multi-account-per-platform](spec-multi-account-per-platform.md) · [decisions](decisions-multi-account-per-platform.md) — credential identity is `(brandId, platform, externalId)`; connect provisions a pending row and reconciles after the callback
- [prefilled-brand-remix-runs](spec-prefilled-brand-remix-runs.md) · [decisions](decisions-prefilled-brand-remix-runs.md) — #3338 Discover/Ads → Studio → Library/Review → Publish/paused campaign
- [auth-email-delivery-acknowledgement](spec-auth-email-delivery-acknowledgement.md) · [decisions](decisions-auth-email-delivery-acknowledgement.md) — synchronous provider acceptance for auth email
- [argil-avatar-video](spec-argil-avatar-video.md) · [decisions](decisions-argil-avatar-video.md) — #2849
- [desktop-local-database-boundary](spec-desktop-local-database-boundary.md) · [decisions](decisions-desktop-local-database-boundary.md) — #2824
- [multi-type-posts-library](spec-multi-type-posts-library.md) · [decisions](decisions-multi-type-posts-library.md) — #2604
- [operational-app-home](spec-operational-app-home.md) · [decisions](decisions-operational-app-home.md) — #1866
- [retire-redundant-product-routes](spec-retire-redundant-product-routes.md) · [decisions](decisions-retire-redundant-product-routes.md) — #1867
- [filesystem-s3-path-containment](spec-filesystem-s3-path-containment.md) · [decisions](decisions-filesystem-s3-path-containment.md) — #2068
- [scheduler-target-analytics](spec-scheduler-target-analytics.md) · [decisions](decisions-scheduler-target-analytics.md) — #1975
- [post-visibility-lifecycle](spec-post-visibility-lifecycle.md) · [decisions](decisions-post-visibility-lifecycle.md) — #2641
- [publish-list-projection](spec-publish-list-projection.md) · [decisions](decisions-publish-list-projection.md) — #2642
- [retire-orphaned-content-drafts](spec-retire-orphaned-content-drafts.md) · [decisions](decisions-retire-orphaned-content-drafts.md) — #2643
- [review-decision-vocabulary](spec-review-decision-vocabulary.md) · [decisions](decisions-review-decision-vocabulary.md) — #2644
- [brand-social-visual-enrichment](spec-brand-social-visual-enrichment.md) · [decisions](decisions-brand-social-visual-enrichment.md)
- [mcp-instagram-meta-inspiration-remix](spec-mcp-instagram-meta-inspiration-remix.md) · [decisions](decisions-mcp-instagram-meta-inspiration-remix.md)
- [local-development-host](spec-local-development-host.md) · [decisions](decisions-local-development-host.md)
- [adaptive-pr-validation](spec-adaptive-pr-validation.md) · [decisions](decisions-adaptive-pr-validation.md) — #1850
- [pipeline-posts-filters](spec-pipeline-posts-filters.md) · [decisions](decisions-pipeline-posts-filters.md) — #2612
- [messages-engagement-surfaces](spec-messages-engagement-surfaces.md) · [decisions](decisions-messages-engagement-surfaces.md) — #2742
- [publish-content-campaigns](spec-publish-content-campaigns.md) · [decisions](decisions-publish-content-campaigns.md) — Publish Campaign desk + `Post.campaignId`
- [source-post-variations](spec-source-post-variations.md) · [decisions](decisions-source-post-variations.md) — #2662
- [social-warmup-enrollments](spec-social-warmup-enrollments.md) · [decisions](decisions-social-warmup-enrollments.md) — #2214
- [llm-vendor-cost-ledger](spec-llm-vendor-cost-ledger.md) · [decisions](decisions-llm-vendor-cost-ledger.md) — #2361
- [agency-cost-reporting](spec-agency-cost-reporting.md) · [decisions](decisions-agency-cost-reporting.md) — org/brand provider-cost + credit reporting, CSV, and API
- [workspace-inspector-tabs](spec-workspace-inspector-tabs.md) · [decisions](decisions-workspace-inspector-tabs.md) — user-configurable right-rail asset panes
- [app-theming](spec-app-theming.md) · [decisions](decisions-app-theming.md) — System, Light, and Dark in product apps; marketing website stays Dark

## Project state

- [project_agent_campaign_backend_debt](project_agent_campaign_backend_debt.md) — Programs config columns + dead cron + AgentRuntime facade
- [project_agent_t3_density](project_agent_t3_density.md) — agent conversation track max-w-3xl, composer-owned status, suppress generic Done + footer noise (#2502)
- [project_module_local_chrome](project_module_local_chrome.md) — one SectionTopbar contract for local nav + primary actions app-wide
- [project_card_metric_surface](project_card_metric_surface.md) — Card + MetricCard/MetricSummary only; no new metric card components
- [project_brand_settings_voice_harness](project_brand_settings_voice_harness.md) — Brand voice vs speech voice vs brand harness IA
- [project_overview](project_overview.md) — monorepo structure and key context
- [project_migration](project_migration.md) — cloud + core → genfeed.ai, complete
- [project_backend_typecheck](project_backend_typecheck.md) — `tsconfig.typecheck.json` per backend workspace
- [project_bullmq](project_bullmq.md) — new processors go to workers or the owning service, not API
- [project_settings_routing](project_settings_routing.md) — personal/org/brand settings URL shapes
- [project_desktop_byok_generation](project_desktop_byok_generation.md) — BYOK generation runs in Electron main behind the canonical app UI
- [project_desktop_first_run](project_desktop_first_run.md) — desktop boots `apps/app` with Genfeed Connect sign-in; sync consent per cloud user
- [project_ts6_prisma7_build_regression](project_ts6_prisma7_build_regression.md) — resolved 2026-06-03; stage 4 + migration-apply pending
- [project_soft_delete_is_deleted](project_soft_delete_is_deleted.md) — soft-delete is `isDeleted` only; tombstone instant is `updatedAt`
- [project_repo_audit_2026-07-28](project_repo_audit_2026-07-28.md) — full-repo audit map; remaining P1–P3 linked to existing GH issues (no new epic)
- [project_platform_enum_usage](project_platform_enum_usage.md) — Platform/CredentialPlatform for ids; formatPlatformLabel/parsePlatform for display/aliases
- [project_legacy_hard_cut](project_legacy_hard_cut.md) — leftover Clerk/Mongo/cron compat; hard-cut target state

## References

- [reference_app_page_map](reference_app_page_map.md) — route/page map for QA
- [reference_skills_source_repos](reference_skills_source_repos.md) — `genfeedai/skills` + private `skills-pro`
- [spec-studio-generation-meter](spec-studio-generation-meter.md) · [decisions](decisions-studio-generation-meter.md) — honest Studio credit + queue meter

## Context (auto-loaded via CLAUDE.md @import)

Already in context: [system-patterns](context/system-patterns.md) · [project-structure](context/project-structure.md) · [project-style-guide](context/project-style-guide.md) · [skills-architecture](context/skills-architecture.md)

Load on demand: [e2e-architecture](context/e2e-architecture.md) · [progress](context/progress.md) · [tech-context](context/tech-context.md) · [product-context](context/product-context.md) · [project-overview](context/project-overview.md) · [project-brief](context/project-brief.md) · [project-vision](context/project-vision.md) · [api-cache-invalidation](context/api-cache-invalidation.md)

## Features and system

- [features/agent](features/agent/README.md) — orchestration, threading, collections, tools, frontend
- [AGENT-RUNTIME](system/AGENT-RUNTIME.md) · [CRITICAL-NEVER-DO](system/CRITICAL-NEVER-DO.md) · [SYSTEM-RULES](system/SYSTEM-RULES.md) · [PRIORITY-READING](system/PRIORITY-READING.md) · [CROSS-PROJECT-RULES](system/CROSS-PROJECT-RULES.md) · [OPEN-SOURCE-CONTEXT](system/OPEN-SOURCE-CONTEXT.md) · [SELF-HOSTED-GUIDE](system/SELF-HOSTED-GUIDE.md)
