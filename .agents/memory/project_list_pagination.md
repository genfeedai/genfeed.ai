---
name: List pagination ownership
description: Each paginated list keeps response totals with its rows and passes them explicitly to AutoPagination.
type: project
last_verified: 2026-11-02
---

Paginated lists own their metadata. `AutoPagination` requires `totals: IPageTotals` from the same response/cache entry as the displayed rows; the current page remains URL-driven.

**Why:** Unrelated requests and cached revisits must not overwrite another list's footer. The shared global totals and request-order bookkeeping were retired under #9017.

**How to apply:** Use `BaseService.findAllPage` or the pure `toPaginatedResponse` mapper for custom JSON:API clients. Cache the native `IPaginatedResponse` (or existing `IPagedItems`) with the rows. Pass empty totals for an unresolved scope, and preserve metadata in functional row-edit updates. Keep all-pages summaries and pickers separate from a server-paged table. Infinite lists use their own cursor/next-page response metadata.

The required `AutoPaginationProps.totals` field prevents new implicit footer consumers. Keep service array APIs as thin wrappers where existing callers still need arrays; those wrappers have no pagination side effects.
