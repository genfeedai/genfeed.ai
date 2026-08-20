---
name: Library information architecture
description: Library has three axes — type is a filter, shelf is generation state, folder is where a human filed it
type: feedback
---

Library is one asset browser with **three orthogonal axes**, not a module per
media type.

| axis | what it answers | stored as | surface |
| --- | --- | --- | --- |
| **Type** | what the asset is | `categories` | multi-select chips |
| **Shelf** | where it is in its own generation | `status` / `reviewStatus` / `qualityStatus` | sidebar group + `/library/shelf/[shelf]` |
| **Folder** | where a human filed it | `folderId` | sidebar tree + `?folder=` |

An asset has one type, sits on one shelf, and lives in at most one folder. The
shelf moves on its own as the asset renders and gets reviewed; the folder moves
only when a human moves it. That independence is the whole point — it is what a
plain Drive clone cannot express.

**A shelf is a saved query, not a location.** Shelf counts overlap and never
partition the total. Never render them as a pie or as "x of y".

**Why:** Asset type used to be stored three times (one route per type, a filter
control, and Overview tiles), Overview held zero assets, generation state was
invisible, and folders were a flat row. One cause: one navigational axis where
three are needed.

**How to apply:**

- `/library/assets` is the canonical home; bare `/library` redirects there.
- Sidebar groups are **Places** (All assets, Recent, Starred) · **Shelves**
  (Generating, Unsorted, Needs review, Approved, Failed, Archived) · **Folders**
  (nested tree, drop targets) · tail (Mood board, Trash).
- Type routes (`/library/{videos,images,gifs,avatars,music}`) survive as
  **seeded presets** — shareable deep links for the agent, workspace cards and
  brand settings. Type is a filter, so they never appear in the nav column; the
  chips arrive pre-selected and clear without leaving the page.
- The folder axis is **brand-scoped on every destination**. A tree that
  reshuffles when you tick a type chip reintroduces exactly the coupling this
  removes. Organization-shared folders still appear: the API scope is
  `brandId: null OR brandId`.
- The asset grid never renders a second folder rail.
- Client sends `?folder=`; the API DTOs declare `folderId` and alias it via
  `resolveFolderIdAlias` — the global validation pipe whitelists, so an
  undeclared key is deleted silently.
