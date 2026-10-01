// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import OnboardingProvider from '@contexts/onboarding/onboarding-context';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IBrandKitDraft,
  IBrandOnboardingScan,
  IBrandOsExportState,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import type { Brand } from '@genfeedai/models/organization/brand.model';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BrandContent from './brand-content';

const mocks = vi.hoisted(() => ({
  user: {
    id: 'user-1',
    email: 'owner@acme.com',
    onboardingStepsCompleted: [] as string[],
  },
  userLoading: false,
  desktop: false,
  scope: {
    brandId: 'brand-1',
    organizationId: 'org-1',
    selectedBrand: undefined as Brand | undefined,
    brands: [] as Brand[],
    isBrandScopeResolved: true,
    refreshBrands: vi.fn(),
  },
  getService: vi.fn(),
  getToken: vi.fn(),
  refetchUser: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  getBrandOsScan: vi.fn(),
  startBrandOsScan: vi.fn(),
  listBrandOsRevisions: vi.fn(),
  getBrandOsExport: vi.fn(),
  updateBrandOsRevision: vi.fn(),
  approveBrandOsRevision: vi.fn(),
  publishBrandOsDesign: vi.fn(),
  revokeBrandOsDesign: vi.fn(),
  patchSettings: vi.fn(),
  patchMe: vi.fn(),
  updateOnboarding: vi.fn(),
  clearCache: vi.fn(),
  rename: vi.fn(),
  scrape: vi.fn(),
  starter: vi.fn(),
  updateAccountType: vi.fn(),
  search: new URLSearchParams(),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.scope,
}));
vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: mocks.user,
    isLoading: mocks.userLoading,
    refetchUser: mocks.refetchUser,
  }),
}));
vi.mock('@genfeedai/config/deployment', () => ({
  isDesktopClient: () => mocks.desktop,
  hasAgentFirstOnboarding: () => true,
}));
vi.mock(
  '@genfeedai/hooks/feature-flags/use-feature-flag/use-feature-flag',
  () => ({ useFeatureFlag: () => true }),
);
vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ getToken: mocks.getToken }),
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: async (getToken: () => Promise<string | null>) =>
    getToken(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => 'owner',
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: {
    getInstance: () => ({
      renameWithOrganizationSync: mocks.rename,
      scrape: mocks.scrape,
    }),
  },
}));
vi.mock('@services/onboarding/onboarding.service', () => ({
  OnboardingService: {
    getInstance: () => ({ queueStarterAssets: mocks.starter }),
  },
}));
vi.mock('@services/organization/organizations.service', () => ({
  OrganizationsService: {
    getInstance: () => ({
      patchSettings: mocks.patchSettings,
      updateAccountType: mocks.updateAccountType,
    }),
  },
}));
vi.mock('@services/organization/users.service', () => ({
  UsersService: { getInstance: () => ({ patchMe: mocks.patchMe }) },
}));
vi.mock('@genfeedai/services/onboarding/user-onboarding.service', () => ({
  UserOnboardingService: {
    getInstance: () => ({ updateOnboarding: mocks.updateOnboarding }),
  },
}));
vi.mock(
  '@genfeedai/contexts/providers/protected-bootstrap/client-protected-bootstrap',
  () => ({ clearClientProtectedBootstrapCache: mocks.clearCache }),
);
vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/onboarding/brand',
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => mocks.search,
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  const cache = new Map<string, ReturnType<typeof translateFromCatalog>>();
  return {
    useTranslations: (namespace: string) => {
      const translate = cache.get(namespace) ?? translateFromCatalog(namespace);
      cache.set(namespace, translate);
      return translate;
    },
  };
});
interface RevisionSaveFixture {
  content: IBrandKitDraft;
}
interface CardFixtureProps {
  children?: ReactNode;
  label?: string;
}
interface SelectFixtureProps {
  children?: ReactNode;
  value?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}
