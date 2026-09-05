---
name: card-metric-surface
description: One Card frame + MetricCard states for all metric/stat tiles — stop inventing new card components
type: project
last_verified: 2026-09-05
---

# Card + metric surface (canonical)

**Why:** Agents kept inventing StatCard, KPICard, SummaryMetricCard, StatsCards
icon layouts, nested MetricCardGrid soup, and raw `div` “cards”. That produced
inconsistent radius, padding, and label→value order across Workspace / Discover /
Review.

## Use these only

| Need | Component | Import |
|------|-----------|--------|
| **Surface frame** (panel, empty, content block) | `Card` | `@ui/card/Card` |
| **Single metric tile** | `MetricCard` | `@ui/cards/metric-card/MetricCard` |
| **Metric grid** | `MetricCardGrid` | `@ui/cards/metric-card/MetricCardGrid` |
| **Dense strip inside a surface** | `MetricSummary` | same file as MetricCard |
| **Section shell** (eyebrow + title + actions) | `WorkspaceSurface` | `@ui/overview/WorkspaceSurface` |

## MetricCard states (props, not new files)

- `appearance="tile"` (default) — framed Card, **label → value → description**
- `appearance="inline"` — frameless value+label for `MetricSummary`
- `size="sm" | "md" | "lg"` — scale only
- `trend?: number` — omit to hide
- `icon?` — optional decoration

## Forbidden

- New `*Card` components for “just a number + label”
- Raw `<div className="rounded-xl border…">` metric tiles
- Nested 4-up `MetricCardGrid` **inside** a WorkspaceSurface when a one-line
  `MetricSummary` is enough
- Hand-rolled uppercase label + big value that duplicates MetricCard

## Remaining prop contract

`KPICardProps` supplies the admin overview metric data. Rendering uses MetricCard.

## Frame contract

All metric tiles go through `Card` → `rounded-card` (0px) + `shadow-border`.
Never `rounded-xl` / `rounded-2xl` for app metrics.
