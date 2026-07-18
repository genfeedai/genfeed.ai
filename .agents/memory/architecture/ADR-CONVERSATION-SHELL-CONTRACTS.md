---
name: Conversation Shell Contracts
description: Locks state, scope, trust, history, approval, multi-tab, failure recovery, and permanent route-parity contracts for epic #1670.
type: project
---

# ADR: Conversation Shell Contracts

## Status

Accepted

## Contract Version

v2.0.0

## Last Updated

2026-07-17

## Canonical Source

This file. Implementation tracking: issue #1671 and epic #1670. The exact
protected-route parity inventory is
[`reference_app_page_map.md`](../reference_app_page_map.md).

## Scope

This ADR locks the observable contracts required before the conversation-first
shell is implemented:

- conversation, focused-canvas, and temporary-overlay state and history rules
- organization, brand, resource, artifact, and approval precedence
- trusted surface registration and protected-route parity
- immutable version pins and consequential-action approval
- authoritative multi-tab context versions
- permanent agent-first shell and scoped render-recovery behavior
- post-cutover health and compatibility-removal evidence
- disposition of #1009, #1012, #1015, and #1644

It does not build the shell, migrate a product surface, add persistence, or
change workflow semantics. Those remain downstream work in #1672 and later.

**Why:** Downstream shell, context, artifact, and surface PRs need one testable
contract so they cannot diverge on history, scope, trust, approval, or recovery.

**How to apply:** Treat this ADR and its linked route inventory as the acceptance
boundary for #1672-#1682; change product-level behavior here before implementing
a conflicting downstream rule.

## Verified Baseline

This decision was checked against the repository and live issue state on
2026-07-13:

- Protected routes are Next App Router pages under `apps/app/app/(protected)`.
- Canonical URLs already encode personal, organization (`/:org/~`), brand
  (`/:org/:brand`), resource, and admin scope.
- The app switcher exposes nine primary modules plus role-gated Admin. It does
  not enumerate Workflows, Calendar, Moodboard, settings, orchestration Skills,
  Studio subroutes, or the full management and admin route set.
- The former non-SaaS terminal dock was legacy shell chrome, not a route. The
  permanent agent-first cutover removes it from protected application chrome.
- Notifications are shell-native announcements/toasts. There is no protected
  `/notifications` route in the parity inventory.
- `AgentThread` is organization-scoped but has no thread-level `brandId` yet.
  Messages may carry a brand, and server-side agent execution already validates
  a resolved brand policy.
- `ThreadContextState` has a numeric version inside JSON today, but it is a
  compression version, not the authoritative shell context version defined
  here.
- `Asset` and `Post` are durable canonical records. There is no parallel
  artifact/version store; `Asset.sha256` exists, while publish review currently
  uses `Post.reviewDecision`, `reviewEvents`, and a free-form status string.
- Generic feature flags still resolve local defaults. The agent-first shell is
  not one of them and cannot be disabled by configuration.

## Optimization Target And Considered Approaches

The target is a persistent conversation shell with zero protected-route loss,
predictable browser history, and no scope widening.

Two approaches were considered:

1. Make a new shell URL own every product surface and encode the old route as
   shell state. This centralizes the UI but duplicates routing, breaks existing
   deep links, and creates a second parity surface.
2. Keep each protected product URL canonical and add only thread/overlay state
   to it. This preserves links, keeps failures inside the shell's scoped error
   boundary, and makes the versioned route inventory the parity denominator.

The second approach is accepted.

## Core Terms

| Term                 | Contract                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation         | The active agent thread as the primary work region.                                                                                                             |
| Focused canvas       | One registered product surface or canonical protected route as the primary work region, with its selected resource encoded by the route or surface-owned query. |
| Temporary overlay    | One registered transient surface above a conversation or canvas. The underlying base location remains restorable.                                               |
| Shell location       | The browser-visible canonical path, shell query parameters, and history entry.                                                                                  |
| Execution context    | Server-authoritative organization, optional brand, selected references, and monotonic `contextVersion` used to authorize an action.                             |
| Consequential action | An action with an external, durable, destructive, financial, credential, permission, scheduling, approval, or publishing effect.                                |
| Version pin          | An immutable identity and digest for the exact canonical record state reviewed or approved.                                                                     |
| Compatibility read   | A read of legacy shell/context/artifact state used only to restore pre-migration data.                                                                          |

