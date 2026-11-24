---
name: article-reader-copy
description: Published articles are reader copy only (no research notes, no placeholders), open on a radical claim, and publish on Tuesdays and Thursdays
type: feedback
---

A published article contains reader copy and nothing else. A "What we could not verify" section, a line about a page that blocked automated access, `[TODO ...]` slots and a `[VIDEO LINK]` stub are notes from the research or drafting process. They are cut before the article is saved as published, never shipped.

**Why:** a research session's verification notes and template placeholders reached five live articles, and the owner found them on the public page. The in-app generator, the harness writing rules and the MCP save path had no rule against them and nothing checked for them.

**How to apply:**
- Cut what could not be confirmed. If a limit matters to the reader, state it inside the sentence it affects ("OpenAI prices are from a third-party catalog"). Sources go in a plain Sources list.
- `assertArticleIsReaderCopy` (`apps/server/api/src/collections/articles/utils/article-reader-copy.util.ts`) refuses to create, publish or edit a published article whose HTML has such a heading or placeholder. Drafts may still carry them while being written. Extend its patterns when a new leak shape appears; never loosen it to get a save through.
- The hook is one radical, confident claim a reader can disagree with, in the first sentence. No "My take on...", "How I...", "In this article...". Nuance lives in the body or the conclusion. The summary follows the same rule.
- Publish on Tuesdays and Thursdays, one article per slot. `publishedAt` on an article must be a Tuesday or Thursday that no other article uses.
- The writing rules live in `packages/harness/src/defaults.ts` (article block) and the article briefs in `apps/server/api/src/seeds/platform-template-catalog.ts`; the editorial gates are in `.agents/skills/seo-article-editorial/SKILL.md`.
