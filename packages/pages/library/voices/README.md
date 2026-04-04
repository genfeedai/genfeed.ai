# Library Voices Page

`/library/voices` must use the shared `IngredientsLayout` shell used by the other library pages.

## Layout Contract

- Route shell: `IngredientsLayout`
- Scope: `PageScope.BRAND`
- Type: `voices`
- Tabs: hidden

This keeps the page title, description, refresh action, and filter entrypoint aligned with `/library/videos`, `/library/images`, `/library/gifs`, and `/library/music`.

## Page Responsibilities

`library-voices-page.tsx` owns only voices-specific content:

- rendering the voice card grid
- setting organization and brand default voices
- cloning and deleting cloned voices
- syncing its fetch parameters from the shared ingredients filter context

Do not add a separate hero, standalone page header, or duplicate top-level refresh/filter controls here unless the shared library shell is intentionally being changed for all library pages.
