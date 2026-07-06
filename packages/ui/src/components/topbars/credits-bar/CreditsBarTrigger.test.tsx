import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import CreditsBarTrigger from './CreditsBarTrigger';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('CreditsBarTrigger', () => {
  it('links the topbar credits control to billing and credits', () => {
    render(
      <CreditsBarTrigger
        billingHref="/test-org/~/settings/billing"
        compactBalance="0"
        fullBalance="0"
        planLimit={0}
        remainingPercent={0}
        visibleProviderSegments={[]}
      />,
    );

    expect(screen.getByTestId('topbar-credits-link')).toHaveAttribute(
      'href',
      '/test-org/~/settings/billing',
    );
    expect(
      screen.getByLabelText('0 GEN. Open billing and credits.'),
    ).toBeInTheDocument();
  });
});
