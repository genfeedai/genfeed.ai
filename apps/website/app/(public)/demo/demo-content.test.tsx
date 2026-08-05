import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import DemoContent from './demo-content';

vi.mock('@hooks/ui/use-gsap-entrance', () => ({
  gsapPresets: {
    fadeUp: vi.fn(() => ({})),
  },
  useGsapEntrance: () => ({ current: null }),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock(
  '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess',
  () => ({ default: () => <span>Request access</span> }),
);

vi.mock('@web-components/PageLayout', () => ({
  default: ({ children, title }: { children: ReactNode; title: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

describe('DemoContent headings', () => {
  it('keeps the PageLayout title as the only H1', () => {
    render(<DemoContent />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Demo' }),
    ).toBeInTheDocument();
  });
});
