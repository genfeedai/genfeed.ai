/**
 * `/llms.txt` for the studio origin.
 *
 * Without this route the path fell through to the app's 404 page, so agents —
 * and Lighthouse's agent-accessibility audit — got an HTML shell where a
 * Markdown index was expected ("missing a required H1 header", "does not appear
 * to contain any links").
 *
 * The studio itself is authenticated and has nothing an agent can read, so this
 * file's job is to say exactly that and point at the two origins that do hold
 * public content. The long-form product index stays on `genfeed.ai/llms.txt`,
 * which is generated from the marketing routes at build time; duplicating it
 * here would just create a second copy to keep in sync.
 */
const LLMS_TXT = `# Genfeed Studio

> The authenticated Genfeed workspace. Everything past sign-in is private
> product surface, so there is no public content to crawl on this origin.

## Public entry points

- [Sign in](https://app.genfeed.ai/login): Sign in to an existing Genfeed workspace.
- [Sign up](https://app.genfeed.ai/sign-up): Create a Genfeed workspace.

## Where to read about Genfeed

- [Genfeed](https://genfeed.ai): Product overview, pricing, and integrations.
- [Product index for LLMs](https://genfeed.ai/llms.txt): Compact index of the public site.
- [Full product text for LLMs](https://genfeed.ai/llms-full.txt): Comprehensive inline content.
- [Documentation](https://docs.genfeed.ai): Setup, configuration, API, and self-hosting.
- [Docs index for LLMs](https://docs.genfeed.ai/llms.txt): Compact index of the documentation.

## Notes

- This origin sends \`Content-Signal: ai-train=no, ai-input=no\`; please honour it.
- \`robots.txt\` allows only \`/login\` and \`/sign-up\`.
`;

export const dynamic = 'force-static';
export const revalidate = false;

export function GET(): Response {
  return new Response(LLMS_TXT, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