## Non-Negotiable Invariants

1. Exactly one top-level shell state is active: `conversation`, `canvas`, or
   `overlay`. An overlay retains exactly one base location for dismissal.
2. Canonical protected URLs remain directly addressable inside the permanent
   agent-first shell.
3. The URL may request UI state but never grants organization, brand, resource,
   admin, approval, or execution authority.
4. Organization authority comes from authenticated server membership and the
   thread's immutable organization. Organization changes create a new thread.
5. Brand and selected-reference changes are explicit server-accepted context
   mutations. Model text and model-rendered UI cannot mutate them.
6. Every consequential action carries the current server-issued
   `contextVersion`. Stale versions fail closed before execution.
7. Approval is a typed user decision bound to one immutable version pin. Chat
   text, assistant output, route state, and a generic confirmation do not grant
   approval.
8. Only a trusted registered surface may enter canvas or overlay state. Model
   output can propose a registered key and typed reference but cannot register,
   render arbitrary code, or navigate directly.
9. Invalid, inaccessible, or incomplete state falls back to a safe canonical
   route without widening scope.
10. The agent-first shell has no runtime disable path. Recovery is a normal
    deploy rollback; localized render errors stay in the shell error boundary
    without deleting threads, drafts, or product data.

## Canonical URL Contract

Existing protected paths remain canonical. The shell reserves only these query
keys:

| Key          | Meaning                                         | Rules                                                                                                             |
| ------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `thread`     | Active thread id on a non-agent protected route | Optional; server validates membership and organization. Agent thread routes continue to carry the id in the path. |
| `overlay`    | Registered overlay key                          | Valid only with a registry entry allowed for overlay mode.                                                        |
| `overlayRef` | URL-encoded typed reference in `kind:id` form   | Optional; parsed and authorized by the registered overlay. Never an approval or scope grant.                      |

Rules:

- Organization and brand slugs remain path state. Server-resolved ids are the
  authority.
- A direct product deep link without `thread` is valid canvas state. It does not
  create a server thread merely by loading. The first send or explicit thread
  selection binds a thread and replaces the current entry with `thread=<id>`.
- The selected resource remains in the canonical path when the route has an id
  segment. Existing surface-owned query parameters remain opaque to the shell.
- `contextVersion`, approval state, permission state, and artifact digests are
  never URL authority and are not persisted in browser history.
- Unknown shell query keys are ignored. An invalid reserved value is removed by
  `replace`, and the user stays on the nearest authorized canonical route.
- A brand-scoped path with a thread from another organization is rejected. The
  thread is removed from the location and no transcript or artifact is copied.

## State And Browser-History Matrix

`push` creates a user-navigable entry, `replace` canonicalizes the current
entry, `none` leaves history unchanged, and `pop` consumes browser history
without creating another entry.

