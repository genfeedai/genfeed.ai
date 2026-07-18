import type { IDesktopSession } from '@genfeedai/desktop-contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SidebarFooter from './SidebarFooter';

const session: IDesktopSession = {
  issuedAt: '2026-07-18T00:00:00.000Z',
  token: 'test-token',
  userId: 'cloud-user',
  userName: 'Vincent',
};

function renderFooter(activeSession: IDesktopSession | null) {
  render(
    <SidebarFooter
      isCollapsed={false}
      isSyncing={false}
      lastSyncAt={null}
      onConnectCloud={vi.fn()}
      onLogout={vi.fn()}
      onReviewSyncConsent={vi.fn()}
      onTriggerSync={vi.fn()}
      session={activeSession}
      syncConsent={{
        hasFullAssetUploadConsent: false,
        status: 'not-required',
      }}
      syncErrors={[]}
      syncState={{
        failedCount: 0,
        pendingCount: 0,
        retryingCount: 0,
        runningCount: 0,
      }}
    />,
  );
}

describe('SidebarFooter', () => {
  it('shows the connected account email when available', () => {
    renderFooter({ ...session, userEmail: 'vincent@example.com' });
    expect(screen.getByText('vincent@example.com')).toBeInTheDocument();
  });

  it('shows a connected fallback when the account has no email', () => {
    renderFooter(session);
    expect(screen.getByText('Connected to Genfeed Cloud')).toBeInTheDocument();
  });

  it('labels the account-less workspace as device-local', () => {
    renderFooter(null);
    expect(screen.getByText('On this device')).toBeInTheDocument();
  });
});
