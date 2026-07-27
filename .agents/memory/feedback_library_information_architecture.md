---
name: Library information architecture
description: Library navigation owns destinations and folders; asset types are filters
type: feedback
---

Library is one asset browser, not a separate module per media type.

**Why:** Videos, images, GIFs, avatars, voices, music, and captions are facets
of the same reusable-asset workflow. Listing every type in the module nav
duplicates filter state and pushes folder organization into the canvas.

**How to apply:** Keep New Task and Search as the standard module actions.
Expose Overview, Assets, Mood board, and the shared Activity surface as
destinations. Put folders in a secondary sidebar group and keep folder
selection URL-backed. Present asset type as a control-plane filter; type routes
may remain as shareable deep links and compatibility implementation details,
but they do not occupy the navigation column. The asset grid never renders a
second folder rail.
