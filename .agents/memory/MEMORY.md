# Memory Index

Link index only. Descriptions are one line by design — open the file for detail.
Keep it that way: this file is auto-loaded into every request.

## Rules (permanent — user corrections)

- [never_lose_code](never_lose_code.md) — branch+push WIP before destructive git ops
- [trunk_pr_workflow](trunk_pr_workflow.md) — short-lived branches → PR; `master` is PR-only; secret-scan every commit
- [feedback_explicit_immediate_pr_merge](feedback_explicit_immediate_pr_merge.md) — explicit merge-without-checks orders use a per-PR admin bypass; never aggregate first
- [end_to_end_implementation](end_to_end_implementation.md) — wire the full user path, never half-architecture
- [ui_primitives](ui_primitives.md) — no raw HTML controls; enforced by `scripts/ui/control-guard.ts`
- [proxy_middleware](proxy_middleware.md) — Next.js 16 renamed `middleware.ts` → `proxy.ts`
- [ready_pr_default](ready_pr_default.md) — ready PRs by default; draft only on request
- [no_external_symlinks](no_external_symlinks.md) — internal symlinks only (public repo)
- [p0_priority_not_label](p0_priority_not_label.md) — priority lives in Project #12, not labels
- [no_issue_body_frontmatter](no_issue_body_frontmatter.md) — no YAML in issue bodies
- [skill_boundary](skill_boundary.md) — `.agents/skills` build the app; `skills/` are product content
- [genfeed_project_kanban](genfeed_project_kanban.md) — project #12 is canonical
- [epic_status_on_child_start](epic_status_on_child_start.md) — epics go In Progress when a child starts
- [positive_memory_framing](positive_memory_framing.md) — write memory as target state
- [shared_checkout_automation](shared_checkout_automation.md) — path-scope `git add`; checkout state moves
- [claim_work_before_starting](claim_work_before_starting.md) — search open PRs before branching or spawning a fix; push early to claim
- [inference_servers_private_boundary](inference_servers_private_boundary.md) — inference impls stay private
- [genfeedai_managed_provider](genfeedai_managed_provider.md) — managed inference is `provider=genfeedai`
- [system_workflows_content_os](system_workflows_content_os.md) — automation via immutable system workflows
- [curated_agent_mcp_actions](curated_agent_mcp_actions.md) — one reviewed action catalog; OpenAPI ≠ tool parity
- [curated_action_surface_boundaries](curated_action_surface_boundaries.md) — why each agent-only / MCP-only action stays that way
- [pricing_output_meter](pricing_output_meter.md) — credits throttle usage; no hard product caps
- [release_tag_after_green_deploy](release_tag_after_green_deploy.md) — one manual stable release ships community + SaaS from one SHA; failed deploys reuse the same version
- [feedback_release_e2e_board_signal](feedback_release_e2e_board_signal.md) — release E2E red → Project Priority P0 + auto-close on green; never prose-only triage
- [feedback_vercel_release_gate](feedback_vercel_release_gate.md) — Vercel deploys only via the release workflow
- [feedback_library_information_architecture](feedback_library_information_architecture.md) — Library destinations live in nav; folders and asset types are filters
- [feedback_campaign_information_architecture](feedback_campaign_information_architecture.md) — Campaign = Publish content program; Automate Programs; outreach in Messages
- [feedback_local_dev_portless_only](feedback_local_dev_portless_only.md) — interactive local app always `https://app.genfeed.localhost/` via package `dev` (Portless); fixed ports only as `dev:debug*`
- [feedback_dev_orphan_watchdog](feedback_dev_orphan_watchdog.md) — wrappers reap orphan next-server children; `dev:status` before blaming Genfeed; never kill :443
- [feedback_local_replicate_key_source](feedback_local_replicate_key_source.md) — edit only root `.env.local`; `env:sync local` regenerates app copies; never hand-edit generated env files
- [feedback_tdd_first](feedback_tdd_first.md) — TDD first (red→green→refactor); deterministic tests; MacBook keeps full suites CI-only
- [feedback_code_ci_not_workflow_gates](feedback_code_ci_not_workflow_gates.md) — product contracts are tests; do not add named `check:*` steps to the CI guards job
- [feedback_qa_queue_branch_protocol](feedback_qa_queue_branch_protocol.md) — stay on named QA closeout branch; respect PR push policy; no re-implement of complete items
- [feedback_commit_after_each_qa_fix](feedback_commit_after_each_qa_fix.md) — commit each finished QA fix before starting the next one
- [feedback_next_agent_rules_off](feedback_next_agent_rules_off.md) — Next must not rewrite CLAUDE.md or AGENTS.md
- [feedback_no_nested_claude_md](feedback_no_nested_claude_md.md) — only the repo-root CLAUDE.md; no apps/* or packages/* copies
- [feedback_simple_mode_minimal_prompt_bar](feedback_simple_mode_minimal_prompt_bar.md) — Advanced Mode off = prompt/voice/generate only; Cursor-style sticky turns, queued follow-ups, context meter, real Studio Stop
- [feedback_onboarding_conversation_prompt_card](feedback_onboarding_conversation_prompt_card.md) — first-login /agent/onboarding is a conversation; compact card sits on the prompt bar
- [feedback_onboarding_org_from_user](feedback_onboarding_org_from_user.md) — first-login org/brand is named from the signed-in user; onboarding sits on their membership org
- [feedback_prompt_bar_drop_placeholder](feedback_prompt_bar_drop_placeholder.md) — file drag over the prompt bar swaps the empty placeholder to "drop it here?"
- [feedback_overlay_menus_elevated_surface](feedback_overlay_menus_elevated_surface.md) — dropdowns and popovers use bg-secondary + shadow-dropdown, never elevated or canvas
- [feedback_conversation_contrast](feedback_conversation_contrast.md) — void chrome stays dark; conversation type is AA white/gray; chroma comes from media
- [feedback_generation_card_retry_after_failure](feedback_generation_card_retry_after_failure.md) — failed generate keeps Generate on the card; UI-action false is not Done
- [claude_local_env_access](claude_local_env_access.md) — Claude may Read/Edit local `.env*`; deny stays on `secrets/` and key files
- [project_qa_260812_closeout](project_qa_260812_closeout.md) — draft PR #2820 launch closeout state and post-merge checklist
- [project_generation_harness_worldclass_audit](project_generation_harness_worldclass_audit.md) — image/video/ads vs harness map; private packs required for taste; media path gaps
- [project_content_memory_pgvector](project_content_memory_pgvector.md) — day-one vector store is Postgres pgvector; brand memory layers for generation
- [project_x_algorithm_harness](project_x_algorithm_harness.md) — X open-source ranking → platform-x pack + winner scoring (not a separate product)
- [project_x_author_reply_loop](project_x_author_reply_loop.md) — Automate **Replies** surface (inbox + auto-replies + closed-loop memory for X)
- [project_x_activity_pipes](project_x_activity_pipes.md) — XAA webhook + post-watch + reply-inbound queues (connect later)
- [project_agent_workflow_run](project_agent_workflow_run.md) — content agents fill workflow slots + run deterministic graphs (Team Run Workflow)
- [project_agent_workflow_binding_columns](project_agent_workflow_binding_columns.md) — preferredWorkflow* + typed overrides are columns, not open JSON maps
- [project_restream_livestream_bot](project_restream_livestream_bot.md) — Restream-first live chat + external STT for host speech (not OBS)

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
- [ADR-DEPLOYMENT-MODES](architecture/ADR-DEPLOYMENT-MODES.md) — 3 modes (SaaS/Community/Desktop) as `deployment × client`; Better Auth is the active baseline; platform admin via `users.platformRole`; multi-tenancy stays EE/SaaS; managed credits cloud-only. Supersedes the auth half of #95. Contributor doc: `docs/deployment-modes.md`
- [ADR-CONVERSATION-SHELL-CONTRACTS](architecture/ADR-CONVERSATION-SHELL-CONTRACTS.md) — v3.2: conversation is a surface, composer follows it, frame/nav are route-owned, and the topbar breadcrumb owns visible page identity
- [ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL](architecture/ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md) — scheduling via the workflow engine
- [ADR-PLG-BOUNDARY-OSS-CLOUD](architecture/ADR-PLG-BOUNDARY-OSS-CLOUD.md) — OSS vs cloud feature split
- [ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION](architecture/ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION.md) — recurring agent automation
- [ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY](architecture/ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY.md) — OSS single-player vs cloud governance
- [VERSIONED-AGENT-ARTIFACTS](architecture/VERSIONED-AGENT-ARTIFACTS.md) — canonical refs, immutable pins, #1673 gate

## Specs and decisions (per issue)

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
- [workspace-inspector-tabs](spec-workspace-inspector-tabs.md) · [decisions](decisions-workspace-inspector-tabs.md) — user-configurable right-rail asset panes

## Project state

- [project_agent_campaign_backend_debt](project_agent_campaign_backend_debt.md) — Programs config columns + dead cron + AgentRuntime facade
- [project_agent_t3_density](project_agent_t3_density.md) — agent conversation track max-w-3xl, composer-owned status, suppress generic Done + footer noise (#2502)
- [project_module_local_chrome](project_module_local_chrome.md) — one SectionTopbar contract for local nav + primary actions app-wide
- [project_card_metric_surface](project_card_metric_surface.md) — Card + MetricCard/MetricSummary only; no new metric card components
- [project_brand_settings_voice_harness](project_brand_settings_voice_harness.md) — Brand voice vs speech voice vs brand harness IA
- [project_qa_session_leftovers_2026-07-30](project_qa_session_leftovers_2026-07-30.md) — post-#2204 boil-the-ocean leftovers; keep QA together on master
- [project_parallel_qa_local_bugfix_split](project_parallel_qa_local_bugfix_split.md) — **active 2026-08-08:** two Grok agents on `qa/local-bugfix`; agent surface vs other surfaces; path-scope only
- [project_overview](project_overview.md) — monorepo structure and key context
- [project_one_api_epic](project_one_api_epic.md) — epic #95, one NestJS API
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

## References

- [reference_app_page_map](reference_app_page_map.md) — route/page map for QA
- [reference_skills_source_repos](reference_skills_source_repos.md) — `genfeedai/skills` + private `skills-pro`

## Context (auto-loaded via CLAUDE.md @import)

Already in context: [system-patterns](context/system-patterns.md) · [project-structure](context/project-structure.md) · [project-style-guide](context/project-style-guide.md) · [skills-architecture](context/skills-architecture.md)

Load on demand: [e2e-architecture](context/e2e-architecture.md) · [progress](context/progress.md) · [tech-context](context/tech-context.md) · [product-context](context/product-context.md) · [project-overview](context/project-overview.md) · [project-brief](context/project-brief.md) · [project-vision](context/project-vision.md) · [api-cache-invalidation](context/api-cache-invalidation.md)

## Features and system

- [features/agent](features/agent/README.md) — orchestration, threading, collections, tools, frontend
- [AGENT-RUNTIME](system/AGENT-RUNTIME.md) · [CRITICAL-NEVER-DO](system/CRITICAL-NEVER-DO.md) · [SYSTEM-RULES](system/SYSTEM-RULES.md) · [PRIORITY-READING](system/PRIORITY-READING.md) · [CROSS-PROJECT-RULES](system/CROSS-PROJECT-RULES.md) · [OPEN-SOURCE-CONTEXT](system/OPEN-SOURCE-CONTEXT.md) · [SELF-HOSTED-GUIDE](system/SELF-HOSTED-GUIDE.md)

## Plans

- **MergedSwitcher** (2026-05-17) — historical AppSwitcher + ContentTypeSwitcher plan; implementation has since changed.
