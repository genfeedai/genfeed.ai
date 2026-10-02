import '@testing-library/jest-dom/vitest';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { AuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import BrandOsIdentityPreview from '@pages/brands/components/brand-kit/BrandOsIdentityPreview';
import {
  axiosResponse,
  installMockHttp,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { BrandedGenerationReceiptsService } from '@services/ai/branded-generation-receipts.service';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getToken = vi.fn<() => Promise<string | null>>();
  const auth: AuthIdentity = {
    getToken,
    userId: 'user',
    sessionId: 'session',
    orgId: 'org',
    isLoaded: true,
    isSignedIn: true,
  };
  return { getToken, auth, role: 'owner' };
});
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.auth,
}));
vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.role,
}));
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));
const hash = `sha256:${'a'.repeat(64)}`;
function snapshot(): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId: 'approved-A',
    revisionVersion: 4,
    approval: 'approved',
    resolvedAt: '2026-10-02T00:00:00.000Z',
    contentHash: hash,
    identity: { name: 'Saved approved A' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [],
      facts: [],
      palette: [],
      typography: [],
      mandatory: [],
      avoid: [],
      examples: [],
      assets: [],
    },
    diagnostics: [],
  };
}
function response() {
  return axiosResponse(
    resourceDocument(
      { snapshot: snapshot(), source: 'current_approved_revision' },
      { id: hash, type: 'brand-identity-preview' },
    ),
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const props = {
  organizationId: 'org',
  brandId: 'brand',
  refreshKey: 'selected-clean-draft-B',
  isDisabled: false,
};
function setup() {
  const service = new BrandedGenerationReceiptsService('token');
  const http = installMockHttp(service);
  vi.spyOn(BrandedGenerationReceiptsService, 'getInstance').mockReturnValue(
    service,
  );
  http.get.mockResolvedValue(response());
  return { service, http };
}
function click(key: string) {
  fireEvent.click(
    screen.getByRole('button', {
      name: `pages.brandOsSettings.identityPreview.${key}`,
    }),
  );
}
describe('unmounted current saved identity panel with real hook and SDK', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getToken.mockReset().mockResolvedValue('token');
    Object.assign(mocks.auth, {
      getToken: mocks.getToken,
      userId: 'user',
      sessionId: 'session',
      orgId: 'org',
      isLoaded: true,
      isSignedIn: true,
    });
    mocks.role = 'owner';
  });
  it('requires explicit open and shows the actual server-approved A independently of selected clean draft B', async () => {
    const { service, http } = setup();
    const prompt = vi.spyOn(service, 'readPrompt');
    render(<BrandOsIdentityPreview {...props} />);
    expect(http.get).not.toHaveBeenCalled();
    expect(mocks.getToken).not.toHaveBeenCalled();
    click('open');
    await screen.findByText('Saved approved A');
    expect(screen.getByText('approved-A')).toBeInTheDocument();
    expect(
      screen.queryByText('selected-clean-draft-B'),
    ).not.toBeInTheDocument();
    expect(http.get).toHaveBeenCalledExactlyOnceWith(
      'brand/generation-receipts/identity-preview',
      { signal: expect.any(AbortSignal) },
    );
    expect(prompt).not.toHaveBeenCalled();
    for (const method of ['post', 'put', 'patch', 'delete'] as const)
      expect(http[method]).not.toHaveBeenCalled();
  });
  it('disables inspection during unsaved or pending work and explains the saved-version boundary', () => {
    const { http } = setup();
    render(<BrandOsIdentityPreview {...props} isDisabled />);
    expect(
      screen.getByRole('button', {
        name: 'pages.brandOsSettings.identityPreview.open',
      }),
    ).toBeDisabled();
    expect(
      screen.getByText('pages.brandOsSettings.identityPreview.savedVersion'),
    ).toBeInTheDocument();
    expect(http.get).not.toHaveBeenCalled();
  });
  it('shows loading during a deferred read and close aborts it without reviving evidence', async () => {
    const { http } = setup();
    const pending = deferred<ReturnType<typeof response>>();
    http.get.mockReturnValueOnce(pending.promise);
    render(<BrandOsIdentityPreview {...props} />);
    click('open');
    await waitFor(() => expect(http.get).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent(
      'pages.brandOsSettings.identityPreview.loading',
    );
    click('close');
    expect(http.get.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(response());
      await pending.promise;
    });
    expect(screen.queryByText('Saved approved A')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it.each(['organizationId', 'brandId', 'refreshKey'] as const)(
    'closes/reset on accepted context %s changes without automatically fetching',
    async (key) => {
      const { http } = setup();
      const { rerender } = render(<BrandOsIdentityPreview {...props} />);
      click('open');
      await screen.findByText('Saved approved A');
      rerender(<BrandOsIdentityPreview {...props} {...{ [key]: 'changed' }} />);
      expect(screen.queryByText('Saved approved A')).not.toBeInTheDocument();
      expect(http.get).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole('button', {
          name: 'pages.brandOsSettings.identityPreview.open',
        }),
      ).toBeEnabled();
    },
  );
  it('dirty/pending transition aborts a token continuation and becoming clean requires a new explicit open', async () => {
    const { http } = setup();
    const token = deferred<string | null>();
    mocks.getToken.mockReturnValueOnce(token.promise);
    const { rerender } = render(<BrandOsIdentityPreview {...props} />);
    click('open');
    await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(1));
    rerender(<BrandOsIdentityPreview {...props} isDisabled />);
    await act(async () => {
      token.resolve('old');
      await token.promise;
    });
    expect(http.get).not.toHaveBeenCalled();
    rerender(<BrandOsIdentityPreview {...props} />);
    expect(http.get).not.toHaveBeenCalled();
    click('open');
    await screen.findByText('Saved approved A');
    expect(http.get).toHaveBeenCalledTimes(1);
  });
  it.each(['userId', 'sessionId', 'orgId', 'role'] as const)(
    'closes and fences a pending token on auth %s changes',
    async (key) => {
      const { http } = setup();
      const token = deferred<string | null>();
      mocks.getToken.mockReturnValueOnce(token.promise);
      const { rerender } = render(<BrandOsIdentityPreview {...props} />);
      click('open');
      await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(1));
      if (key === 'role') mocks.role = 'user';
      else mocks.auth[key] = 'changed';
      rerender(<BrandOsIdentityPreview {...props} />);
      await act(async () => {
        token.resolve('old');
        await token.promise;
      });
      expect(http.get).not.toHaveBeenCalled();
      expect(screen.queryByText('Saved approved A')).not.toBeInTheDocument();
    },
  );
  it('failed refresh removes successful evidence and exposes only a safe bounded error', async () => {
    const { http } = setup();
    render(<BrandOsIdentityPreview {...props} />);
    click('open');
    await screen.findByText('Saved approved A');
    http.get.mockRejectedValueOnce({
      errors: [{ status: 403, detail: 'PRIVATE_SERVER_BODY' }],
    });
    click('refresh');
    expect(screen.queryByText('Saved approved A')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'pages.brandOsSettings.identityPreview.unavailable',
      ),
    );
    expect(screen.queryByText('PRIVATE_SERVER_BODY')).not.toBeInTheDocument();
  });
  it.each([
    { reason: 'brand_identity_integrity_failed', label: 'integrityFailed' },
    { reason: 'brand_identity_asset_unavailable', label: 'assetsUnavailable' },
    { reason: 'brand_identity_unavailable', label: 'unavailable' },
    { reason: 'PRIVATE_UNEXPECTED_ERROR', label: 'loadFailed' },
  ])(
    'shows safe $label for $reason without marking anything approved or generated',
    async ({ reason, label }) => {
      const { http } = setup();
      http.get.mockRejectedValueOnce({
        errors: [{ code: '409', status: 409, detail: reason }],
      });
      render(<BrandOsIdentityPreview {...props} />);
      click('open');
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          `pages.brandOsSettings.identityPreview.${label}`,
        ),
      );
      expect(screen.queryByText('Saved approved A')).not.toBeInTheDocument();
      expect(screen.queryByText(reason)).not.toBeInTheDocument();
    },
  );
  it('never displays a current provisional response as an approval', async () => {
    const { http } = setup();
    http.get.mockResolvedValueOnce(
      axiosResponse(
        resourceDocument(
          {
            snapshot: { ...snapshot(), approval: 'provisional' },
            source: 'current_approved_revision',
          },
          { id: hash, type: 'brand-identity-preview' },
        ),
      ),
    );
    render(<BrandOsIdentityPreview {...props} />);
    click('open');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'pages.brandOsSettings.identityPreview.integrityFailed',
      ),
    );
    expect(screen.queryByText('Saved approved A')).not.toBeInTheDocument();
  });
});
