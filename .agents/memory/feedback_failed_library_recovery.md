---
name: Failed Library recovery presentation
description: User-approved Failed shelf groups attention first, omits page headers, and exposes quick soft deletion
type: feedback
last_verified: 2026-10-06
---

The Failed shelf uses grouped recovery rows: **Needs your attention** first,
**Ready to retry** second, **Unclear failure** last. The Library shell owns the
breadcrumb and filter toolbar; do not add a page title, eyebrow, introductory
description or summary header above the groups.

Expose Delete all for the current filtered failed results, visible per-row delete,
and Delete selected. Deletion moves items to Trash; confirm the actual item count
for bulk actions and preserve failures when an operation only partly succeeds.

**Why:** Vincent selected this direction from three visual alternatives and
explicitly removed the obsolete page header before approving implementation.

**How to apply:** Preserve this composition when modifying Failed recovery.
Classify provider failures conservatively; a generic 422 does not establish a
specific input problem. Open saved inputs in Studio when editing is needed.