| From         | Trigger                                                                 | To                                                 | History                              | Required result                                                                                                                 |
| ------------ | ----------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Initial load | Canonical conversation URL                                              | Conversation                                       | none                                 | Restore the authorized thread; otherwise replace to the new-thread conversation route.                                          |
| Initial load | Canonical product deep link                                             | Canvas                                             | none                                 | Restore the route/resource. A thread is optional until selected or first send.                                                  |
| Initial load | Valid overlay URL                                                       | Overlay                                            | none                                 | Restore the registered overlay over the encoded base location.                                                                  |
| Initial load | Invalid/inaccessible URL or reference                                   | Safest authorized conversation or canvas           | replace                              | Remove invalid state; never fall back to another org, brand, or admin scope.                                                    |
| Conversation | User launches a registered product                                      | Canvas                                             | push                                 | Preserve the thread in `thread`; use the product's canonical route.                                                             |
| Conversation | User opens a registered transient surface                               | Overlay                                            | push                                 | Keep conversation as the overlay base; browser Back dismisses it.                                                               |
| Canvas       | User navigates to another route/resource                                | Canvas                                             | push                                 | Preserve the thread and use the destination's canonical URL.                                                                    |
| Canvas       | Programmatic canonicalization or thread creation                        | Canvas                                             | replace                              | Preserve visible state while normalizing path/query.                                                                            |
| Canvas       | User returns to the active thread                                       | Conversation                                       | push                                 | Navigate to the canonical thread route without remounting or deleting it.                                                       |
| Canvas       | User opens a registered transient surface                               | Overlay                                            | push                                 | Retain the full canvas URL as the base location.                                                                                |
| Overlay      | User replaces the overlay target in the same interaction                | Overlay                                            | replace                              | Update `overlay`/`overlayRef`; one Back dismisses the overlay interaction.                                                      |
| Overlay      | User closes via UI and the current entry was shell-created              | Base conversation/canvas                           | pop                                  | Behave exactly like browser Back.                                                                                               |
| Overlay      | User closes a direct-linked/restored overlay with no owned parent entry | Base conversation/canvas                           | replace                              | Remove overlay keys without navigating outside the product.                                                                     |
| Any          | User selects another thread in the same organization                    | Conversation                                       | push                                 | Restore that thread's server context; do not carry selected resources or approvals from the previous thread.                    |
| Any          | User changes brand in the same organization                             | Same visible state or authorized fallback          | push after accepted context mutation | Keep the thread/transcript, increment `contextVersion`, clear incompatible resource/approval state, and rewrite the brand path. |
| Any          | User changes organization                                               | New-thread conversation in the target organization | push                                 | Create a target-org thread with zero transcript, artifact, approval, or draft carry.                                            |
| Any          | Browser Back/Forward                                                    | URL-described state                                | pop                                  | Attempt restore without generating history. If context is stale, apply the multi-tab rules below.                               |
| Any          | Reload                                                                  | Same URL-described state                           | none                                 | Re-resolve authorization and server context before enabling actions.                                                            |
| Any          | Shell bootstrap or render fails                                          | Scoped agent-first error state at same canonical URL | none                               | Preserve data, report the error, and offer a bounded retry without mounting legacy chrome.                                      |
| Stale tab    | User synchronizes to server context                                     | Server-authoritative location                      | replace                              | Preserve the local unsent draft, remove stale shell state, and re-enable actions only after synchronization.                    |
| Any          | Model proposes a surface/reference                                      | No immediate state change                          | none                                 | Require a trusted typed UI action or explicit user invocation before navigation.                                                |

Overlay-internal tabs, accordion state, filters, hover state, scroll, pane widths,
and composer expansion are ephemeral and do not create browser history unless a
surface already owns them as canonical URL state.

## Context Precedence And Mutation Rules

### Precedence

Higher rows override lower rows. Lower rows may propose intent but cannot widen
the effective context.

| Priority | Source                                                                       | Authority                                                                                                  |
| -------: | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
|        1 | Authenticated session, membership, platform role, deployment mode            | Defines organizations, brands, admin surfaces, and capabilities the user may access.                       |
|        2 | Thread organization plus server execution-context record                     | Defines the authoritative organization, current brand/reference state, and `contextVersion` for execution. |
|        3 | Explicit user mutation accepted by the server with expected `contextVersion` | May change brand or selected references within the same organization and increments the version.           |
|        4 | Canonical route and registered surface resolver                              | Restores UI intent and may request a validated mutation; cannot override server authority.                 |
|        5 | Focused canvas selection                                                     | May propose a selected reference after server authorization.                                               |
|        6 | Prompt-bar override                                                          | Is an explicit user mutation only after server acceptance; it is not prompt text.                          |
|        7 | Conversation/model output                                                    | Contextual suggestion only. It cannot mutate scope, state, approval, or permissions.                       |

