import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChangelogContent from './content';

describe('Changelog', () => {
  it('collapses release notes, renders markdown safely, and keeps releases linked', () => {
    const { container } = render(
      <ChangelogContent
        releases={[
          {
            tag: 'v1.0.0',
            publishedAt: '2026-09-01T00:00:00Z',
            url: 'https://github.com/genfeedai/genfeed.ai/releases/tag/v1.0.0',
            body: '## [1.0.0](https://github.com/genfeedai/genfeed.ai/releases/tag/v1.0.0) - 2026-09-01\n\n### Features\n\n- **app:** palette\n\n## Fixed\n\n**Safe** [unsafe](javascript:alert(1))\n\n<script>alert(1)</script>',
          },
          {
            tag: 'v0.9.0',
            publishedAt: '2026-08-01T00:00:00Z',
            url: 'https://github.com/genfeedai/genfeed.ai/releases/tag/v0.9.0',
            body: '',
          },
        ]}
      />,
    );
    expect(screen.queryByRole('heading', { name: 'Fixed' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /2026-09-01/ })).toBeNull();
    expect(
      screen.getByRole('button', { name: /v1\.0\.0/ }).textContent,
    ).toContain('Features');
    fireEvent.click(screen.getByRole('button', { name: /v1\.0\.0/ }));
    expect(screen.getByRole('heading', { name: 'Fixed' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /2026-09-01/ })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'v0.9.0' }).getAttribute('href'),
    ).toContain('/releases/tag/v0.9.0');
    expect(
      screen
        .getByRole('link', { name: 'v1.0.0 on GitHub' })
        .getAttribute('href'),
    ).toContain('/releases/tag/v1.0.0');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText('September 1, 2026')).toBeTruthy();
  });
});