interface SelectItemFixtureProps {
  children?: ReactNode;
  value: string;
}
vi.mock('@ui/card/Card', () => ({
  default: ({ children, label }: CardFixtureProps) => (
    <section>
      <h2>{label}</h2>
      {children}
    </section>
  ),
}));
vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    value,
    disabled,
    onValueChange,
  }: SelectFixtureProps) => (
    <select
      aria-label="Revision history"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: CardFixtureProps) => <>{children}</>,
  SelectItem: ({ children, value }: SelectItemFixtureProps) => (
    <option value={value}>{children}</option>
  ),
}));
interface BehaviorDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
function deferred<T>(): BehaviorDeferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function brand(
  id = 'brand-1',
  organizationId = 'org-1',
  isDeleted = false,
): Brand {
  return {
    id,
    organizationId,
    isDeleted,
    organization: {
      id: organizationId,
      slug: organizationId,
      accountType: 'EXPERT',
    },
  } as unknown as Brand;
}
function selectBrand(id = 'brand-1', organizationId = 'org-1') {
  const selected = brand(id, organizationId);
  mocks.scope = {
    ...mocks.scope,
    brandId: id,
    organizationId,
    selectedBrand: selected,
    brands: [selected],
    isBrandScopeResolved: true,
  };
}
function draft(): IBrandKitDraft {
  return {
    id: 'draft',
    brandId: 'brand-1',
    organizationId: 'org-1',
    status: 'ready',
    sourceType: 'manual',
    fields: {
      description: {
        key: 'description',
        label: 'Description',
        group: 'profile',
        ownerPath: 'brand.description',
        applyActionDefault: 'accept',
        proposedValue: 'Saved description',
        evidence: [],
        diagnostics: [],
      },
    },
    assetCandidates: [],
    evidence: [],
    diagnostics: [],
    readiness: {
      status: 'complete',
      score: 1,
      requiredFields: [],
      missingFields: [],
      diagnostics: [],
    },
  };
}
function revision(overrides: Partial<IBrandOsRevision> = {}): IBrandOsRevision {
  return {
    id: 'revision-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    exportSchemaVersion: '1',
    version: 1,
    status: 'DRAFT',
    content: draft(),
    updatedAt: '2026-10-01T00:00:00Z',
    createdAt: '2026-10-01T00:00:00Z',
    approvedAt: null,
    approvedById: null,
    ...overrides,
  };
}
function marker(
  overrides: Partial<IBrandOnboardingScan> = {},
): IBrandOnboardingScan {
  return {
    id: 'scan-1',
    brandId: 'brand-1',
    status: 'ready',
    url: 'https://retained.example',
    startedAt: '2026-10-01T00:00:00Z',
    revisionId: 'revision-1',
    ...overrides,
  };
}
function tree() {
  return (
    <OnboardingProvider>
      <BrandContent />
    </OnboardingProvider>
  );
}
async function show() {
  const view = render(tree());
  await screen.findByLabelText('Description');
  return view;
}
function assertNoAutomaticWrites() {
  for (const fn of [
    mocks.startBrandOsScan,
    mocks.rename,
    mocks.scrape,
    mocks.starter,
    mocks.updateAccountType,
    mocks.updateOnboarding,
    mocks.patchSettings,
    mocks.patchMe,
    mocks.updateBrandOsRevision,
    mocks.approveBrandOsRevision,
    mocks.publishBrandOsDesign,
    mocks.revokeBrandOsDesign,
  ])
    expect(fn).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.search = new URLSearchParams();
  mocks.user = {
    id: 'user-1',
    email: 'owner@acme.com',
    onboardingStepsCompleted: [],
  };
  mocks.userLoading = false;
  mocks.desktop = false;
  selectBrand();
  mocks.scope.refreshBrands.mockResolvedValue(undefined);
  mocks.getService.mockResolvedValue(mocks);
  mocks.getToken.mockResolvedValue('token');
  mocks.refetchUser.mockResolvedValue(undefined);
  mocks.getBrandOsScan.mockResolvedValue(null);
  mocks.listBrandOsRevisions.mockResolvedValue([revision()]);
  const unavailable: IBrandOsExportState = {
    id: 'brand-1',
    brandId: 'brand-1',
    state: 'unavailable',
    revisionId: null,
    schemaVersion: '1',
    digest: null,
    generatedAt: null,
    publishedRevisionId: null,
    publicUrl: null,
    revisionUrl: null,
    publishedAt: null,
    canPublish: false,
  };
  mocks.getBrandOsExport.mockResolvedValue(unavailable);
  mocks.patchSettings.mockResolvedValue(undefined);
  mocks.patchMe.mockResolvedValue(undefined);
  mocks.updateOnboarding.mockResolvedValue(undefined);
  mocks.updateBrandOsRevision.mockImplementation(
    async (_brandId: string, _revisionId: string, body: RevisionSaveFixture) =>
      revision({ content: body.content, updatedAt: '2026-10-01T00:01:00Z' }),
  );
  mocks.approveBrandOsRevision.mockResolvedValue(
    revision({ status: 'APPROVED' }),
  );
  mocks.startBrandOsScan.mockResolvedValue(marker());
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('membership-scoped saved guide wizard', () => {
  it.each([
    ['owner@acme.com', 'https://acme.com'],
    ['owner@gmail.com', ''],
  ] as const)(
    'suggests website for %s with no automatic writes',
    async (email, url) => {
      mocks.user.email = email;
      await show();
      expect(screen.getByLabelText('Website URL')).toHaveValue(url);
      assertNoAutomaticWrites();
      expect(
        screen.getByText("Connect publishing accounts when you're ready."),
      ).toBeInTheDocument();
      expect(screen.queryByText('Your first content')).not.toBeInTheDocument();
    },
  );
  it('uses query/stored domain only as a suggestion and never changes selected account type', async () => {
    mocks.user.email = 'owner@gmail.com';
    mocks.search.set('brandDomain', 'suggested.example');
    mocks.search.set('accountType', 'CREATOR');
    localStorage.setItem('gf_onboarding_account_type', 'CREATOR');
    await show();
    expect(screen.getByLabelText('Website URL')).toHaveValue(
      'https://suggested.example',
    );
    assertNoAutomaticWrites();
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue', exact: true }),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
        '/onboarding/positioning',
      ),
    );
    expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
    expect(mocks.starter).not.toHaveBeenCalled();
  });
  it('reopens persisted history and URL without a scan POST', async () => {
    mocks.getBrandOsScan.mockResolvedValue(marker());
    const first = await show();
    await waitFor(() =>
      expect(screen.getByLabelText('Website URL')).toHaveValue(
        'https://retained.example',
      ),
    );
    first.unmount();
    await show();
    expect(mocks.listBrandOsRevisions).toHaveBeenCalledWith(
      'brand-1',
      expect.any(AbortSignal),
    );
    assertNoAutomaticWrites();
  });
  it('explicitly scans trimmed input while retaining dirty saved-guide corrections', async () => {
    const pending = deferred<IBrandOnboardingScan>();
    mocks.startBrandOsScan.mockReturnValue(pending.promise);
    await show();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Unsaved correction' },
    });
    fireEvent.change(screen.getByLabelText('Website URL'), {
      target: { value: '  example.com:443/path  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan website again' }));
    await waitFor(() =>
      expect(mocks.startBrandOsScan).toHaveBeenCalledWith(
        'brand-1',
        { url: 'example.com:443/path', requestId: expect.any(String) },
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByLabelText('Website URL')).toBeDisabled();
    mocks.listBrandOsRevisions.mockResolvedValue([
      revision({ id: 'revision-2', version: 2 }),
      revision(),
    ]);
    await act(async () => {
      pending.resolve(marker({ revisionId: 'revision-2' }));
    });
    await screen.findByText(
      'New revisions are available. Save or discard your edits before refreshing history.',
    );
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Unsaved correction',
    );
    expect(mocks.updateBrandOsRevision).not.toHaveBeenCalled();
  });
  it('allows manual review without a URL, then real-card save and separate approval notices', async () => {
    mocks.user.email = 'owner@gmail.com';
    await show();
    fireEvent.click(
      screen.getByRole('button', { name: 'Add details manually' }),
    );
    expect(
      screen.getByRole('heading', {
        name: 'Review and approve your brand guide',
      }),
    ).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Owner correction' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Your brand guide has been saved.');
    expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
    await screen.findByText('Your brand guide is approved.');
    expect(mocks.approveBrandOsRevision).toHaveBeenCalledExactlyOnceWith(
      'brand-1',
      'revision-1',
      '2026-10-01T00:01:00Z',
    );
    expect(mocks.scope.refreshBrands).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.starter).not.toHaveBeenCalled();
  });
  it('keeps saved manual review available after scan GET failure without exposing remote errors', async () => {
    mocks.getBrandOsScan.mockRejectedValueOnce(
      new Error('PRIVATE_PROVIDER_ERROR'),
    );
    await show();
    expect(screen.getByLabelText('Description')).toBeEnabled();
    expect(
      screen.queryByText('PRIVATE_PROVIDER_ERROR'),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review saved details' }),
    );
    expect(
      screen.getByRole('heading', {
        name: 'Review and approve your brand guide',
      }),
    ).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Scan website again' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try scanning again' }));
    await waitFor(() => expect(mocks.getBrandOsScan).toHaveBeenCalledTimes(2));
    expect(mocks.startBrandOsScan).not.toHaveBeenCalled();
  });
  it.each([
    'unresolved',
    'empty',
    'mismatched organization',
    'missing membership',
    'deleted',
  ] as const)('issues no brand requests for %s scope', async (state) => {
    if (state === 'unresolved') mocks.scope.isBrandScopeResolved = false;
    if (state === 'empty') {
      mocks.scope.brandId = '';
      mocks.scope.organizationId = '';
    }
    if (state === 'mismatched organization')
      mocks.scope.organizationId = 'other-org';
    if (state === 'missing membership')
      mocks.scope.brands = [brand('other-brand', 'other-org')];
    if (state === 'deleted') {
      mocks.scope.selectedBrand = brand('brand-1', 'org-1', true);
      mocks.scope.brands = [mocks.scope.selectedBrand];
    }
    render(tree());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.getBrandOsScan).not.toHaveBeenCalled();
    expect(mocks.listBrandOsRevisions).not.toHaveBeenCalled();
    expect(mocks.startBrandOsScan).not.toHaveBeenCalled();
    if (state !== 'unresolved')
      expect(
        screen.getByRole('button', { name: 'Continue', exact: true }),
      ).toBeDisabled();
  });
  it.each([
    'empty',
    'mismatched organization',
    'missing membership',
    'deleted',
  ] as const)(
    'authenticated web Skip completes without organization writes for %s scope',
    async (state) => {
      if (state === 'empty') {
        mocks.scope.brandId = '';
        mocks.scope.organizationId = '';
      }
      if (state === 'mismatched organization')
        mocks.scope.organizationId = 'other-org';
      if (state === 'missing membership')
        mocks.scope.brands = [brand('other-brand', 'other-org')];
      if (state === 'deleted') {
        mocks.scope.selectedBrand = brand('brand-1', 'org-1', true);
        mocks.scope.brands = [mocks.scope.selectedBrand];
      }
      render(tree());
      fireEvent.click(
        await screen.findByRole('button', { name: 'Skip for now' }),
      );
      await waitFor(() =>
        expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/'),
      );
      expect(mocks.patchMe).toHaveBeenCalledExactlyOnceWith({
        isOnboardingCompleted: true,
      });
      expect(mocks.patchSettings).not.toHaveBeenCalled();
      expect(mocks.updateOnboarding).not.toHaveBeenCalled();
      expect(mocks.getBrandOsScan).not.toHaveBeenCalled();
      expect(mocks.listBrandOsRevisions).not.toHaveBeenCalled();
      expect(mocks.startBrandOsScan).not.toHaveBeenCalled();
    },
  );
  it.each(['token', 'current user id'] as const)(
    'web Skip fails without writes when missing %s',
    async (missing) => {
      if (missing === 'token') mocks.getToken.mockResolvedValue(null);
      if (missing === 'current user id') mocks.user.id = '';
      render(tree());
      fireEvent.click(
        await screen.findByRole('button', { name: 'Skip for now' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "We couldn't skip onboarding",
      );
      expect(mocks.patchSettings).not.toHaveBeenCalled();
      expect(mocks.patchMe).not.toHaveBeenCalled();
      expect(mocks.updateOnboarding).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
    },
  );
  it('uses the selected authorized brand and matching org instead of either first record', async () => {
    selectBrand('brand-2', 'org-2');
    mocks.scope.brands.unshift(brand('brand-1', 'org-1'));
    await show();
    expect(mocks.getBrandOsScan).toHaveBeenCalledWith(
      'brand-2',
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/'),
    );
    expect(mocks.patchSettings).toHaveBeenCalledExactlyOnceWith('org-2', {
      isFirstLogin: false,
    });
    expect(mocks.patchMe).toHaveBeenCalledExactlyOnceWith({
      isOnboardingCompleted: true,
    });
  });
  it.each(['Continue', 'Skip for now'] as const)(
    'dirty cancel stops real %s gate dispatch before the handler',
    async (name) => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      await show();
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Unsaved' },
      });
      fireEvent.click(screen.getByRole('button', { name, exact: true }));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(mocks.getToken).not.toHaveBeenCalled();
      expect(mocks.updateOnboarding).not.toHaveBeenCalled();
      expect(mocks.patchSettings).not.toHaveBeenCalled();
      expect(mocks.patchMe).not.toHaveBeenCalled();
    },
  );
  it('accepted dirty Continue completes once without an implicit save or approval', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await show();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Unsaved' },
    });
    const button = screen.getByRole('button', {
      name: 'Continue',
      exact: true,
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() =>
      expect(mocks.updateOnboarding).toHaveBeenCalledTimes(1),
    );
    expect(mocks.updateBrandOsRevision).not.toHaveBeenCalled();
    expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
  });
  it.each(['auth', 'update', 'refetch'] as const)(
    'switch away and back fences Continue at actual shared %s boundary',
    async (stage) => {
      const gate = deferred<void>();
      const view = await show();
      if (stage === 'auth')
        mocks.getToken.mockReturnValueOnce(gate.promise.then(() => 'token'));
      if (stage === 'update')
        mocks.updateOnboarding.mockReturnValueOnce(gate.promise);
      if (stage === 'refetch')
        mocks.refetchUser.mockReturnValueOnce(gate.promise);
      fireEvent.click(
        screen.getByRole('button', { name: 'Continue', exact: true }),
      );
      await waitFor(() =>
        expect(
          stage === 'auth'
            ? mocks.getToken
            : stage === 'update'
              ? mocks.updateOnboarding
              : mocks.refetchUser,
        ).toHaveBeenCalledTimes(1),
      );
      selectBrand('brand-2', 'org-2');
      view.rerender(tree());
      selectBrand();
      view.rerender(tree());
      await act(async () => {
        gate.resolve();
      });
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.updateOnboarding).toHaveBeenCalledTimes(
        stage === 'auth' ? 0 : 1,
      );
      expect(mocks.clearCache).toHaveBeenCalledTimes(stage === 'auth' ? 0 : 1);
      expect(mocks.refetchUser).toHaveBeenCalledTimes(stage === 'auth' ? 0 : 1);
    },
  );
  it('unmount suppresses navigation after an already-started user-wide progress update', async () => {
    const gate = deferred<void>();
    const view = await show();
    mocks.updateOnboarding.mockReturnValueOnce(gate.promise);
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue', exact: true }),
    );
    await waitFor(() =>
      expect(mocks.updateOnboarding).toHaveBeenCalledTimes(1),
    );
    view.unmount();
    await act(async () => {
      gate.resolve();
    });
    expect(mocks.clearCache).toHaveBeenCalledTimes(1);
    expect(mocks.refetchUser).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it.each(['auth', 'organization', 'user'] as const)(
    'scope switch prevents later Skip work after %s',
    async (stage) => {
      const gate = deferred<void>();
      const view = await show();
      if (stage === 'auth')
        mocks.getToken.mockReturnValueOnce(gate.promise.then(() => 'token'));
      if (stage === 'organization')
        mocks.patchSettings.mockReturnValueOnce(gate.promise);
      if (stage === 'user') mocks.patchMe.mockReturnValueOnce(gate.promise);
      fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
      await waitFor(() =>
        expect(
          stage === 'auth'
            ? mocks.getToken
            : stage === 'organization'
              ? mocks.patchSettings
              : mocks.patchMe,
        ).toHaveBeenCalledTimes(1),
      );
      selectBrand('brand-2', 'org-2');
      view.rerender(tree());
      await act(async () => {
        gate.resolve();
      });
      expect(mocks.patchSettings).toHaveBeenCalledTimes(
        stage === 'auth' ? 0 : 1,
      );
      expect(mocks.patchMe).toHaveBeenCalledTimes(stage === 'user' ? 1 : 0);
      expect(mocks.push).not.toHaveBeenCalled();
    },
  );
  it('keeps errors localized and current scope visible on explicit exit failure', async () => {
    await show();
    mocks.patchSettings.mockRejectedValueOnce(new Error('PRIVATE_API_ERROR'));
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't skip onboarding",
    );
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(mocks.patchMe).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it('preserves Desktop missing-token local escape without Cloud gate writes', async () => {
    mocks.desktop = true;
    mocks.getToken.mockResolvedValue(null);
    mocks.scope.brands = [];
    render(tree());
    fireEvent.click(
      await screen.findByRole('button', { name: 'Skip for now' }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
      APP_ROUTES.DESKTOP.LOCAL,
    );
    expect(mocks.patchSettings).not.toHaveBeenCalled();
    expect(mocks.patchMe).not.toHaveBeenCalled();
  });
});
