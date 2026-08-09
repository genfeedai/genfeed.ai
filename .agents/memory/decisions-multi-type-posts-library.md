---
name: Multi-type Posts library decisions
description: Scope and tradeoffs for issue 2604
type: project
---

# Multi-type Posts Library Decisions

## Chosen approach

Federate at the Publish view boundary. Each existing service deserializes its own collection, and a typed display union adds only common table fields and filter facets.

## Alternatives considered

1. A unified backend endpoint would provide server-wide pagination, but it adds a new cross-model API and serializer contract for a contained frontend federation.
2. Moving articles and newsletters into the posts model would erase canonical ownership and require a migration far beyond this issue.
3. The selected view federation preserves boundaries and is independently removable if a server federation becomes necessary later.

## Issue delta

The issue's “correct editor desk path” is interpreted against current master: social posts open under Publish, while articles and newsletters retain their dedicated `/edit/{type}/:id` routes. Issue #2605 explicitly owns a later canonical Publish editor path for long-form artifacts.
