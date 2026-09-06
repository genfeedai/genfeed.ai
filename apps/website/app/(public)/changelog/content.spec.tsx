import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChangelogContent from './content';

describe('Changelog', () => {
  it('renders markdown safely and keeps empty releases linked', () => {
    const { container } = render(
      <ChangelogContent
        releases={[
          {
            tag: 'v1.0.0',
            publishedAt: '2026-09-01T00:00:00Z',
            url: 'https://github.com/genfeedai/genfeed.ai/releases/tag/v1.0.0',
            body: '## Fixed\n\n**Safe** [unsafe](javascript:alert(1))\n\n<script>alert(1)</script>',
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
    expect(screen.getByRole('heading', { name: 'Fixed' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'v0.9.0' }).getAttribute('href'),
    ).toContain('/releases/tag/v0.9.0');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByText('September 1, 2026')).toBeTruthy();
  });
});
