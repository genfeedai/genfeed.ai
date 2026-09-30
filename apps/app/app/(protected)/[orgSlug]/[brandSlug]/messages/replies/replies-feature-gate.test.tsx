import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RepliesFeatureGate from './replies-feature-gate';

const state = vi.hoisted(() => ({ isReplyBotOn: true, isSuperAdmin: false }));

vi.mock('@hooks/auth/use-is-super-admin/use-is-super-admin', () => ({
  useIsSuperAdmin: () => state.isSuperAdmin,
}));

vi.mock('@ui/guards/feature/FeatureGate', () => ({
  default: ({ children, flagKey }: { children: ReactNode; flagKey: string }) =>
    flagKey === 'reply_bot' && state.isReplyBotOn ? (
      <>{children}</>
    ) : (
      <p>Feature Unavailable</p>
    ),
}));

function renderGate() {
  return render(
    <RepliesFeatureGate>
      <span>Replies content</span>
    </RepliesFeatureGate>,
  );
}

describe('RepliesFeatureGate (#5468)', () => {
  beforeEach(() => {
    state.isReplyBotOn = true;
    state.isSuperAdmin = false;
  });

  it('shows Replies while the Admin flag is on', () => {
    renderGate();

    expect(screen.getByText('Replies content')).toBeInTheDocument();
  });

  it('hides Replies from members while the flag is off', () => {
    state.isReplyBotOn = false;

    renderGate();

    expect(screen.getByText('Feature Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Replies content')).not.toBeInTheDocument();
  });

  it('lets a superadmin open Replies while the flag is off, as the API does', () => {
    state.isReplyBotOn = false;
    state.isSuperAdmin = true;

    renderGate();

    expect(screen.getByText('Replies content')).toBeInTheDocument();
  });
});
