import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('app llms.txt', () => {
  it('satisfies the llmstxt.org shape: one H1 and at least one link', async () => {
    const body = await GET().text();

    expect(body.split('\n')[0]).toBe('# Genfeed Studio');
    expect(body.match(/^# /gm)).toHaveLength(1);
    expect(body).toMatch(/\[[^\]]+\]\(https:\/\/[^)]+\)/);
  });
});