### Organization

- `AgentThread.organizationId` is immutable for the life of a thread.
- A route organization must resolve to an authorized organization and match the
  active thread. A mismatch cannot be repaired by copying or retagging a thread.
- Switching organizations starts a new target-organization thread. Transcript,
  selected references, version pins, approvals, and unsent drafts do not carry.
- Community and Desktop have one organization. Their hidden org switcher does
  not weaken the same server validation.

### Brand

- Brand is optional for organization-wide reads and required for brand-scoped
  creation, generation, publish, schedule, and external messaging actions.
- A brand route, brand switcher, or prompt-bar brand control may request a
  same-organization brand change. The server validates membership and accepts it
  only against the current `contextVersion`.
- Browser Back/Forward to a same-thread URL with a different brand is an explicit
  navigation request. It attempts the same compare-and-swap mutation using the
  tab's latest observed `contextVersion`; a conflict follows the stale-tab rules
  and never silently reverts server context.
- An accepted brand change keeps the transcript, increments `contextVersion`,
  and clears selected resources, pins, approvals, and overlays that do not
  belong to the new brand.
- The `/:orgSlug/~/...` route form means the surface is organization-scoped. It
  does not silently erase an active thread brand. Organization-wide actions must
  explicitly support no brand; brand-required actions remain blocked until a
  brand is explicit.
- A canvas may be read-only in one brand while the thread remains bound to
  another only before synchronization. No consequential action is enabled in
  that mismatched state.

### Selected context and references

- Route/resource selection is not execution scope until the server accepts the
  typed reference into the current context version.
- A selected reference carries kind, record id, organization id, optional brand
  id, and authorization result. It never trusts display text or a client-provided
  owner id.
- Removing or losing access to a selected record clears it with a context-version
  increment and replaces the URL to the nearest safe route.
- Surface-local filters do not enter thread context unless the user explicitly
  attaches them as a typed reference.

## Authoritative Multi-Tab Behavior

The shell context version is a server-owned monotonic integer per thread. It is
separate from message sequence, compression version, artifact version, and
browser history index.

1. Every accepted brand/reference mutation increments `contextVersion` exactly
   once and returns the full effective context.
2. Every consequential request includes `expectedContextVersion` and the typed
   references/pins it intends to use.
3. A mismatch returns a conflict before side effects. The server response
   includes the latest context and version but never auto-replays the action.
4. A tab receiving a newer version, by response or subscription, becomes stale
   immediately. It may continue read-only navigation but must disable send,
   approve, schedule, publish, destructive, financial, credential, and other
   consequential controls.
5. Each tab keeps its unsent draft locally under a tab-specific key that includes
   thread id and the version at which drafting began. Drafts are never synced or
   executed implicitly.
6. Synchronization replaces the URL with the server-authoritative organization,
   brand, and valid selected reference. The local draft remains visible and is
   marked for review if its original context differs.
7. After synchronization, the user may explicitly apply the old tab's desired
   brand/reference as a new compare-and-swap mutation. No last-write-wins client
   behavior is allowed.
8. Closing an overlay in one tab does not mutate server execution context in
   another tab unless that overlay had explicitly changed a selected reference.

## Trusted Surface Boundary

A trusted registry entry is application-owned code and declares:

- stable surface key
- canonical route pattern and allowed state (`conversation`, `canvas`,
  `overlay`, or dedicated route only)
- required scope (`personal`, `organization`, `brand`, or `platform-admin`)
- typed reference parser and restoration validator
- permission/capability resolver
- deployment-mode capability requirements
- safe fallback route
- telemetry classification

The registry is allowlisted. Unknown keys, arbitrary URLs, model-produced HTML,
OpenUI blocks, tool output, and message metadata cannot become shell surfaces.
A model may emit a typed proposal that resolves to an existing registered key;
the client and server still validate it, and an explicit user action is required
for navigation or any consequential effect.

