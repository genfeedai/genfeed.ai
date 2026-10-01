// @vitest-environment jsdom
'use client';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  clearCache: vi.fn(),
  brands: [] as import('@genfeedai/models/organization/brand.model').Brand[],
  selectedBrand: undefined as
    | import('@genfeedai/models/organization/brand.model').Brand
    | undefined,
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: boundary.brands,
    selectedBrand: boundary.selectedBrand,
  }),
}));
vi.mock(
  '@genfeedai/contexts/providers/protected-bootstrap/client-protected-bootstrap',
  () => ({ clearClientProtectedBootstrapCache: boundary.clearCache }),
);
const getTokenMock = vi.fn();
const getBetterAuthTokenMock = vi.fn();
const pushMock = vi.fn();
const replaceMock = vi.fn();
const refetchUserMock = vi.fn();
const getInstanceMock = vi.fn();
const updateOnboardingMock = vi.fn();

vi.mock('@genfeedai/auth-client', () => ({
  getBetterAuthToken: (...args: unknown[]) => getBetterAuthTokenMock(...args),
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({
    getToken: getTokenMock,
    isLoaded: true,
    isSignedIn: true,
    orgId: null,
    sessionId: null,
    userId: 'usr_123',
  }),
}));

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: {
      id: 'usr_123',
      onboardingStepsCompleted: [],
    },
    isLoading: false,
    refetchUser: refetchUserMock,
  }),
}));

const hasAgentFirstOnboardingMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('@genfeedai/config/deployment', () => ({
  hasAgentFirstOnboarding: () => hasAgentFirstOnboardingMock(),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/onboarding/user-onboarding.service', () => ({
  UserOnboardingService: {
    getInstance: (...args: unknown[]) => getInstanceMock(...args),
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/onboarding/brand',
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}));

import OnboardingProvider, {
  useOnboarding,
} from '@genfeedai/contexts/onboarding/onboarding-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';

function StepCompleteControl() {
  const { handleStepComplete } = useOnboarding();

  return (
    <Button
      label="Complete step"
      onClick={() => handleStepComplete('brand')}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    />
  );
}

describe('OnboardingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.brands = [];
    boundary.selectedBrand = undefined;
    hasAgentFirstOnboardingMock.mockReturnValue(true);
    getBetterAuthTokenMock.mockResolvedValue(null);
    getTokenMock.mockResolvedValue('session-token');
    refetchUserMock.mockResolvedValue(undefined);
    updateOnboardingMock.mockResolvedValue(undefined);
    getInstanceMock.mockReturnValue({
      updateOnboarding: updateOnboardingMock,
    });
  });

  it('refreshes user state after onboarding updates on the standard session token path', async () => {
    render(
      <OnboardingProvider>
        <StepCompleteControl />
      </OnboardingProvider>,
    );

    const button = await screen.findByRole('button', {
      name: 'Complete step',
    });

    fireEvent.click(button);

    await waitFor(() => {
      expect(getTokenMock).toHaveBeenCalledWith(undefined);
      expect(getInstanceMock).toHaveBeenCalledWith('session-token');
      expect(updateOnboardingMock).toHaveBeenCalledWith('usr_123', {
        onboardingStepsCompleted: ['brand'],
      });
      expect(refetchUserMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith('/agent/onboarding');
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it('keeps Desktop on the shared providers step after brand', async () => {
    hasAgentFirstOnboardingMock.mockReturnValue(false);

    render(
      <OnboardingProvider>
        <StepCompleteControl />
      </OnboardingProvider>,
    );

    const button = await screen.findByRole('button', {
      name: 'Complete step',
    });

    fireEvent.click(button);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/onboarding/providers');
    });
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

interface CompletionProbeProps {
  shouldContinue?: () => boolean;
  onComplete: () => void;
}
interface ProgressDeferred {
  promise: Promise<void>;
  resolve: () => void;
}
function progressDeferred(): ProgressDeferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function CompletionProbe({ shouldContinue, onComplete }: CompletionProbeProps) {
  const { handleStepComplete, saving } = useOnboarding();
  return (
    <>
      <Button
        label="Guarded completion"
        onClick={async () => {
          await handleStepComplete('brand', undefined, shouldContinue);
          onComplete();
        }}
      />
      <p>{saving ? 'saving' : 'idle'}</p>
    </>
  );
}
function scopedBrand(
  slug?: string,
): import('@genfeedai/models/organization/brand.model').Brand {
  return {
    id: 'brand',
    organization: { slug, accountType: 'CREATOR' },
  } as unknown as import('@genfeedai/models/organization/brand.model').Brand;
}

describe('guarded onboarding completion boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.brands = [];
    boundary.selectedBrand = undefined;
    hasAgentFirstOnboardingMock.mockReturnValue(true);
    getBetterAuthTokenMock.mockResolvedValue(null);
    getTokenMock.mockResolvedValue('session-token');
    refetchUserMock.mockResolvedValue(undefined);
    updateOnboardingMock.mockResolvedValue(undefined);
    getInstanceMock.mockReturnValue({ updateOnboarding: updateOnboardingMock });
  });
  it('false before completion dispatches no auth, update, cache or navigation', async () => {
    const completed = vi.fn();
    render(
      <OnboardingProvider>
        <CompletionProbe shouldContinue={() => false} onComplete={completed} />
      </OnboardingProvider>,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Guarded completion' }),
    );
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(updateOnboardingMock).not.toHaveBeenCalled();
    expect(boundary.clearCache).not.toHaveBeenCalled();
    expect(refetchUserMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });
  it.each(['auth', 'update', 'refetch'] as const)(
    'suppresses subsequent stale work after %s while preserving committed invalidation',
    async (stage) => {
      let current = true;
      const completed = vi.fn();
      const gate = progressDeferred();
      if (stage === 'auth')
        getTokenMock.mockReturnValueOnce(
          gate.promise.then(() => 'session-token'),
        );
      if (stage === 'update')
        updateOnboardingMock.mockReturnValueOnce(gate.promise);
      if (stage === 'refetch')
        refetchUserMock.mockReturnValueOnce(gate.promise);
      render(
        <OnboardingProvider>
          <CompletionProbe
            shouldContinue={() => current}
            onComplete={completed}
          />
        </OnboardingProvider>,
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Guarded completion' }),
      );
      await waitFor(() =>
        expect(
          stage === 'auth'
            ? getTokenMock
            : stage === 'update'
              ? updateOnboardingMock
              : refetchUserMock,
        ).toHaveBeenCalledTimes(1),
      );
      current = false;
      await act(async () => {
        gate.resolve();
      });
      await waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
      expect(updateOnboardingMock).toHaveBeenCalledTimes(
        stage === 'auth' ? 0 : 1,
      );
      expect(boundary.clearCache).toHaveBeenCalledTimes(
        stage === 'auth' ? 0 : 1,
      );
      expect(refetchUserMock).toHaveBeenCalledTimes(
        stage === 'refetch' ? 1 : 0,
      );
      expect(pushMock).not.toHaveBeenCalled();
      expect(replaceMock).not.toHaveBeenCalled();
      expect(screen.getByText('idle')).toBeTruthy();
    },
  );
  it.each(['true', 'omitted'] as const)(
    'preserves compatible %s predicate dispatch and navigation',
    async (mode) => {
      const completed = vi.fn();
      render(
        <OnboardingProvider>
          <CompletionProbe
            shouldContinue={mode === 'true' ? () => true : undefined}
            onComplete={completed}
          />
        </OnboardingProvider>,
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Guarded completion' }),
      );
      await waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
      expect(updateOnboardingMock).toHaveBeenCalledExactlyOnceWith('usr_123', {
        onboardingStepsCompleted: ['brand'],
      });
      expect(boundary.clearCache).toHaveBeenCalledTimes(1);
      expect(refetchUserMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledExactlyOnceWith('/agent/onboarding');
    },
  );
  it.each([
    'missing selected slug',
    'present selected slug',
    'absent selected brand',
  ] as const)(
    'uses the selected organization slug policy for %s',
    async (scenario) => {
      boundary.brands = [scopedBrand('first-org')];
      boundary.selectedBrand =
        scenario === 'absent selected brand'
          ? undefined
          : scopedBrand(
              scenario === 'present selected slug' ? 'selected-org' : undefined,
            );
      render(
        <OnboardingProvider>
          <StepCompleteControl />
        </OnboardingProvider>,
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Complete step' }),
      );
      const href =
        scenario === 'missing selected slug'
          ? '/agent/onboarding'
          : `/${scenario === 'present selected slug' ? 'selected-org' : 'first-org'}/~/agent/onboarding`;
      await waitFor(() =>
        expect(pushMock).toHaveBeenCalledExactlyOnceWith(href),
      );
    },
  );
});
