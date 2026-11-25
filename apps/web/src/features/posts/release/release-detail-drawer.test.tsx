import {
  ContextSidebarHeaderOutlet,
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
import {
  RELEASE_RESCHEDULE_ACTION,
  RELEASE_RESUME_ACTION,
  targetRescheduleAction,
  targetRetryAction,
} from './release-actions';
import ReleaseDetailDrawer from './release-detail-drawer';

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

const findOnePost = vi.fn();

vi.mock('@services/content/posts.service', () => ({
  PostsService: { getInstance: () => ({ findOne: findOnePost }) },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('./release-campaign-field', () => ({
  default: ({
    campaignId,
    onChange,
  }: {
    campaignId: string | null | undefined;
    onChange: (campaignId: string | null) => void;
  }) => (
    <button onClick={() => onChange('campaign-9')} type="button">
      Campaign {campaignId ?? 'none'}
    </button>
  ),
}));

vi.mock('./release-engagement-rules', () => ({
  default: () => <div>Automation</div>,
}));

vi.mock('@/components/previews/TargetPreview', () => ({
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
    label: 'Brand Account',
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

function SidebarFrame({ children }: { children: ReactElement }) {
  return (
    <ContextSidebarProvider>
      <CloseControl />
      <ContextSidebarHeaderOutlet testId="context-sidebar-header-actions" />
      <ContextSidebarOutlet testId="context-sidebar-outlet" />
      {children}
    </ContextSidebarProvider>
  );
}

/** Opens one of the drawer's views from its header icon, like a person would. */
function openView(name: 'Analytics' | 'Settings' | 'Preview') {
  fireEvent.click(screen.getByRole('button', { name }));
}

/**
 * The drawer opens on the post preview. Most of what these tests cover lives
 * in Settings, so they start there; pass `view: 'preview'` to stay on the
 * preview.
 */
function renderInSidebar(
  ui: ReactElement,
  { view = 'details' }: { view?: 'details' | 'preview' } = {},
) {
  const utils = render(<SidebarFrame>{ui}</SidebarFrame>);
  if (
    view === 'details' &&
    screen.queryByRole('button', { name: 'Settings' })
  ) {
    openView('Settings');
  }
  return utils;
}

function renderDrawer(
  overrides: Partial<IReleaseGroup> = {},
  pending: string | null = null,
  initialView: 'details' | 'preview' = 'details',
) {
  const handlers = {
    onClose: vi.fn(),
    onCompleteManualPost: vi.fn(),
    onRescheduleRelease: vi.fn(),
    onRescheduleTarget: vi.fn(),
    onRetryTarget: vi.fn(),
    onSkipManualPost: vi.fn(),
  };

  const view = renderInSidebar(
    <ReleaseDetailDrawer
      brandId="brand-1"
      error={null}
      pendingAction={pending}
      reconnectHref="/acme-org/~/settings/profile"
      release={release(overrides)}
      {...handlers}
    />,
    { view: initialView },
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
    findOnePost.mockReset();
    findOnePost.mockResolvedValue({
      credential: { externalName: 'Shayla', platform: 'instagram' },
      id: 'target-1',
      ingredients: [
        { category: 'image', cdnUrl: 'https://cdn.test/1.jpg', id: 'a' },
        { category: 'image', cdnUrl: 'https://cdn.test/2.jpg', id: 'b' },
      ],
    });
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

  it('moves the release into a campaign through its own handler', () => {
    const onChangeCampaign = vi.fn();
    renderInSidebar(
      <ReleaseDetailDrawer
        brandId="brand-1"
        error={null}
        onChangeCampaign={onChangeCampaign}
        onClose={vi.fn()}
        onRescheduleRelease={vi.fn()}
        onRescheduleTarget={vi.fn()}
        onRetryTarget={vi.fn()}
        pendingAction={null}
        reconnectHref="/acme-org/~/settings/profile"
        release={release({ campaignId: 'campaign-1' })}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Campaign campaign-1' }),
    );

    expect(onChangeCampaign).toHaveBeenCalledWith('campaign-9');
  });

  it('hides the campaign field when the caller cannot change campaigns', () => {
    renderDrawer();

    expect(screen.queryByText('Campaign none')).not.toBeInTheDocument();
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

  it('explains why a paused post will not publish', () => {
    const onResumeRelease = vi.fn();
    renderInSidebar(
      <ReleaseDetailDrawer
        brandId="brand-1"
        error={null}
        pendingAction={null}
        reconnectHref="/settings/profile"
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

    expect(screen.getByText('Provider timed out.')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Retry Instagram target' }),
    );
    expect(onRetryTarget).toHaveBeenCalledWith('target-1');
  });

  it('asks for a refused X quote by hand instead of showing a plain failure', () => {
    renderDrawer({
      baseContent: 'Shipped it.',
      status: ReleaseStatus.FAILED,
      targets: [
        target({
          error: {
            code: 'x_quote_refused',
            failedAt: '2026-08-02T10:00:05.000Z',
            isRetryable: false,
            message: 'X refused this quote post.',
          },
          executionState: TargetExecutionState.FAILED,
          platform: CredentialPlatform.TWITTER,
          settings: { quotedPost: '1856322244019101979' },
        }),
      ],
    });

    expect(screen.getByText('Needs your post')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in X' })).toHaveAttribute(
      'href',
      'https://x.com/intent/post?text=Shipped+it.&url=https%3A%2F%2Fx.com%2Fi%2Fstatus%2F1856322244019101979',
    );
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
    // A target that already published has no schedule to move at all.
    expect(
      screen.getByRole('button', { name: 'Reschedule post' }),
    ).toBeDisabled();
    expect(screen.queryByLabelText('Instagram time')).not.toBeInTheDocument();
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
    ).toHaveAttribute('href', '/acme-org/~/settings/profile');
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
    renderInSidebar(
      <ReleaseDetailDrawer
        error="Cannot schedule: the Instagram channel is not publish-capable."
        onClose={vi.fn()}
        onRescheduleRelease={vi.fn()}
        onRescheduleTarget={vi.fn()}
        onRetryTarget={vi.fn()}
        pendingAction={null}
        reconnectHref="/acme-org/~/settings/profile"
        release={release()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Cannot schedule: the Instagram channel is not publish-capable.',
    );
  });

  it('shows the analytics empty state rather than an empty table', async () => {
    renderDrawer();

    openView('Analytics');

    expect(screen.getByText('No target analytics yet')).toBeInTheDocument();
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
        reconnectHref="/acme-org/~/settings/profile"
        release={null}
      />,
    );

    expect(
      screen.queryByTestId('release-detail-panel'),
    ).not.toBeInTheDocument();
  });

  it('opens on the post as authored, with a chip for every channel', async () => {
    renderDrawer(
      {
        baseContent: 'Shipped it.',
        targets: [
          target(),
          target({ id: 'target-2', platform: CredentialPlatform.LINKEDIN }),
        ],
      },
      null,
      'preview',
    );

    const global = await screen.findByTestId('release-global-preview');
    expect(global).toHaveTextContent('Shipped it.');
    expect(screen.getByRole('radio', { name: 'All channels' })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'Instagram' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'LinkedIn' })).toBeInTheDocument();
    expect(screen.queryByTestId('target-preview')).not.toBeInTheDocument();
  });

  it('draws the account and slides from the post in the Global preview', async () => {
    renderDrawer({}, null, 'preview');

    const global = await screen.findByTestId('release-global-preview');
    await waitFor(() => expect(global).toHaveTextContent('Shayla'));
    expect(
      await screen.findByRole('group', { name: 'Carousel' }),
    ).toBeInTheDocument();
  });

  it('shows a channel in its own layout when its chip is picked', async () => {
    const user = userEvent.setup();
    renderDrawer(
      {
        targets: [
          target(),
          target({ id: 'target-2', platform: CredentialPlatform.LINKEDIN }),
        ],
      },
      null,
      'preview',
    );

    await user.click(screen.getByRole('radio', { name: 'LinkedIn' }));

    expect(screen.getByTestId('target-preview')).toHaveTextContent('target-2');
    expect(
      screen.queryByTestId('release-global-preview'),
    ).not.toBeInTheDocument();
  });

  it('swaps the drawer content from the header icons', () => {
    renderDrawer({}, null, 'preview');

    expect(screen.getByTestId('release-preview-panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    openView('Analytics');
    expect(
      screen.queryByTestId('release-preview-panel'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('No target analytics yet')).toBeInTheDocument();

    openView('Settings');
    expect(screen.getByTestId('release-details-view')).toBeInTheDocument();

    openView('Preview');
    expect(screen.getByTestId('release-preview-panel')).toBeInTheDocument();
  });

  it('offers the full editor and a series slot from the Settings view', () => {
    renderInSidebar(
      <ReleaseDetailDrawer
        brandId="brand-1"
        error={null}
        onClose={vi.fn()}
        onRescheduleRelease={vi.fn()}
        onRescheduleTarget={vi.fn()}
        onRetryTarget={vi.fn()}
        pendingAction={null}
        reconnectHref="/acme-org/~/settings/profile"
        release={release()}
        seriesControls={<p>Series slot</p>}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Edit caption and media' }),
    ).toHaveAttribute('href', expect.stringContaining('/publishing/posts/'));
    expect(screen.getByText('Series slot')).toBeInTheDocument();
  });

  it('keeps History behind the more-actions menu', async () => {
    const user = userEvent.setup();
    renderDrawer(
      {
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
      },
      null,
      'preview',
    );

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'History' }));

    const history = screen.getByTestId('release-history-view');
    expect(history).toHaveTextContent('Instagram');
    expect(history).toHaveTextContent('Provider timed out.');
    expect(history).toHaveTextContent('Retry 1');
  });

  it('offers Open editor from the more-actions menu', async () => {
    const user = userEvent.setup();
    renderDrawer({}, null, 'preview');

    await user.click(screen.getByRole('button', { name: 'More actions' }));

    expect(
      await screen.findByRole('menuitem', { name: 'Open editor' }),
    ).toHaveAttribute('href', '/acme/main/publishing/posts/target-1');
  });

  it('says a published post published and never shows a schedule', () => {
    renderDrawer(
      {
        publishedAt: '2026-07-01T08:00:00.000Z',
        status: ReleaseStatus.PUBLISHED,
        targets: [target({ executionState: TargetExecutionState.PUBLISHED })],
      },
      null,
      'preview',
    );

    expect(screen.getByTestId('release-summary')).toHaveTextContent(
      '1 channel · Published',
    );
    expect(screen.getByTestId('release-summary')).not.toHaveTextContent(
      'Scheduled',
    );

    openView('Settings');

    expect(screen.queryByText('Schedule')).not.toBeInTheDocument();
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Publish time')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reschedule post' }),
    ).not.toBeInTheDocument();
  });

  it('does not flag a published post as blocked for missing media', () => {
    renderDrawer({
      status: ReleaseStatus.PUBLISHED,
      targets: [
        target({
          executionState: TargetExecutionState.PUBLISHED,
          readiness: {
            canSchedule: false,
            diagnostics: [],
          } as unknown as IChannelTarget['readiness'],
        }),
      ],
    });

    expect(
      screen.queryByText('Publishing setup is blocking this channel'),
    ).not.toBeInTheDocument();
  });

  it('exposes stable action identifiers for the page to key pending state on', () => {
    expect(RELEASE_RESCHEDULE_ACTION).toBe('release:reschedule');
    expect(RELEASE_RESUME_ACTION).toBe('release:resume');
    expect(targetRescheduleAction('t-1')).toBe('target:reschedule:t-1');
    expect(targetRetryAction('t-1')).toBe('target:retry:t-1');
  });

  it('shows a View action when the target carries a permalink', async () => {
    renderDrawer({ targets: [target({ url: 'https://instagram.com/p/abc' })] });

    const link = await screen.findByRole('link', {
      name: 'View on Instagram',
    });
    expect(link).toHaveAttribute('href', 'https://instagram.com/p/abc');
  });

  it('omits the View action when the target has no permalink', () => {
    renderDrawer();

    expect(
      screen.queryByRole('link', { name: 'View on Instagram' }),
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
    expect(reconnect).toHaveAttribute('href', '/acme-org/~/settings/profile');
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
    renderInSidebar(
      <ReleaseDetailDrawer
        error={null}
        onClose={vi.fn()}
        onRescheduleRelease={vi.fn()}
        onRescheduleTarget={vi.fn()}
        onRetryTarget={vi.fn()}
        pendingAction={null}
        reconnectHref="/acme-org/~/settings/profile"
        release={release()}
      />,
    );

    expect(listBrandAccountHealth).not.toHaveBeenCalled();
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
          reconnectHref="/acme-org/~/settings/profile"
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
            <SidebarFrame>{view(next, error, pending)}</SidebarFrame>,
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

    it('hands a sidebar close back to the page', async () => {
      const { onClose } = renderWith();
      await screen.findByTestId('release-detail-panel');

      fireEvent.click(screen.getByRole('button', { name: 'Close sidebar' }));

      expect(onClose).toHaveBeenCalledOnce();
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

    it('submits from the keyboard with the same absolute instant', () => {
      const { onRescheduleRelease } = renderWith();

      fireEvent.change(screen.getByLabelText('Publish time'), {
        target: { value: '2026-08-03T14:30' },
      });
      fireEvent.submit(screen.getByLabelText('Publish time'));

      expect(onRescheduleRelease).toHaveBeenCalledWith(
        '2026-08-03T14:30:00.000Z',
      );
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

    it('does not overwrite an edit in progress when the same instants come back', () => {
      const { rerender } = renderWith();

      fireEvent.change(screen.getByLabelText('Publish time'), {
        target: { value: '2026-08-03T14:30' },
      });
      rerender(release());

      expect(screen.getByLabelText('Publish time')).toHaveValue(
        '2026-08-03T14:30',
      );
    });

    it('locks the field for a post that can no longer move', () => {
      renderWith({ release: release({ status: ReleaseStatus.CANCELLED }) });

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
          reconnectHref="/acme-org/~/settings/profile"
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
      ).toHaveAttribute('href', '/acme-org/~/settings/profile');
    });
  });
});
