# Memory Index

Link index only. Descriptions are one line by design — open the file for detail.
Keep it that way: this file is auto-loaded into every request.

## Rules (permanent — user corrections)

- [never_lose_code](never_lose_code.md) — branch+push WIP before destructive git ops
- [trunk_pr_workflow](trunk_pr_workflow.md) — short-lived branches → PR; `master` is PR-only; secret-scan every commit
- [end_to_end_implementation](end_to_end_implementation.md) — wire the full user path, never half-architecture
- [ui_primitives](ui_primitives.md) — no raw HTML controls; enforced by `scripts/ui/control-guard.ts`
- [proxy_middleware](proxy_middleware.md) — Next.js 16 renamed `middleware.ts` → `proxy.ts`
- [codex_adversarial_review](codex_adversarial_review.md) — mandatory before ExitPlanMode
- [gh_issue_worktree_workflow](gh_issue_worktree_workflow.md) — assigned issues use worktrees off master
- [ready_pr_default](ready_pr_default.md) — ready PRs by default; draft only on request
- [no_external_symlinks](no_external_symlinks.md) — internal symlinks only (public repo)
- [p0_priority_not_label](p0_priority_not_label.md) — priority lives in Project #12, not labels
- [no_issue_body_frontmatter](no_issue_body_frontmatter.md) — no YAML in issue bodies
- [skill_boundary](skill_boundary.md) — `.agents/skills` build the app; `skills/` are product content
- [genfeed_project_kanban](genfeed_project_kanban.md) — project #12 is canonical
- [epic_status_on_child_start](epic_status_on_child_start.md) — epics go In Progress when a child starts
- [positive_memory_framing](positive_memory_framing.md) — write memory as target state
- [shared_checkout_automation](shared_checkout_automation.md) — path-scope `git add`; checkout state moves
- [gpu_instances_off_by_default](gpu_instances_off_by_default.md) — keep GPU/Fleet instances off
- [inference_servers_private_boundary](inference_servers_private_boundary.md) — inference impls stay private
- [genfeedai_managed_provider](genfeedai_managed_provider.md) — managed inference is `provider=genfeedai`
- [console_managed_inference_control_plane](console_managed_inference_control_plane.md) — console owns assignment
- [system_workflows_content_os](system_workflows_content_os.md) — automation via immutable system workflows
- [curated_agent_mcp_actions](curated_agent_mcp_actions.md) — one reviewed action catalog; OpenAPI ≠ tool parity
- [pricing_output_meter](pricing_output_meter.md) — credits throttle usage; no hard product caps
- [release_tag_after_green_deploy](release_tag_after_green_deploy.md) — failed deploy re-cuts the SAME version
- [production_deploy_master_only](production_deploy_master_only.md) — production deploys run from master CI
- [feedback_vercel_release_gate](feedback_vercel_release_gate.md) — Vercel deploys only via the release workflow

## Rules (auto-loaded via `.claude/rules` symlink)

These are already in context every request — do not re-read them to "check".

- [prd_pass_verify_state_first](rules/prd_pass_verify_state_first.md) · [prisma_legacy_alias_fields](rules/prisma_legacy_alias_fields.md) · [nestjs_value_imports_for_di](rules/nestjs_value_imports_for_di.md) · [better_auth_additional_fields](rules/better_auth_additional_fields.md) · [server_not_core](rules/server_not_core.md) · [worktree_env_sync](rules/worktree_env_sync.md) · [local_development_host](rules/local_development_host.md)
- Scoped: [00-security](rules/00-security.md) · [10-backend-services](rules/10-backend-services.md) · [20-web-apps](rules/20-web-apps.md) · [30-shared-packages](rules/30-shared-packages.md)

## Architecture decisions

- [ADR-DEPLOYMENT-MODES](architecture/ADR-DEPLOYMENT-MODES.md) — 3 modes (SaaS/Community/Desktop) as `deployment × client`; Better Auth is the active baseline; platform admin via `users.platformRole`; multi-tenancy stays EE/SaaS; managed credits cloud-only. Supersedes the auth half of #95. Contributor doc: `docs/deployment-modes.md`
- [ADR-CONVERSATION-SHELL-CONTRACTS](architecture/ADR-CONVERSATION-SHELL-CONTRACTS.md) — conversation/canvas/overlay state, scope precedence, approval pins, rollout gates
- [ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL](architecture/ADR-DYNAMIC-SCHEDULING-WORKFLOW-CANONICAL.md) — scheduling via the workflow engine
- [ADR-PLG-BOUNDARY-OSS-CLOUD](architecture/ADR-PLG-BOUNDARY-OSS-CLOUD.md) — OSS vs cloud feature split
- [ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION](architecture/ADR-WORKFLOW-BACKED-RECURRING-AGENT-AUTOMATION.md) — recurring agent automation
- [ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY](architecture/ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY.md) — OSS single-player vs cloud governance
- [VERSIONED-AGENT-ARTIFACTS](architecture/VERSIONED-AGENT-ARTIFACTS.md) — canonical refs, immutable pins, #1673 gate

## Specs and decisions (per issue)

- [filesystem-s3-path-containment](spec-filesystem-s3-path-containment.md) · [decisions](decisions-filesystem-s3-path-containment.md) — #2068
- [scheduler-target-analytics](spec-scheduler-target-analytics.md) · [decisions](decisions-scheduler-target-analytics.md) — #1975
- [pr-validation-telemetry](spec-pr-validation-telemetry.md) · [decisions](decisions-pr-validation-telemetry.md) — #1966
- [pr-validation-superseded-waste](spec-pr-validation-superseded-waste.md) · [decisions](decisions-pr-validation-superseded-waste.md)
- [brand-social-visual-enrichment](spec-brand-social-visual-enrichment.md) · [decisions](decisions-brand-social-visual-enrichment.md)
- [mcp-instagram-meta-inspiration-remix](spec-mcp-instagram-meta-inspiration-remix.md) · [decisions](decisions-mcp-instagram-meta-inspiration-remix.md)
- [local-development-host](spec-local-development-host.md) · [decisions](decisions-local-development-host.md)

## Project state

- [project_overview](project_overview.md) — monorepo structure and key context
- [project_one_api_epic](project_one_api_epic.md) — epic #95, one NestJS API
- [project_migration](project_migration.md) — cloud + core → genfeed.ai, complete
- [project_backend_typecheck](project_backend_typecheck.md) — `tsconfig.typecheck.json` per backend workspace
- [project_bullmq](project_bullmq.md) — new processors go to workers or the owning service, not API
- [project_settings_routing](project_settings_routing.md) — personal/org/brand settings URL shapes
- [project_desktop_byok_generation](project_desktop_byok_generation.md) — desktop generation is local-first
- [project_desktop_first_run](project_desktop_first_run.md) — first run, workspaces, per-account sync consent
- [project_ts6_prisma7_build_regression](project_ts6_prisma7_build_regression.md) — resolved 2026-06-03; stage 4 + migration-apply pending
- [project_fallow](project_fallow.md) — codebase health (#83), weekly CI

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

- **MergedSwitcher** (2026-05-17) — merged AppSwitcher + ContentTypeSwitcher; `packages/ui/src/components/shell/merged-switcher/MergedSwitcher.tsx`. HTML mockups gitignored under `.agents/plans/`.
