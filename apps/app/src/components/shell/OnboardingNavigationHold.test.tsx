import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import OnboardingNavigationHold from '@/components/shell/OnboardingNavigationHold';

const ONBOARDING_PATHNAME = '/test-org/~/agent/onboarding/thread-1';

function renderHold(pathname: string | null) {
  render(
    <>
      <OnboardingNavigationHold pathname={pathname} />
      <a href="/test-org/~/agent/onboarding/thread-1?inputRequestId=a">
        Thread
      </a>
      <a href="/onboarding/positioning">Positioning</a>
      <a href="/test-org/brand-1/library">Library</a>
      <a href="#top">Anchor</a>
    </>,
  );
}

function clickWasPrevented(name: string): boolean {
  // fireEvent returns false when a listener called preventDefault.
  return !fireEvent.click(screen.getByRole('link', { name }));
}

describe('OnboardingNavigationHold', () => {
  it('blocks links that leave agent onboarding', () => {
    renderHold(ONBOARDING_PATHNAME);

    expect(clickWasPrevented('Library')).toBe(true);
  });

  it('keeps onboarding thread and expert-path handoff links working', () => {
    renderHold(ONBOARDING_PATHNAME);

    expect(clickWasPrevented('Thread')).toBe(false);
    expect(clickWasPrevented('Positioning')).toBe(false);
    expect(clickWasPrevented('Anchor')).toBe(false);
  });

  it('does nothing outside agent onboarding', () => {
    renderHold('/test-org/brand-1/library');

    expect(clickWasPrevented('Library')).toBe(false);
  });
});
