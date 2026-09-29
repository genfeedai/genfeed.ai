import {
  ContextSidebarOutlet,
  ContextSidebarProvider,
  useContextSidebar,
} from '@contexts/ui/context-sidebar-context';
import {
  CredentialPlatform,
  ReleaseStatus,
  ReleaseTargetSource,
  TargetExecutionState,
  TargetValidationState,
} from '@genfeedai/contracts';
import type {
  IChannelTarget,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ReleaseDetailDrawer, {
  RELEASE_RESCHEDULE_ACTION,
  RELEASE_RESUME_ACTION,
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

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/main${path}` }),
}));

vi.mock('@services/organization/credentials.service', () => ({
  CredentialsService: {
    getInstance: () => ({ listBrandAccountHealth }),
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('./release-engagement-rules', () => ({
  default: () => <div>Automation</div>,
}));

vi.mock('@ui/previews/TargetPreview', () => ({
  default: ({ target }: { target: IChannelTarget }) => (
    <div data-testid="target-preview">{target.id}</div>
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

function CloseControl() {
  const contextSidebar = useContextSidebar();

  return (
    <button type="button" onClick={contextSidebar?.close}>
      Close sidebar
    </button>
  );
}

function renderInSidebar(ui: ReactElement) {
  return render(
    <ContextSidebarProvider>
      <CloseControl />
      <ContextSidebarOutlet testId="context-sidebar-outlet" />
      {ui}
    </ContextSidebarProvider>,
  );
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

  const view = renderInSidebar(
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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
    getToken.mockClear();
    listBrandAccountHealth.mockReset();
    listBrandAccountHealth.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('explains why a paused post will not publish', () => {
    const onResumeRelease = vi.fn();
    renderInSidebar(
      <ReleaseDetailDrawer
        brandId="brand-1"
        error={null}
        pendingAction={null}
        reconnectHref="/settings/social"
        release={release({
          status: ReleaseStatus.PAUSED,
          targets: [target({ executionState: TargetExecutionState.PAUSED })],
        })}
        onClose={vi.fn()}
        onRescheduleRelease={vi.fn()}
        onRescheduleTarget={vi.fn()}
        onResumeRelease={onResumeRelease}
        onRetryTarget={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        'This post is paused, so the publisher will not send it at the scheduled time.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume post' }));
    expect(onResumeRelease).toHaveBeenCalledOnce();
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
    fireEvent.change(screen.getByLabelText('LinkedIn time'), {
      target: { value: '2026-08-03T16:00' },
    });
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

  it('renders nothing when there is no release to inspect', () => {
    renderInSidebar(
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
      screen.queryByTestId('release-detail-panel'),
    ).not.toBeInTheDocument();
  });

  it('moves analytics into a tab alongside the preview', async () => {
    const user = userEvent.setup();
    renderDrawer();

    expect(screen.getAllByTestId('target-preview').length).toBeGreaterThan(0);
    expect(
      screen.queryByText('No target analytics yet'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Analytics' }));

    expect(screen.queryByTestId('target-preview')).not.toBeInTheDocument();
    expect(screen.getByText('No target analytics yet')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(screen.getAllByTestId('target-preview').length).toBeGreaterThan(0);
  });

  it('exposes stable action identifiers for the page to key pending state on', () => {
    expect(RELEASE_RESCHEDULE_ACTION).toBe('release:reschedule');
    expect(RELEASE_RESUME_ACTION).toBe('release:resume');
    expect(targetRescheduleAction('t-1')).toBe('target:reschedule:t-1');
    expect(targetRetryAction('t-1')).toBe('target:retry:t-1');
  });

  it('shows a Preview action when the target carries a permalink', async () => {
    renderDrawer({ targets: [target({ url: 'https://instagram.com/p/abc' })] });

    const preview = await screen.findByRole('link', { name: 'Preview' });
    expect(preview).toHaveAttribute('href', 'https://instagram.com/p/abc');
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

  describe('inline reschedule from the context sidebar', () => {
    function renderWith(
      props: {
        error?: string | null;
        onAddChannel?: () => void;
        pending?: string | null;
        release?: IReleaseGroup;
      } = {},
    ) {
      const handlers = {
        onClose: vi.fn(),
        onRescheduleRelease: vi.fn(),
        onRescheduleTarget: vi.fn(),
        onRetryTarget: vi.fn(),
      };
      const view = (
        release: IReleaseGroup,
        error: string | null,
        pending: string | null,
      ) => (
        <ReleaseDetailDrawer
          brandId="brand-1"
          error={error}
          onAddChannel={props.onAddChannel}
          pendingAction={pending}
          reconnectHref="/acme-org/acme-creator/settings/social"
          release={release}
          {...handlers}
        />
      );
      const utils = renderInSidebar(
        view(
          props.release ?? release(),
          props.error ?? null,
          props.pending ?? null,
        ),
      );

      return {
        ...handlers,
        rerender: (
          next: IReleaseGroup,
          error: string | null = null,
          pending: string | null = null,
        ) =>
          utils.rerender(
            <ContextSidebarProvider>
              <CloseControl />
              <ContextSidebarOutlet testId="context-sidebar-outlet" />
              {view(next, error, pending)}
            </ContextSidebarProvider>,
          ),
      };
    }

    it('renders the post into the context sidebar outlet', async () => {
      renderWith();

      expect(
        await screen.findByTestId('release-detail-panel'),
      ).toBeInTheDocument();
      expect(
        screen
          .getByTestId('context-sidebar-outlet')
          .contains(screen.getByTestId('release-detail-panel')),
      ).toBe(true);
    });

    it('keeps the button disabled until the time actually changes', () => {
      renderWith();
      const button = screen.getByRole('button', { name: 'Reschedule post' });

      expect(button).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Publish time'), {
        target: { value: '2026-08-03T14:30' },
      });
      expect(button).toBeEnabled();

      fireEvent.change(screen.getByLabelText('Publish time'), {
        target: { value: '2026-08-02T09:00' },
      });
      expect(button).toBeDisabled();
    });

    it('disables the button when the field is cleared', () => {
      renderWith();

      fireEvent.change(screen.getByLabelText('Publish time'), {
        target: { value: '' },
      });

      expect(
        screen.getByRole('button', { name: 'Reschedule post' }),
      ).toBeDisabled();
    });

    it('rejects a time in the past without calling the API', () => {
      const { onRescheduleRelease } = renderWith();

      fireEvent.change(screen.getByLabelText('Publish time'), {
        target: { value: '2026-06-30T09:00' },
      });

      expect(
        screen.getByText('Pick a time that is now or later.'),
      ).toBeInTheDocument();
      const button = screen.getByRole('button', { name: 'Reschedule post' });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(onRescheduleRelease).not.toHaveBeenCalled();
    });

    it('rejects a past time on a target the same way', () => {
      const { onRescheduleTarget } = renderWith();

      fireEvent.change(screen.getByLabelText('Instagram time'), {
        target: { value: '2026-06-30T09:00' },
      });

      expect(
        screen.getByRole('button', { name: 'Reschedule Instagram target' }),
      ).toBeDisabled();
      expect(onRescheduleTarget).not.toHaveBeenCalled();
    });

    it('shows a pending spinner on the control that is saving and locks the rest', () => {
      renderWith({ pending: RELEASE_RESCHEDULE_ACTION });

      expect(
        screen.getByRole('button', { name: 'Reschedule post' }),
      ).toBeDisabled();
      expect(screen.getByLabelText('Publish time')).toBeDisabled();
      expect(screen.getByLabelText('Instagram time')).toBeDisabled();
    });

    it('confirms a saved reschedule and shows the new time', () => {
      const { rerender } = renderWith();

      fireEvent.change(screen.getByLabelText('Publish time'), {
        target: { value: '2026-08-03T14:30' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Reschedule post' }));
      rerender(release(), null, RELEASE_RESCHEDULE_ACTION);
      expect(screen.queryByText('Rescheduled.')).not.toBeInTheDocument();

      rerender(release({ scheduledAt: '2026-08-03T14:30:00.000Z' }));

      expect(screen.getByLabelText('Publish time')).toHaveValue(
        '2026-08-03T14:30',
      );
      expect(screen.getByRole('status')).toHaveTextContent('Rescheduled.');
      expect(
        screen.getByRole('button', { name: 'Reschedule post' }),
      ).toBeDisabled();
    });

    it('keeps the typed time and the whole panel usable after a failed save', () => {
      const failed = release({
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
          }),
        ],
      });
      const { onRescheduleRelease, onRetryTarget, rerender } = renderWith({
        release: failed,
      });

      fireEvent.change(screen.getByLabelText('Publish time'), {
        target: { value: '2026-08-03T14:30' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Reschedule post' }));
      rerender(failed, null, RELEASE_RESCHEDULE_ACTION);
      rerender(failed, 'The schedule change could not be saved.', null);

      expect(screen.getByRole('alert')).toHaveTextContent(
        'The schedule change could not be saved.',
      );
      expect(screen.getByLabelText('Publish time')).toHaveValue(
        '2026-08-03T14:30',
      );
      expect(screen.queryByText('Rescheduled.')).not.toBeInTheDocument();

      const button = screen.getByRole('button', { name: 'Reschedule post' });
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(onRescheduleRelease).toHaveBeenCalledTimes(2);

      fireEvent.click(
        screen.getByRole('button', { name: 'Retry Instagram target' }),
      );
      expect(onRetryTarget).toHaveBeenCalledWith('target-1');
    });

    it('locks the field for a post that can no longer move', () => {
      renderWith({ release: release({ status: ReleaseStatus.PUBLISHED }) });

      expect(screen.getByLabelText('Publish time')).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Reschedule post' }),
      ).toBeDisabled();
      expect(screen.getByText(/can no longer be moved/)).toBeInTheDocument();
    });

    it('keeps Add channel, Resume, Retry and Reconnect alongside the time field', async () => {
      const onAddChannel = vi.fn();
      const onResumeRelease = vi.fn();
      listBrandAccountHealth.mockResolvedValue([
        buildAccount({
          reconnect: {
            credentialId: 'credential-1',
            isAvailable: true,
            reason: 'disconnected',
          },
        }),
      ]);
      renderInSidebar(
        <ReleaseDetailDrawer
          brandId="brand-1"
          error={null}
          onAddChannel={onAddChannel}
          onClose={vi.fn()}
          onRescheduleRelease={vi.fn()}
          onRescheduleTarget={vi.fn()}
          onResumeRelease={onResumeRelease}
          onRetryTarget={vi.fn()}
          pendingAction={null}
          reconnectHref="/acme-org/acme-creator/settings/social"
          release={release({
            status: ReleaseStatus.PAUSED,
            targets: [
              target({
                credentialId: 'credential-1',
                executionState: TargetExecutionState.FAILED,
              }),
            ],
          })}
        />,
      );
      expect(screen.getByLabelText('Publish time')).toBeInTheDocument();
      expect(screen.getByLabelText('Instagram time')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Add channel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Resume post' }));
      expect(onAddChannel).toHaveBeenCalledOnce();
      expect(onResumeRelease).toHaveBeenCalledOnce();
      expect(
        screen.getByRole('button', { name: 'Retry Instagram target' }),
      ).toBeEnabled();
      expect(
        await screen.findByRole('link', { name: 'Reconnect Instagram' }),
      ).toHaveAttribute('href', '/acme-org/acme-creator/settings/social');
    });
  });
});
