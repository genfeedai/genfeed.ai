import { describe, expect, it } from 'vitest';
import { parseArgs } from './repair-media-previews.args';

describe('repair-media-previews parseArgs', () => {
  it('is a dry run unless --apply is passed', () => {
    expect(parseArgs([]).isApply).toBe(false);
    expect(parseArgs(['--apply']).isApply).toBe(true);
  });

  it('reads the organization filter and numeric limits', () => {
    expect(
      parseArgs(['--organization', 'org-1', '--limit', '40', '--sample', '3']),
    ).toEqual({
      isApply: false,
      limit: 40,
      organizationId: 'org-1',
      sample: 3,
    });
  });

  it('falls back to defaults for missing or invalid numbers', () => {
    const options = parseArgs(['--limit', 'abc', '--sample', '-2']);
    expect(options.limit).toBe(500);
    expect(options.sample).toBe(10);
    expect(options.organizationId).toBeNull();
  });
});
