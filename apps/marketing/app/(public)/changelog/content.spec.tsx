import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChangelogContent from './content';

const RELEASES = [
  {
    body: '## [1.0.0](https://github.com/genfeedai/genfeed.ai/releases/tag/v1.0.0) - 2026-09-01\n\n### Features\n\n- **app:** palette\n\n## Fixed\n\n**Safe** [unsafe](javascript:alert(1))',
    publishedAt: '2026-09-01T00:00:00Z',
    tag: 'v1.0.0',
    url: 'https://github.com/genfeedai/genfeed.ai/releases/tag/v1.0.0',
  },
  {
    body: '',
    publishedAt: '2026-08-01T00:00:00Z',
    tag: 'v0.9.0',
    url: 'https://github.com/genfeedai/genfeed.ai/releases/tag/v0.9.0',
  },
];

describe('Changelog', () => {
  it('links every release to its own page and leaves the notes off the list', () => {
    const { container } = render(<ChangelogContent releases={RELEASES} />);

    expect(
      screen.getByRole('link', { name: /v1\.0\.0/ }).getAttribute('href'),
    ).toBe('/changelog/v1.0.0');
    expect(
      screen.getByRole('link', { name: /v0\.9\.0/ }).getAttribute('href'),
    ).toBe('/changelog/v0.9.0');
    expect(
      screen.getByRole('link', { name: /v1\.0\.0/ }).textContent,
    ).toContain('Features');
    expect(screen.getByText('September 1, 2026')).toBeTruthy();
    expect(screen.queryByText('Fixed')).toBeNull();
    expect(container.textContent).not.toContain('palette');
  });

  it('stays small with a release history that keeps growing', () => {
    const releases = Array.from({ length: 200 }, (_, index) => ({
      body: `### Features\n\n${'- a change that shipped in this release\n'.repeat(400)}`,
      publishedAt: '2026-09-01T00:00:00Z',
      tag: `v0.${index}.0`,
      url: `https://github.com/genfeedai/genfeed.ai/releases/tag/v0.${index}.0`,
    }));

    const { container } = render(<ChangelogContent releases={releases} />);

    expect(container.querySelectorAll('li')).toHaveLength(200);
    expect(container.innerHTML.length).toBeLessThan(200_000);
  });

  it('says release notes are unavailable instead of rendering an empty list', () => {
    render(<ChangelogContent isUnavailable releases={[]} />);
    expect(screen.getByText(/temporarily unavailable/)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'GitHub' }).getAttribute('href'),
    ).toBe('https://github.com/genfeedai/genfeed.ai/releases');
  });
});
