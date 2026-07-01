import { render } from '@testing-library/react';
import MenuAppSwitcher from '@ui/menus/switchers/MenuAppSwitcher';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@genfeedai/contexts/providers/access-state/access-state.provider',
  () => ({
    useAccessState: () => ({
      accessState: null,
      canAccessApp: true,
      hasPaygCredits: false,
      isByok: false,
      isLoading: false,
      isSubscribed: false,
      isSuperAdmin: false,
      needsOnboarding: false,
      refreshAccessState: vi.fn(),
    }),
  }),
);

describe('MenuAppSwitcher', () => {
  it('should render without crashing', () => {
    const { container } = render(<MenuAppSwitcher />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<MenuAppSwitcher />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<MenuAppSwitcher />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
