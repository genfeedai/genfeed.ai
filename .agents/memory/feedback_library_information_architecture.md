---
name: Library information architecture
description: Library has three axes — type is a filter, shelf is generation state, folder is where a human filed it; origin is a fourth filter (never a destination); the canvas is a view, not a destination
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

**Origin is a filter, not a fourth axis and never a navigation destination.**
Every asset has one permanent origin — Uploaded, Generated, Imported, or Unknown
for legacy rows the backfill could not classify (`Ingredient.origin`, #6010).
Unlike the shelf it never moves: it is set once at creation and the database
rejects any change. It sits beside type in the toolbar as a multi-select
(`?origins=UPLOADED&origins=IMPORTED`) and composes with type, shelf, folder and
search; it has no sidebar entry, route or preset, and a count of it must never be
rendered as a place. Its labels are always words (Uploaded / Generated / Imported)
on grid cards, list rows and the inspector, matching the Imported / Generated /
Knowledge boundary.

**A shelf is a saved query, not a location.** Shelf counts overlap and never
partition the total. Never render them as a pie or as "x of y".

**A view is not a fourth axis.** The same filtered result set is arranged three
ways — contact sheet, list rows, and free-placement canvas — behind one
`ViewToggle` and the `?view=` key. The canvas is the former Mood board: it lost
its own route so shelf, folder and type keep applying to it, instead of being
abandoned at a nav link that reset every filter. Do not reintroduce a nav
destination for a view.

**Why:** Asset type used to be stored three times (one route per type, a filter
control, and Overview tiles), Overview held zero assets, generation state was
invisible, and folders were a flat row. One cause: one navigational axis where
three are needed.

**How to apply:**

- `/library/assets` is the canonical home; bare `/library` redirects there.
- Sidebar groups are **Places** (All assets, Recent, Starred) · **Shelves**
  (Generating, Unsorted, Needs review, Approved, Failed, Archived) · **Folders**
  (nested tree, drop targets) · tail (Trash). Brand Knowledge is not a library
  destination — it lives at `/settings/knowledge` next to Brand Kit.
  `/library/knowledge` redirects there.
- `?view=` carries `grid` · `list` · `canvas`. `grid` is the default and is
  labelled "Contact sheet". The canvas entry is gated by the PostHog flag
  `moodboard` — the key kept its name because the rollout did not move, only the
  surface did. Persistence keeps its own vocabulary (`MoodBoardsService`,
  `IMoodBoardLayoutItem`, the `mood-board` query key); only the UI was renamed.
- The Library copy never claims everything was generated: the page holds
  uploads and imports too ("Everything this brand has uploaded, imported or
  generated, in one place.").
- The asset inspector lists where an asset came from and went: "Made from" (the
  references it was generated from) and "Used in" (the outputs that used it as a
  reference), both read from the `sources` / `sourceOf` relation and filtered by
  the same org + brand access as the list. An item the member cannot see is only
  counted, never named; a trashed reference shows as "Deleted reference".
- Type routes (`/library/{videos,images,gifs,avatars,music}`) survive as
  **seeded presets** — shareable deep links for the agent, workspace cards and
  brand settings. Type is a filter, so they never appear in the nav column; the
  chips arrive pre-selected and clear without leaving the page.
- The folder axis is **brand-scoped on every destination**. A tree that
  reshuffles when you tick a type chip reintroduces exactly the coupling this
  removes. Organization-shared folders still appear: the API scope is
  `brandId: null OR brandId`.
- The asset grid never renders a second folder rail.
- Asset detail is a **workspace-shell rail pane**, not a rail of Library's own.
- Client sends `?folder=`; the API DTOs declare `folderId` and alias it via
  `resolveFolderIdAlias` — the global validation pipe whitelists, so an
  undeclared key is deleted silently.
