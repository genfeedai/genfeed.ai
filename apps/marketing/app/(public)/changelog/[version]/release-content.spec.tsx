import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReleaseContent from './release-content';

const RELEASE = {
  body: '## [1.0.0](https://github.com/genfeedai/genfeed.ai/releases/tag/v1.0.0) - 2026-09-01\n\n### Features\n\n- **app:** palette\n\n## Fixed\n\n**Safe** [unsafe](javascript:alert(1))\n\n<script>alert(1)</script>',
  publishedAt: '2026-09-01T00:00:00Z',
  tag: 'v1.0.0',
  url: 'https://github.com/genfeedai/genfeed.ai/releases/tag/v1.0.0',
};

describe('Release page', () => {
  it('shows the notes in full, renders markdown safely and links back', () => {
    const { container } = render(<ReleaseContent release={RELEASE} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Genfeed v1.0.0' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Features' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Fixed' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /2026-09-01/ })).toBeNull();
    expect(screen.getByText('September 1, 2026')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'All releases' }).getAttribute('href'),
    ).toBe('/changelog');
    expect(
      screen
        .getByRole('link', { name: 'v1.0.0 on GitHub' })
        .getAttribute('href'),
    ).toContain('/releases/tag/v1.0.0');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('points a release without notes at GitHub', () => {
    render(<ReleaseContent release={{ ...RELEASE, body: '' }} />);

    expect(screen.getByText(/no written notes/)).toBeTruthy();
  });
});