Admin, settings, billing, credentials, policy, destructive management, agent
onboarding, lab/internal pages, and full-screen editors remain canonical routes,
but render as focused canvases inside the agent-first shell. They do not bypass
the shell through a dedicated route mode.

## Protected-Route Inventory And Surface Classification

The exact baseline is `reference_app_page_map.md`: **206 parity-eligible
canonical protected patterns plus two intentional hard-cut families** as of
2026-07-13. The compiled registry currently owns **209 protected patterns**.
New protected routes enter the denominator immediately. Removing an entry
requires a separate accepted product decision.

The app switcher is discovery for nine primary modules, not the inventory.

| Route family                                                           | Required availability   | Allowed shell treatment                            | Important non-switcher coverage                                                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`, `/settings`, `/settings/help`                                     | Personal/root protected | Bootstrap or canvas                                | Personal settings and Help remain direct.                                                                                                                                            |
| `/:orgSlug`, `/:orgSlug/~/overview`, org analytics                     | Organization            | Canvas                                             | Organization overview is distinct from brand Workspace.                                                                                                                              |
| `/:orgSlug/~/agent/**`, `/:orgSlug/:brandSlug/agent/**`                | Organization or brand   | Conversation or focused canvas                     | New, journey, thread detail, onboarding, and onboarding thread routes.                                                                                                               |
| `/:orgSlug/~/{library,studio,posts,write,compose,workflows,editor}/**` | Organization            | Canvas                                             | Org-scoped catch-all products, workflow library/templates/executions/new/detail, editor projects/new/detail.                                                                         |
| `/:orgSlug/~/settings/**`                                              | Organization            | Canvas                                             | Members, billing, credits, API keys, webhooks, policy, brands, models/types, scenes, personal, Help.                                                                                 |
| `/:orgSlug/:brandSlug/{workspace,tasks,overview}/**`                   | Brand                   | Canvas; task detail may also register an overlay   | Dashboard, Inbox views, Activity, Tasks/detail, and the separate Overview Activities route.                                                                                          |
| `/:orgSlug/:brandSlug/messages`                                        | Brand                   | Canvas                                             | Full social messaging surface.                                                                                                                                                       |
| `/:orgSlug/:brandSlug/research/**`                                     | Brand                   | Canvas                                             | Discovery, Socials, Ads, Google, Meta, Following, and platform routes.                                                                                                               |
| `/:orgSlug/:brandSlug/studio/**`                                       | Brand                   | Canvas or focused editor                           | Type/detail plus Batch, Clips, and Fastlane.                                                                                                                                         |
| `/:orgSlug/:brandSlug/{compose,editor}/**`                             | Brand                   | Canvas or focused editor                           | Article, Post, Newsletter, editor index/new/detail.                                                                                                                                  |
| `/:orgSlug/:brandSlug/library/**`                                      | Brand                   | Canvas; entity detail may also register an overlay | Ingredients, Videos, Images, GIFs, Avatars, Voices, Music, Captions, and Moodboard.                                                                                                  |
| `/:orgSlug/:brandSlug/posts/**`                                        | Brand                   | Canvas; post detail may also register an overlay   | Detail, Composer, Analytics, Calendar, Newsletters, Published, Remix, Review, Scheduled.                                                                                             |
| `/:orgSlug/:brandSlug/analytics/**`                                    | Brand                   | Canvas                                             | Posts, Brands/detail/platform, Insights, Hooks, Performance Lab, Trends/detail/platform, Trend Turnover, Streaks.                                                                    |
| `/:orgSlug/:brandSlug/workflows/**`                                    | Brand                   | Canvas or focused editor                           | New/detail, Templates, Executions/detail. Workflows is not an app-switcher module.                                                                                                   |
| `/:orgSlug/:brandSlug/orchestration/**`                                | Brand                   | Canvas                                             | Agent detail, overview, new, analytics, autopilot, configuration, hire, orchestrator, runs, Skills, content runs, campaigns/detail/new, outreach campaigns/detail/new, library/type. |
| `/:orgSlug/:brandSlug/settings/**`                                     | Brand                   | Canvas                                             | Voice, harness, interview, publishing, and agent defaults.                                                                                                                           |
| `/:orgSlug/:brandSlug/lab/**`                                          | Brand                   | Canvas                                             | Articles, retired cron compatibility route, library preview, Twitter engage.                                                                                                         |
| `/admin/**`                                                            | Platform-admin          | Canvas                                             | Agent, overview/analytics, content, automation, configuration, fleet, library, organization, administration, folders, image/video detail.                                            |

Special inventory rules:

- Calendar, Workflows, Moodboard, orchestration Skills, Studio Batch/Clips/Fastlane,
  both overview dashboards, settings, and admin routes are mandatory despite not
  being primary switcher entries.
- Notifications are a shell service/accessible live-region and may use a trusted
  overlay. They are not a protected route and do not add a route denominator.
- The former Community/Desktop terminal dock is not a destination and is not
  registered. Persistent conversation chrome is shared across deployment modes.
- `/:orgSlug/~/workspace/*` and
  `/:orgSlug/~/settings/organization/*` remain intentional 404 hard cuts. The
  shell must not resurrect or redirect those families.

## Approval And Immutable Version-Pin Semantics

### Version pin

A version pin references an existing canonical `Asset`, `Post`, or other
approved content record. It is not a duplicate artifact store. The minimum
contract is:

| Field                                   | Requirement                                                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind` and `recordId`                   | Identify the canonical record type and id.                                                                                                               |
| `organizationId` and optional `brandId` | Bind the record to execution scope.                                                                                                                      |
| `contentDigest`                         | Hash the complete material state used by the consequential action, including relevant text, media/reference ids, targets, and schedule/publish settings. |
| `recordVersion`                         | Immutable version id when the record supports one; otherwise a server-issued pin id plus digest. Timestamps alone are insufficient.                      |
| `createdAt` and `createdByUserId`       | Audit provenance using canonical `users.id`.                                                                                                             |

Desktop must implement the same semantic pin for any version-bound approval it
supports. If it cannot, that approval flow is unavailable in Desktop v1;
Desktop may not silently downgrade to mutable-record approval.

### Approval

An approval records approval id, decision, approver `users.id`, approved version
pin id, organization/brand scope, `contextVersion`, and timestamp.

- Only an authenticated typed approval control can create it.
- Approval is valid only for the exact digest and scope. Any material edit,
  target/credential change, brand change, schedule change, or regenerated media
  produces a new pin and requires new approval.
- A publish/schedule/send executor loads the approved pin, re-resolves the
  canonical record, recomputes the material digest, validates normalized status
  transitions and permissions, and fails closed on any mismatch.
- `Post.status` is not approval authority. Free-form conversation, assistant
  affirmation, tool narration, workflow progress, and URL state are not approval.
- Rejection or revocation is durable. Retrying a failed execution does not grant
  approval to a new version.
- Idempotency binds to approval id plus version pin plus action/target. Repeated
  execution cannot publish a mutated record under the old approval.

## Permanent Shell And Recovery Contract

1. The agent-first shell is the protected application's default and has no
   feature-flag, cohort, environment-variable, or user-preference gate.
2. Missing or malformed generic feature-flag configuration cannot affect shell
   selection.
3. Every registered protected route renders as `conversation` or `canvas`.
   There is no registered `dedicated` bypass and no legacy terminal-dock chrome.
4. A bootstrap or render error remains inside the shell's ErrorBoundary, reports
   through the existing logger/Sentry path, and may offer a bounded retry.
5. A failure must not widen scope, redirect to another organization, mount
   legacy chrome, persist a circuit-breaker decision, or poll a runtime rollback
   endpoint.
6. Production rollback is a revert and normal deployment of the previous known
   good application SHA.
7. Compatibility reads are read-only, observable, and bounded. No new writes may
   target a retired shell/context representation.
8. SaaS, Community, Desktop-to-cloud, and Desktop-to-self-hosted share the same
   protected shell. Deployment capabilities may still select different
   onboarding implementations where the managed orchestrator is unavailable.

## Post-Cutover Health Evidence

Route parity remains 100% of the compiled protected-route inventory. Scope
violations remain zero, stale-context attempts remain blocked before side
effects, version-bound approvals must match exactly, and restoration/render
errors remain observable. First useful paint is tracked by deployment, device,
and route class.

These measurements are health and safety evidence, not promotion gates. There
is no cohort promotion, runtime kill switch, rollback rehearsal, or legacy-shell
performance comparison after the permanent cutover.

## Related-Issue Disposition

| Issue                                | Disposition                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1009 Build Agent App Surface        | Remains open only as a temporary reconciliation container until #1012 and #1015 receive shipped-state triage. No new universal shell/operator-shell work starts there. Remaining conversation-shell scope is absorbed by #1670, after which #1009 closes as superseded.                           |
| #1012 Add Agent Route Navigation     | Current code already has protected org/brand Agent routes, thread/new/journey/onboarding routes, and an Agent app-switcher entry. Treat as shipped-state/closure triage, not a dependency or new implementation lane. Any concrete missing regression check may be filed narrowly outside #1671.  |
| #1015 Build Agent Operator Workspace | Generic `/agent` workspace shell/layout scope is absorbed by #1670. Any genuinely missing run API, provenance, or operator-control capability must be re-scoped as non-shell work before #1015 closes; it cannot redefine this ADR or block #1674.                                                |
| #1644 Agent-first onboarding         | Stays open and complementary. SaaS onboarding routes use the permanent agent-first shell without a classic-wizard fallback. Community/Desktop may retain local form onboarding until managed-orchestrator parity exists. |

## Downstream Requirements

- #1672 owns durable thread brand/context-version persistence and unified
  server-boundary validation. It must not invent different precedence rules.
- #1673 owns typed references and immutable version pins over canonical records,
  not a parallel artifact store.
- #1674 may implement the shell after this ADR without waiting for #1672/#1673;
  consequential scoped actions remain unavailable until their safety contracts
  exist.
- #1675 consumes context mutation and multi-tab rules.
- #1676 consumes the trusted registry and route inventory.
- #1677 consumes overlay state and history rules.
- #1680 consumes approval/version-pin rules.
- #1682 is the historical rollout ledger and closes when the permanent cutover
  reaches production.

## Verification Contract

Downstream verification must cover:

- every row of the state/history matrix, including direct overlay links and UI
  dismissal without a parent history entry
- authorized and unauthorized direct links for every parity-inventory entry
- brand switch, organization switch, thread switch, reload, Back, and Forward
- two tabs on one thread with divergent contexts and preserved unsent drafts
- stale-version blocking for every consequential action class
- version-pin mutation, target/credential mutation, rejection, revocation,
  idempotent retry, and free-form status drift
- missing/malformed generic feature-flag configuration has no shell effect
- scoped render failure and bounded retry without legacy chrome
- SaaS, Community, Desktop-to-cloud, Desktop-to-self-hosted, and enterprise
  authorization behavior

## Related Decisions

- [`ADR-DEPLOYMENT-MODES.md`](ADR-DEPLOYMENT-MODES.md)
- [`ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY.md`](ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY.md)
- [`reference_app_page_map.md`](../reference_app_page_map.md)
- Epic #1670 and issue #1671

## Revision Log

| Version | Date       | Summary                                                                                                                                                        |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v2.0.0  | 2026-07-17 | Made the agent-first shell unconditional, removed flag/cohort/legacy fallback contracts, converted protected routes to shell canvases, and made deploy rollback the recovery path. |
| v1.0.0  | 2026-07-13 | Locked state/history, context precedence, trusted surfaces, route parity, approvals, multi-tab behavior, fallback, rollout gates, and predecessor disposition. |
