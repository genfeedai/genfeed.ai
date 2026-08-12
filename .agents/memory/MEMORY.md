# Memory Index

Link index only. Descriptions are one line by design — open the file for detail.
Keep it that way: this file is auto-loaded into every request.

## Rules (permanent — user corrections)

- [never_lose_code](never_lose_code.md) — branch+push WIP before destructive git ops
- [trunk_pr_workflow](trunk_pr_workflow.md) — short-lived branches → PR; `master` is PR-only; secret-scan every commit
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
- [feedback_local_dev_portless_only](feedback_local_dev_portless_only.md) — interactive local app always `https://app.genfeed.localhost/` via package `dev` (Portless); fixed ports only as `dev:debug*`
- [feedback_tdd_first](feedback_tdd_first.md) — TDD first (red→green→refactor); deterministic tests; MacBook keeps full suites CI-only
- [feedback_qa_queue_branch_protocol](feedback_qa_queue_branch_protocol.md) — stay on named QA closeout branch; respect PR push policy; no re-implement of complete items
- [project_qa_260812_closeout](project_qa_260812_closeout.md) — draft PR #2820 launch closeout state and post-merge checklist
- [project_generation_harness_worldclass_audit](project_generation_harness_worldclass_audit.md) — image/video/ads vs harness map; private packs required for taste; media path gaps
- [project_content_memory_pgvector](project_content_memory_pgvector.md) — day-one vector store is Postgres pgvector; brand memory layers for generation
- [project_x_algorithm_harness](project_x_algorithm_harness.md) — X open-source ranking → platform-x pack + winner scoring (not a separate product)
- [project_x_author_reply_loop](project_x_author_reply_loop.md) — Automate **Replies** surface (inbox + auto-replies + closed-loop memory for X)
- [project_x_activity_pipes](project_x_activity_pipes.md) — XAA webhook + post-watch + reply-inbound queues (connect later)

Personal multi-host fleet notes (Claude/Codex/Grok routing) live in **gitignored** `.agents/memory/local/` and global user memory — not in this public index.

## Rules (via the `.claude/rules` symlink)

Always in context — repo-wide prohibitions, do not re-read them to "check":

- [enum_source_of_truth](rules/enum_source_of_truth.md) · [prisma_legacy_alias_fields](rules/prisma_legacy_alias_fields.md) · [server_not_core](rules/server_not_core.md)

Scoped by `paths` frontmatter — load only when the matching files are in play:

- [00-security](rules/00-security.md) · [10-backend-services](rules/10-backend-services.md) · [20-web-apps](rules/20-web-apps.md) · [30-shared-packages](rules/30-shared-packages.md) · [nestjs_value_imports_for_di](rules/nestjs_value_imports_for_di.md) (`apps/server/**`) · [better_auth_additional_fields](rules/better_auth_additional_fields.md) (`apps/server/api/src/auth/**`)

On-demand skills — invoked by task, formerly always-loaded rules:

- [local-development-host](../skills/local-development-host/SKILL.md) · [prd-pass-verify-state](../skills/prd-pass-verify-state/SKILL.md) · [worktree-env-sync](../skills/worktree-env-sync/SKILL.md)

## Architecture decisions

- [ADR-DEPLOYMENT-MODES](architecture/ADR-DEPLOYMENT-MODES.md) — 3 modes (SaaS/Community/Desktop) as `deployment × client`; Better Auth is the active baseline; platform admin via `users.platformRole`; multi-tenancy stays EE/SaaS; managed credits cloud-only. Supersedes the auth half of #95. Contributor doc: `docs/deployment-modes.md`
- [ADR-CONVERSATION-SHELL-CONTRACTS](architecture/ADR-CONVERSATION-SHELL-CONTRACTS.md) — v3.2: conversation is a surface, composer follows it, frame/nav are route-owned, and the topbar breadcrumb owns visible page identity
- [ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL](architecture/ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md) — scheduling via the workflow engine
- [ADR-PLG-BOUNDARY-OSS-CLOUD](architecture/ADR-PLG-BOUNDARY-OSS-CLOUD.md) — OSS vs cloud feature split
- [ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION](architecture/ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION.md) — recurring agent automation
- [ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY](architecture/ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY.md) — OSS single-player vs cloud governance
- [VERSIONED-AGENT-ARTIFACTS](architecture/VERSIONED-AGENT-ARTIFACTS.md) — canonical refs, immutable pins, #1673 gate

## Specs and decisions (per issue)

- [AWS operational monitoring](spec-aws-operational-monitoring.md) · [decisions](decisions-aws-operational-monitoring.md) — #1
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
- [source-post-variations](spec-source-post-variations.md) · [decisions](decisions-source-post-variations.md) — #2662

## Project state

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
- [reference_postgres_rds](reference_postgres_rds.md) — prod/dev instances, sslmode gotcha
- [reference_prod_aws_runtime](reference_prod_aws_runtime.md) — live AWS source of truth
- [reference_production_fargate_vercel_webhook](reference_production_fargate_vercel_webhook.md) — ECS state, webhook receiver
- [reference_skills_source_repos](reference_skills_source_repos.md) — `genfeedai/skills` + private `skills-pro`

## Context (auto-loaded via CLAUDE.md @import)

Already in context: [system-patterns](context/system-patterns.md) · [project-structure](context/project-structure.md) · [project-style-guide](context/project-style-guide.md) · [skills-architecture](context/skills-architecture.md)

Load on demand: [e2e-architecture](context/e2e-architecture.md) · [progress](context/progress.md) · [tech-context](context/tech-context.md) · [product-context](context/product-context.md) · [project-overview](context/project-overview.md) · [project-brief](context/project-brief.md) · [project-vision](context/project-vision.md)

## Features and system

- [features/agent](features/agent/README.md) — orchestration, threading, collections, tools, frontend
- [AGENT-RUNTIME](system/AGENT-RUNTIME.md) · [CRITICAL-NEVER-DO](system/CRITICAL-NEVER-DO.md) · [SYSTEM-RULES](system/SYSTEM-RULES.md) · [PRIORITY-READING](system/PRIORITY-READING.md) · [CROSS-PROJECT-RULES](system/CROSS-PROJECT-RULES.md) · [OPEN-SOURCE-CONTEXT](system/OPEN-SOURCE-CONTEXT.md) · [SELF-HOSTED-GUIDE](system/SELF-HOSTED-GUIDE.md)

## Plans

- **MergedSwitcher** (2026-05-17) — historical AppSwitcher + ContentTypeSwitcher plan; implementation has since changed.
