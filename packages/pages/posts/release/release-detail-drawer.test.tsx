import {
  CredentialPlatform,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/enums';
import type { IChannelTarget, IReleaseGroup } from '@genfeedai/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ReleaseDetailDrawer, {
  RELEASE_RESCHEDULE_ACTION,
  targetRescheduleAction,
  targetRetryAction,
} from './release-detail-drawer';

const getToken = vi.fn(async () => 'token-123');
const listBrandAccountHealth = vi.fn();

vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: vi.fn(async (getTokenFn: () => Promise<string>) =>
    getTokenFn(),
  ),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken }),
}));

vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: {
    getInstance: () => ({ listBrandAccountHealth }),
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

// Radix's Sheet portals into a dialog the jsdom tree cannot focus-trap; the
// drawer's own behavior is what these tests are about.
vi.mock('./release-engagement-rules', () => ({
  default: () => <div>Automation</div>,
}));

vi.mock('@ui/primitives/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => children,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

function target(overrides: Partial<IChannelTarget> = {}): IChannelTarget {
  return {
    executionState: TargetExecutionState.SCHEDULED,
    id: 'target-1',
    platform: CredentialPlatform.INSTAGRAM,
    retryCount: 0,
    scheduledAt: '2026-08-02T10:00:00.000Z',
    source: ReleaseTargetSource.MANUAL,
    timezone: 'UTC',
    validationIssues: [],
    validationState: TargetValidationState.VALID,
    ...overrides,
  } as IChannelTarget;
}

function release(overrides: Partial<IReleaseGroup> = {}): IReleaseGroup {
  return {
    id: 'release-1',
    scheduledAt: '2026-08-02T09:00:00.000Z',
    status: ReleaseStatus.SCHEDULED,
    targets: [target()],
    timezone: 'UTC',
    title: 'Campaign release',
    ...overrides,
  } as IReleaseGroup;
}

function buildAccount(overrides: Record<string, unknown> = {}) {
  return {
    credentialId: 'credential-1',
    handle: '@brand',
    holdPublishing: false,
    label: 'Brand Account',
    override: { isActive: false },
    platform: CredentialPlatform.INSTAGRAM,
    riskLevel: 'low',
    score: 90,
    signals: {},
    state: 'healthy',
    thresholds: {},
    ...overrides,
  };
}

function renderDrawer(
  overrides: Partial<IReleaseGroup> = {},
  pending: string | null = null,
) {
  const handlers = {
    onClose: vi.fn(),
    onRescheduleRelease: vi.fn(),
    onRescheduleTarget: vi.fn(),
    onRetryTarget: vi.fn(),
  };

  const view = render(
    <ReleaseDetailDrawer
      brandId="brand-1"
      error={null}
      pendingAction={pending}
      reconnectHref="/acme-org/acme-creator/settings/social"
      release={release(overrides)}
      {...handlers}
    />,
  );

  return { ...handlers, view };
}

describe('ReleaseDetailDrawer', () => {
  beforeEach(() => {
    getToken.mockClear();
    listBrandAccountHealth.mockReset();
    listBrandAccountHealth.mockResolvedValue([]);
  });

  it('seeds both schedule inputs from the instants the API returned', () => {
    renderDrawer();

    expect(screen.getByLabelText('Publish time')).toHaveValue(
      '2026-08-02T09:00',
    );
    expect(screen.getByLabelText('Instagram time')).toHaveValue(
      '2026-08-02T10:00',
    );
  });

  it('falls back to the release instant for a target with no override', () => {
    renderDrawer({ targets: [target({ scheduledAt: null })] });

    expect(screen.getByLabelText('Instagram time')).toHaveValue(
      '2026-08-02T09:00',
    );
  });

  it('emits an absolute instant, not the local wall-clock string', () => {
    const { onRescheduleRelease } = renderDrawer();

    fireEvent.change(screen.getByLabelText('Publish time'), {
      target: { value: '2026-08-03T14:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reschedule post' }));

    expect(onRescheduleRelease).toHaveBeenCalledWith(
      '2026-08-03T14:30:00.000Z',
    );
  });

  it('reschedules a single target through its own handler', () => {
    const { onRescheduleTarget } = renderDrawer();

    fireEvent.change(screen.getByLabelText('Instagram time'), {
      target: { value: '2026-08-03T16:00' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Reschedule Instagram target' }),
    );

    expect(onRescheduleTarget).toHaveBeenCalledWith(
      'target-1',
      '2026-08-03T16:00:00.000Z',
    );
  });

  it('offers a retry only for a failed target', () => {
    renderDrawer();
    expect(
      screen.queryByRole('button', { name: 'Retry Instagram target' }),
    ).not.toBeInTheDocument();
  });

  it('retries a failed target and surfaces why it failed', () => {
    const { onRetryTarget } = renderDrawer({
      status: ReleaseStatus.FAILED,
      targets: [
        target({
          error: {
            code: 'provider_timeout',
            failedAt: '2026-08-02T10:00:05.000Z',
            isRetryable: true,
            message: 'Provider timed out.',
          },
          executionState: TargetExecutionState.FAILED,
          lastAttemptAt: '2026-08-02T10:00:00.000Z',
          retryCount: 1,
        }),
      ],
    });

    // Once as the current failure banner, once as the history entry — the
    // banner answers "why is it red now", the entry answers "when did it fail".
    expect(screen.getAllByText('Provider timed out.')).toHaveLength(2);
    expect(screen.getByText('Retry 1')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Retry Instagram target' }),
    );
    expect(onRetryTarget).toHaveBeenCalledWith('target-1');
  });

  it('locks the release once a target published, but not its unsent siblings', () => {
    renderDrawer({
      targets: [
        target({ executionState: TargetExecutionState.PUBLISHED }),
        target({ id: 'target-2', platform: CredentialPlatform.LINKEDIN }),
      ],
    });

    // Moving the release would rewrite the instant a published target already
    // went out at; moving the target that has not gone out yet is still valid.
    expect(
      screen.getByRole('button', { name: 'Reschedule post' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reschedule Instagram target' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reschedule LinkedIn target' }),
    ).toBeEnabled();
  });

  it('sends a failed, readiness-blocked target to reconnect instead of retrying', () => {
    renderDrawer({
      status: ReleaseStatus.FAILED,
      targets: [
        target({
          executionState: TargetExecutionState.FAILED,
          readiness: {
            canSchedule: false,
            diagnostics: [
              {
                classification: 'expired_credential',
                code: 'credential_expired',
                isRetryable: false,
                message: 'The Instagram token expired.',
                severity: 'error',
              },
            ],
            requiredAction: 'Reconnect the Instagram channel.',
          } as IChannelTarget['readiness'],
        }),
      ],
    });

    expect(
      screen.getByText('Publishing setup is blocking this channel'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Reconnect the Instagram channel.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The Instagram token expired.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reschedule Instagram target' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Retry Instagram target' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('link', { name: 'Reconnect Instagram' }),
    ).toHaveAttribute('href', '/acme-org/acme-creator/settings/social');
  });

  it('lists the validation issues that produced an invalid target', () => {
    renderDrawer({
      targets: [
        target({
          validationIssues: ['Caption exceeds 2200 characters.'],
          validationState: TargetValidationState.INVALID,
        }),
      ],
    });

    expect(
      screen.getByText('Caption exceeds 2200 characters.'),
    ).toBeInTheDocument();
  });

  it('stops a second mutation racing the one already in flight', () => {
    renderDrawer({}, targetRescheduleAction('target-1'));

    expect(
      screen.getByRole('button', { name: 'Reschedule post' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reschedule Instagram target' }),
    ).toBeDisabled();
  });

  it('surfaces a rejected mutation as an alert instead of silently reverting', () => {
    render(
      <ReleaseDetailDrawer
        error="Cannot schedule: the Instagram channel is not publish-capable."
        onClose={vi.fn()}
        onRescheduleRelease={vi.fn()}
        onRescheduleTarget={vi.fn()}
        onRetryTarget={vi.fn()}
        pendingAction={null}
        reconnectHref="/acme-org/acme-creator/settings/social"
        release={release()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Cannot schedule: the Instagram channel is not publish-capable.',
    );
  });

  it('shows the analytics empty state rather than an empty table', () => {
    renderDrawer();

    expect(screen.getByText('No target analytics yet')).toBeInTheDocument();
  });

  it('says so plainly when there is no release to inspect', () => {
    render(
      <ReleaseDetailDrawer
        error={null}
        onClose={vi.fn()}
        onRescheduleRelease={vi.fn()}
        onRescheduleTarget={vi.fn()}
        onRetryTarget={vi.fn()}
        pendingAction={null}
        reconnectHref="/acme-org/acme-creator/settings/social"
        release={null}
      />,
    );

    expect(
      screen.getByText('This post has no channel targets.'),
    ).toBeInTheDocument();
  });

  it('exposes stable action identifiers for the page to key pending state on', () => {
    expect(RELEASE_RESCHEDULE_ACTION).toBe('release:reschedule');
    expect(targetRescheduleAction('t-1')).toBe('target:reschedule:t-1');
    expect(targetRetryAction('t-1')).toBe('target:retry:t-1');
  });

  it('shows a Preview action when the target carries a permalink', async () => {
    renderDrawer({ targets: [target({ url: 'https://instagram.com/p/abc' })] });

    const preview = await screen.findByRole('link', { name: 'Preview' });
    expect(preview).toHaveAttribute('href', 'https://instagram.com/p/abc');
  });

  it('omits the Preview action when the target has no permalink', () => {
    renderDrawer();

    expect(
      screen.queryByRole('link', { name: 'Preview' }),
    ).not.toBeInTheDocument();
  });

  it('offers a Reconnect action when account health flags the credential', async () => {
    listBrandAccountHealth.mockResolvedValue([
      buildAccount({
        reconnect: {
          credentialId: 'credential-1',
          isAvailable: true,
          reason: 'disconnected',
        },
      }),
    ]);

    renderDrawer({
      targets: [target({ credentialId: 'credential-1' })],
    });

    const reconnect = await screen.findByRole('link', {
      name: 'Reconnect Instagram',
    });
    expect(reconnect).toHaveAttribute(
      'href',
      '/acme-org/acme-creator/settings/social',
    );
  });

  it('does not offer account-health Reconnect when the credential is healthy', async () => {
    listBrandAccountHealth.mockResolvedValue([buildAccount()]);

    renderDrawer({
      targets: [target({ credentialId: 'credential-1' })],
    });

    await waitFor(() => expect(listBrandAccountHealth).toHaveBeenCalled());
    expect(
      screen.queryByRole('link', { name: 'Reconnect Instagram' }),
    ).not.toBeInTheDocument();
  });

  it('skips the account-health lookup when no brandId is in scope', () => {
    render(
      <ReleaseDetailDrawer
        error={null}
        onClose={vi.fn()}
        onRescheduleRelease={vi.fn()}
        onRescheduleTarget={vi.fn()}
        onRetryTarget={vi.fn()}
        pendingAction={null}
        reconnectHref="/acme-org/acme-creator/settings/social"
        release={release()}
      />,
    );

    expect(listBrandAccountHealth).not.toHaveBeenCalled();
  });
});
