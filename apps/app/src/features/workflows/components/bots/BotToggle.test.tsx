// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
    orgSlug: 'acme',
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const { default: BotToggle } = await import('./BotToggle');

describe('BotToggle', () => {
  it('scopes the editor link to the active org and brand', () => {
    render(
      <BotToggle
        title="Twitter/X Reply Bot"
        description="Automatically reply to mentions"
        icon={<span />}
        iconBgColor="bg-foreground/10"
        editorPath="/orchestration/workflows/twitter-reply"
        configItems={[{ label: 'Tone', value: 'Professional' }]}
      />,
    );

    expect(
      screen.getByRole('link', { name: /advanced settings/i }),
    ).toHaveAttribute(
      'href',
      '/acme/moonrise/orchestration/workflows/twitter-reply',
    );
  });
});
