import { describe, expect, it } from 'vitest';
import { releaseNotes, releaseSummary } from './release-notes';

describe('release notes', () => {
  it('drops the linked version heading the row already shows', () => {
    const notes = releaseNotes(
      '\n## [0.1.76](https://github.com/genfeedai/genfeed.ai/releases/tag/v0.1.76) - 2026-09-25\n\n### Features\n\n- **app:** palette\n',
      'v0.1.76',
    );
    expect(notes.startsWith('### Features')).toBe(true);
    expect(notes).not.toContain('0.1.76');
  });

  it('drops a plain version heading and keeps the rest', () => {
    const notes = releaseNotes(
      '## v0.1.2\n\nPromotes staging.\n\n### Highlights\n\n- billing\n',
      'v0.1.2',
    );
    expect(notes.startsWith('Promotes staging.')).toBe(true);
    expect(releaseSummary(notes)).toBe('Highlights');
  });

  it('keeps older changelog headings and counts their items', () => {
    const notes = releaseNotes(
      "## What's Changed\n* fix(api): scope the lookup by @VincentShipsIt in https://github.com/genfeedai/genfeed.ai/pull/1\n* fix(app): align the row\n",
      'v0.1.64',
    );
    expect(notes.startsWith("## What's Changed")).toBe(true);
    expect(releaseSummary(notes)).toBe('2 changes');
  });

  it('summarizes the first three sections', () => {
    expect(
      releaseSummary(
        '### Features\n\n- one\n\n### Fixes\n\n- two\n\n### Performance\n\n- three\n\n### Internal\n\n- four\n',
      ),
    ).toBe('Features · Fixes · Performance · +1');
  });
});
