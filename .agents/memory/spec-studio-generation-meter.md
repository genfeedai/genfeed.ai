---
name: Honest Studio generation meter
description: Show estimated credits and real queue depth on the Studio prompt bar before generate
type: project
status: active
last_verified: 2026-08-14
topics: [studio, credits, prompt-bar, trust]
---

# Honest Studio generation meter spec

GitHub issue: #2975

**Why:** Competitive audit #2967 — Higgsfield/Kling/Runway users cannot predict cost or wait. Genfeed already computes `selectedModelCost` and never shows it. Simple Mode hides the model picker, so the estimate is also 0 because `selectedModels` is empty under auto-select.
**How to apply:** Show a compact meter next to Generate in both Simple and Advanced Mode. Credits come from the existing pricing hook. Wait is only live queue depth (`activeGenerations.length`). Never invent minutes. Never say unlimited.

## Purpose

Before a Studio generate, the operator sees how many credits this run will use and whether other generations are already queued. Auto-select still shows a credit figure, labeled as an estimate, using the category default model.

## Non-Goals

- Typical or advertised wait minutes, provider SLAs, or Higgsfield-style queue ETAs.
- Changing credit reservation, settlement, or refunds (batch/eval refunds already exist).
- Trial-vs-paid queue priority (we do not have a trial-faster-than-paid queue).
- Marketing copy, plan pages, or "unlimited" language anywhere.
- A third prompt-bar graph, model wall, or Advanced-only chrome.
- Clips / Fastlane / Batch meters in this slice (same helper may be reused later).

## Interfaces

- Pure helper `resolveStudioGenerationMeter({ credits, isEstimate, queuedCount })` → `{ label, ariaLabel, credits, isEstimate, queuedCount } | null`.
- Pure helper `resolveStudioGenerationCostModels({ selectedModels, catalog, defaultModelKey })` → `{ models, isEstimate }`.
- `usePromptBarPricing` continues to price the resolved model list.
- `PromptBarGenerationMeter` renders the label beside Generate on Essentials and Collapsed views.
- No new API. No new Prisma fields.

## Key Decisions

- Compact meter beside Generate (same density as the agent context-usage chip). Not a tooltip-only reveal. Not a banner.
- Auto-select cost uses `currentConfig.defaultModel`, else `isDefault`, else the first catalog model. Labeled `~N cr`.
- Queue copy is `N queued` from in-session `activeGenerations`. Zero queued omits that clause.
- Hide the meter when credits are 0 and nothing is queued (BYOK / unknown / empty catalog).
- Simple Mode shows the meter. It is not Advanced chrome.

## Edge Cases and Failure Modes

- Empty catalog and no selection → meter hidden.
- Cost 0 with items queued → show only queue clause.
- Multiple selected models → sum, same as today's pricing hook.
- Outputs multiplier still applies.
- Generating / Stop state keeps the meter visible so the operator still sees what they committed.

## Acceptance Criteria

- WHEN selected models have a positive priced cost THE SYSTEM SHALL show that integer credit count on the Studio prompt bar before generate.
- WHEN Simple Mode auto-selects and a default catalog model has a positive cost THE SYSTEM SHALL show that cost as an estimate (`~`).
- WHEN other generations are already active THE SYSTEM SHALL include the live queued count in the meter.
- WHEN credit cost is 0 and queued count is 0 THE SYSTEM SHALL hide the meter.
- THE SYSTEM SHALL NOT render the word unlimited on the meter.
- THE SYSTEM SHALL NOT invent a wait duration in minutes or seconds.

## Test Plan

- Unit tests for both resolvers (exact, estimate, queue-only, hidden, never-unlimited).
- `usePromptBarPricing` still covers cost math; add a case that prices fallback models.
- `PromptBarEssentials` / `PromptBarCollapsedView` render the meter in Simple Mode and hide it when the resolver returns null.
