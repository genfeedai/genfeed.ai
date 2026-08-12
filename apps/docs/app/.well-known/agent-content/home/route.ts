import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const dynamic = 'force-static';
export const revalidate = false;

export function GET(): Response {
  const markdown = readFileSync(
    resolve(process.cwd(), 'public/llms.txt'),
    'utf8',
  );

  return new Response(markdown, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Content-Signal': 'ai-train=no, search=yes, ai-input=yes',
      'Content-Type': 'text/markdown; charset=utf-8',
      Vary: 'Accept',
      'X-Markdown-Tokens': String(Math.ceil(markdown.length / 4)),
    },
  });
}
