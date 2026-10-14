import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { competitors } from './competitors.data';
import {
  buildLlmsFull,
  buildLlmsIndex,
  FREE_PUBLIC_TOOLS,
} from './llms-text.data';

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('llm discovery index', () => {
  const index = buildLlmsIndex();
  const full = buildLlmsFull(null);

  it('lists every live free tool once in both LLM files', () => {
    for (const tool of FREE_PUBLIC_TOOLS) {
      expect(occurrences(index, `](https://genfeed.ai${tool.path}):`)).toBe(1);
      expect(occurrences(full, `URL: https://genfeed.ai${tool.path}\n`)).toBe(
        1,
      );
      const page =
        tool.path === '/tools'
          ? 'app/(public)/tools/page.tsx'
          : `app/(public)${tool.path}/page.tsx`;
      expect(existsSync(join(process.cwd(), page))).toBe(true);
    }
  });

  it('lists every published comparison once in both LLM files', () => {
    expect(occurrences(index, '](https://genfeed.ai/vs):')).toBe(1);
    for (const competitor of competitors) {
      const url = `https://genfeed.ai/vs/${competitor.slug}`;
      expect(occurrences(index, `](${url}):`)).toBe(1);
      expect(occurrences(full, `URL: ${url}\n`)).toBe(1);
    }
  });

  it('sends article readers to /articles', () => {
    expect(index).toContain('https://genfeed.ai/articles');
    expect(index).toContain('The site has no /blog path');
  });
});
