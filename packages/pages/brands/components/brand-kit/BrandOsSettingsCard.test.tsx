import { FontFamily, MemberRole } from '@genfeedai/contracts';
import type {
  IBrandKitDraft,
  IBrandOsExportState,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import type { BrandGenerationRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import type { BrandOsGuideReadiness } from '@props/pages/brand-os-settings.props';
import type { BrandIdentityPreviewResult } from '@services/ai/branded-generation-receipts.service';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Button } from '@ui/primitives/button';
import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { Children, isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandOsSettingsCard from './BrandOsSettingsCard';

const mocks = vi.hoisted(() => ({
  role: 'owner' as string | null | undefined,
  getService: vi.fn(),
  listBrandOsRevisions: vi.fn(),
  updateBrandOsRevision: vi.fn(),
  approveBrandOsRevision: vi.fn(),
  getBrandOsExport: vi.fn(),
  downloadBrandOsDesign: vi.fn(),
  publishBrandOsDesign: vi.fn(),
  revokeBrandOsDesign: vi.fn(),
  getIdentityPreview: vi.fn(),
  getToken: vi.fn(),
  refresh: vi.fn(),
  saved: vi.fn(),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const t = translateFromCatalog('pages.brandOsSettings');
  const catalogs = new Map(
    [
      'common.actions',
      'pages.brandOsSettings.generationRulesReview',
      'pages.brandOsSettings.identityPreview',
      'pages.generationReceipts.identitySnapshot',
    ].map((namespace) => [namespace, translateFromCatalog(namespace)]),
  );
  return {
    useTranslations: (namespace: string) => catalogs.get(namespace) ?? t,
  };
});
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => {
  const identity = {
    getToken: mocks.getToken,
    userId: 'user-1',
    sessionId: 'session-1',
    orgId: 'org-1',
    isLoaded: true,
    isSignedIn: true,
  };
  return { useAuthIdentity: () => identity };
});
vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.role,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  AuthenticationTokenUnavailableError: class extends Error {},
  useAuthedService: () => mocks.getService,
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock('@ui/card/Card', () => ({
  default: ({ children, label }: { children: ReactNode; label: string }) => (
    <section>
      <h2>{label}</h2>
      {children}
    </section>
  ),
}));
vi.mock('@ui/primitives/input', () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock('@ui/primitives/textarea', () => ({
  Textarea: (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));
vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    label,
    isChecked,
    isDisabled,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    label: string;
    isChecked?: boolean;
    isDisabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
    'aria-label': string;
  }) => (
    <label>
      <input
        type="checkbox"
        aria-label={ariaLabel}
        disabled={isDisabled}
        checked={isChecked}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      {label}
    </label>
  ),
}));
vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
    disabled,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <select
      aria-label={
        Children.toArray(children)
          .map((child) =>
            isValidElement<{ 'aria-label'?: string }>(child)
              ? child.props['aria-label']
              : undefined,
          )
          .find(Boolean) ?? 'Revision history'
      }
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

function draft(): IBrandKitDraft {
  return {
    id: 'draft-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    status: 'ready',
    sourceType: 'manual',
    assetCandidates: [],
    diagnostics: [],
    evidence: [],
    fields: {
      description: {
        key: 'description',
        label: 'Description',
        group: 'profile',
        ownerPath: 'brand.description',
        applyActionDefault: 'accept',
        proposedValue: 'Original voice',
        diagnostics: [],
        evidence: [],
      },
    },
    readiness: {
      status: 'complete',
      score: 100,
      requiredFields: [],
      missingFields: [],
      diagnostics: [],
    },
  };
}
function revision(overrides: Partial<IBrandOsRevision> = {}): IBrandOsRevision {
  const content = overrides.content ?? {
    ...draft(),
    brandId: overrides.brandId ?? 'brand-1',
    organizationId: overrides.organizationId ?? 'org-1',
  };
  return {
    exportSchemaVersion: '1',
    id: 'revision-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    version: 1,
    status: 'DRAFT',
    content,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
    approvedAt: null,
    approvedById: null,
    ...overrides,
  };
}
function exportState(
  overrides: Partial<IBrandOsExportState> = {},
): IBrandOsExportState {
  return {
    id: 'brand-1',
    brandId: 'brand-1',
    state: 'unavailable',
    revisionId: null,
    schemaVersion: '1',
    digest: overrides.revisionId ? 'approved-digest' : null,
    generatedAt: null,
    publishedRevisionId: null,
    publicUrl: null,
    revisionUrl: null,
    publishedAt: null,
    canPublish: true,
    ...overrides,
  };
}
async function renderSettings() {
  render(
    <BrandOsSettingsCard
      brandId="brand-1"
      onRefreshBrand={mocks.refresh}
      onRevisionSaved={mocks.saved}
    />,
  );
  await screen.findByLabelText('Description');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = MemberRole.OWNER;
  mocks.getService.mockResolvedValue(mocks);
  mocks.listBrandOsRevisions.mockResolvedValue([revision()]);
  mocks.getBrandOsExport.mockResolvedValue(exportState());
  mocks.refresh.mockResolvedValue(undefined);
});

describe('Brand OS revision settings', () => {
  it('edits visual identity with a font selection and a color input while preserving the saved draft payload', async () => {
    const content = draft();
    content.fields.fontFamily = {
      key: 'fontFamily',
      label: 'Font family',
      group: 'visual',
      ownerPath: 'brand.fontFamily',
      applyActionDefault: 'accept',
      proposedValue: FontFamily.MONTSERRAT_REGULAR,
      diagnostics: [],
      evidence: [],
    };
    content.fields.primaryColor = {
      key: 'primaryColor',
      label: 'Primary color',
      group: 'visual',
      ownerPath: 'brand.primaryColor',
      applyActionDefault: 'accept',
      proposedValue: '#222222',
      diagnostics: [],
      evidence: [],
    };
    mocks.listBrandOsRevisions.mockResolvedValue([revision({ content })]);
    mocks.updateBrandOsRevision.mockResolvedValue(revision({ content }));
    await renderSettings();
    const font = screen.getByRole('combobox', { name: 'Font family' });
    expect(font).toHaveValue(FontFamily.MONTSERRAT_REGULAR);
    fireEvent.change(font, { target: { value: FontFamily.MONTSERRAT_BOLD } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Primary color' }), {
      target: { value: '#123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(mocks.updateBrandOsRevision).toHaveBeenCalledWith(
        'brand-1',
        'revision-1',
        expect.objectContaining({
          content: expect.objectContaining({
            fields: expect.objectContaining({
              fontFamily: expect.objectContaining({
                proposedValue: FontFamily.MONTSERRAT_BOLD,
              }),
              primaryColor: expect.objectContaining({
                proposedValue: '#123456',
              }),
            }),
          }),
        }),
      ),
    );
  });

  it.each([MemberRole.OWNER, MemberRole.ADMIN])(
    'allows %s to edit and approve without the read-only banner',
    async (role) => {
      mocks.role = role;
      mocks.approveBrandOsRevision.mockResolvedValue(
        revision({ status: 'APPROVED', approvedById: 'user-1' }),
      );
      await renderSettings();
      expect(
        screen.queryByText(/Only organization owners and admins/),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
      await waitFor(() =>
        expect(mocks.approveBrandOsRevision).toHaveBeenCalled(),
      );
    },
  );

  it.each([MemberRole.CREATOR, MemberRole.USER, null])(
    'shows the read-only banner for resolved role %s',
    async (role) => {
      mocks.role = role;
      await renderSettings();
      expect(
        screen.getByText(/Only organization owners and admins/),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeDisabled();
      expect(
        screen.queryByRole('button', { name: 'Approve revision' }),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps export unavailable before approval and preserves rejected save edits', async () => {
    mocks.updateBrandOsRevision.mockRejectedValueOnce(
      new Error('This draft changed. Refresh and try again.'),
    );
    await renderSettings();
    expect(
      screen.getByRole('button', { name: 'Download design.md' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Edited voice' },
    });
    expect(
      screen.getByRole('button', { name: 'Approve revision' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('combobox', { name: 'Revision history' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This draft changed',
    );
    expect(screen.getByLabelText('Description')).toHaveValue('Edited voice');
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(mocks.updateBrandOsRevision).toHaveBeenCalledWith(
      'brand-1',
      'revision-1',
      expect.objectContaining({
        updatedAt: '2026-09-14T10:00:00.000Z',
        content: expect.objectContaining({
          fields: expect.objectContaining({
            description: expect.objectContaining({
              proposedValue: 'Edited voice',
            }),
          }),
        }),
      }),
    );
  });

  it('saves inclusion choices then approves exactly the saved revision', async () => {
    const saved = revision({ updatedAt: '2026-09-14T11:00:00.000Z' });
    const description = saved.content.fields.description;
    if (!description) throw new Error('Missing description fixture');
    saved.content.fields.description = {
      ...description,
      applyActionDefault: 'reject',
    };
    mocks.updateBrandOsRevision.mockResolvedValue(saved);
    mocks.approveBrandOsRevision.mockResolvedValue({
      ...saved,
      status: 'APPROVED',
    });
    await renderSettings();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Include Description in approval' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Approve revision' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
    await waitFor(() =>
      expect(mocks.approveBrandOsRevision).toHaveBeenCalledWith(
        'brand-1',
        'revision-1',
        saved.updatedAt,
      ),
    );
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(2));
    expect(mocks.saved.mock.calls[0][0]).toEqual(saved);
    expect(mocks.saved.mock.calls[1][0].status).toBe('APPROVED');
    expect(mocks.publishBrandOsDesign).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        /New supported brand generation can use this version/,
      ),
    ).toBeInTheDocument();
  });

  it('forks an approved revision and retains the approved history', async () => {
    mocks.listBrandOsRevisions.mockResolvedValue([
      revision({ status: 'APPROVED' }),
    ]);
    mocks.updateBrandOsRevision.mockResolvedValue(
      revision({ id: 'revision-2', version: 2 }),
    );
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Save as new draft' }));
    await screen.findByText('Revision 2 saved as a draft.');
    expect(
      screen.getByRole('option', { name: 'Revision 1 · approved' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Revision 2 · draft' }),
    ).toBeInTheDocument();
  });

  it('requires explicit republish when the approved revision is newer, then permits revoke', async () => {
    const published = exportState({
      state: 'published',
      revisionId: 'revision-2',
      publishedRevisionId: 'revision-1',
      publicUrl: 'https://api.example.com/public/design.md',
    });
    mocks.getBrandOsExport.mockResolvedValue(published);
    mocks.publishBrandOsDesign.mockResolvedValue({
      ...published,
      publishedRevisionId: 'revision-2',
    });
    mocks.revokeBrandOsDesign.mockResolvedValue({
      ...published,
      state: 'revoked',
      publicUrl: null,
    });
    await renderSettings();
    expect(
      screen.getByRole('link', { name: 'Open public design.md' }),
    ).toHaveAttribute('href', published.publicUrl);
    expect(mocks.publishBrandOsDesign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Update publication' }));
    await waitFor(() =>
      expect(mocks.publishBrandOsDesign).toHaveBeenCalledWith(
        'brand-1',
        'revision-2',
      ),
    );
    await screen.findByText('Your approved design.md is now public.');
    fireEvent.click(
      screen.getByRole('button', { name: 'Revoke public access' }),
    );
    await screen.findByText('design.md · revoked');
    expect(
      screen.getByText(
        /Publishing again re-enables previously shared stable links/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Open public design.md' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download design.md' }),
    ).toBeEnabled();
  });

  it('keeps member access read-only while downloading through the authenticated service', async () => {
    mocks.role = MemberRole.USER;
    mocks.getBrandOsExport.mockResolvedValue(
      exportState({ state: 'private', revisionId: 'revision-1' }),
    );
    mocks.downloadBrandOsDesign.mockResolvedValue(new Blob(['# Brand']));
    const createUrl = vi.fn(() => 'blob:design');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: createUrl,
        revokeObjectURL: vi.fn(),
      }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    await renderSettings();
    expect(screen.getByLabelText('Description')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Approve revision' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Publish design.md' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download design.md' }));
    await waitFor(() =>
      expect(mocks.downloadBrandOsDesign).toHaveBeenCalledWith('brand-1'),
    );
    await screen.findByText('Your approved design.md has been downloaded.');
    expect(createUrl).toHaveBeenCalled();
    click.mockRestore();
  });

  it('keeps edits when another draft arrives and loads history only after discard', async () => {
    const view = render(
      <BrandOsSettingsCard
        brandId="brand-1"
        onRefreshBrand={mocks.refresh}
        onRevisionSaved={mocks.saved}
      />,
    );
    await screen.findByLabelText('Description');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Unsaved' },
    });
    mocks.listBrandOsRevisions.mockResolvedValue([
      revision({ id: 'revision-2', version: 2 }),
      revision(),
    ]);
    view.rerender(
      <BrandOsSettingsCard
        brandId="brand-1"
        refreshKey={1}
        onRefreshBrand={mocks.refresh}
      />,
    );
    await screen.findByText(
      'New revisions are available. Save or discard your edits before refreshing history.',
    );
    expect(screen.getByLabelText('Description')).toHaveValue('Unsaved');
    fireEvent.click(
      screen.getByRole('button', { name: 'Discard unsaved edits' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));
    await screen.findByRole('option', { name: 'Revision 2 · draft' });
  });
  it('adds missing lists and social links using the correct value shapes', async () => {
    mocks.updateBrandOsRevision.mockImplementation(
      async (_brandId, _revisionId, body) =>
        revision({ content: body.content }),
    );
    await renderSettings();
    fireEvent.change(screen.getByLabelText('Voice audience'), {
      target: { value: 'Founders\nDesigners' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Social links' }));
    fireEvent.change(screen.getByLabelText('Social links 1 url'), {
      target: { value: 'https://example.com/social' },
    });
    fireEvent.change(screen.getByLabelText('Social links 1 platform'), {
      target: { value: 'linkedin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(mocks.updateBrandOsRevision).toHaveBeenCalledWith(
        'brand-1',
        'revision-1',
        expect.objectContaining({
          content: expect.objectContaining({
            fields: expect.objectContaining({
              voiceAudience: expect.objectContaining({
                proposedValue: ['Founders', 'Designers'],
              }),
              socialLinks: expect.objectContaining({
                proposedValue: [
                  expect.objectContaining({
                    url: 'https://example.com/social',
                    platform: 'linkedin',
                  }),
                ],
              }),
            }),
          }),
        }),
      ),
    );
  });
  it('preserves the remaining social link input when an earlier entry is removed', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Add Social links' }));
    fireEvent.change(screen.getByLabelText('Social links 1 url'), {
      target: { value: 'https://first.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Social links' }));
    const remainingInput = screen.getByLabelText('Social links 2 url');
    remainingInput.focus();
    fireEvent.change(remainingInput, {
      target: { value: 'https://second.example' },
    });
    expect(screen.getByLabelText('Social links 2 url')).toBe(remainingInput);
    fireEvent.click(
      screen.getByRole('button', { name: /Remove Social links 1/ }),
    );
    expect(screen.getByLabelText('Social links 1 url')).toBe(remainingInput);
    expect(remainingInput).toHaveValue('https://second.example');
    expect(remainingInput).toHaveFocus();
  });
  it('keeps approved revisions editable when export validation fails and retries only export metadata', async () => {
    mocks.listBrandOsRevisions.mockResolvedValue([
      revision({ status: 'APPROVED' }),
    ]);
    mocks.getBrandOsExport.mockRejectedValueOnce(
      new Error('Approved brand identity is missing.'),
    );
    await renderSettings();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Approved brand identity is missing.',
    );
    expect(
      screen.getByRole('combobox', { name: 'Revision history' }),
    ).toBeEnabled();
    expect(screen.getByLabelText('Description')).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Save as new draft' }),
    ).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Repaired draft identity' },
    });
    mocks.getBrandOsExport.mockResolvedValue(
      exportState({ state: 'private', revisionId: 'revision-1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry', exact: true }));
    await screen.findByText('design.md · private');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Repaired draft identity',
    );
    expect(mocks.listBrandOsRevisions).toHaveBeenCalledTimes(1);
    expect(mocks.getBrandOsExport).toHaveBeenCalledTimes(2);
  });

  it('does not expose a revision editor when the revision history request fails', async () => {
    mocks.listBrandOsRevisions.mockRejectedValueOnce(
      new Error('Revision history unavailable.'),
    );
    render(
      <BrandOsSettingsCard
        brandId="brand-1"
        onRefreshBrand={mocks.refresh}
        onRevisionSaved={mocks.saved}
      />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Revision history unavailable.',
    );
    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh history' }),
    ).toBeEnabled();
  });
  it.each(['logo', 'references'] as const)(
    'restores current %s after deselecting a candidate, but respects explicit exclusion',
    async (key) => {
      const currentAsset = {
        role: key === 'logo' ? ('logo' as const) : ('reference' as const),
        sourceType: 'manual' as const,
        url: 'https://example.com/current.png',
      };
      const currentValue = key === 'references' ? [currentAsset] : currentAsset;
      const saved = revision();
      saved.content.fields[key] = {
        key,
        label: key,
        group: 'assets',
        ownerPath: key === 'logo' ? 'brand.logo' : 'brand.references',
        applyActionDefault: 'preserve',
        currentValue,
        diagnostics: [],
        evidence: [],
      };
      saved.content.assetCandidates = [
        {
          candidateId: 'candidate-1',
          label: 'Candidate image',
          role: currentAsset.role,
          sourceType: 'website',
          url: 'https://example.com/candidate.png',
        },
      ];
      mocks.listBrandOsRevisions.mockResolvedValue([saved]);
      mocks.updateBrandOsRevision.mockImplementation(
        async (_brandId, _revisionId, body) =>
          revision({ content: body.content }),
      );
      await renderSettings();
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Use Candidate image' }),
      );
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Use Candidate image' }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
      await waitFor(() =>
        expect(mocks.updateBrandOsRevision).toHaveBeenCalledWith(
          'brand-1',
          'revision-1',
          expect.objectContaining({
            content: expect.objectContaining({
              fields: expect.objectContaining({
                [key]: expect.objectContaining({
                  applyActionDefault: 'preserve',
                  proposedValue: currentValue,
                }),
              }),
            }),
          }),
        ),
      );
      await screen.findByText('Revision 1 saved as a draft.');
      const label = key === 'logo' ? 'Logo' : 'Reference assets';
      fireEvent.click(
        screen.getByRole('checkbox', { name: `Include ${label} in approval` }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
      await waitFor(() =>
        expect(mocks.updateBrandOsRevision).toHaveBeenLastCalledWith(
          'brand-1',
          'revision-1',
          expect.objectContaining({
            content: expect.objectContaining({
              fields: expect.objectContaining({
                [key]: expect.objectContaining({
                  applyActionDefault: 'reject',
                }),
              }),
            }),
          }),
        ),
      );
    },
  );

  it('exposes and revokes an older publication when the latest approved export is unavailable', async () => {
    mocks.getBrandOsExport.mockResolvedValue(
      exportState({
        state: 'unavailable',
        revisionId: 'revision-2',
        digest: null,
        publishedRevisionId: 'revision-1',
        publicUrl: 'https://example.com/public/design.md',
        revisionUrl: 'https://example.com/public/revision-1/design.md',
      }),
    );
    mocks.revokeBrandOsDesign.mockResolvedValue(
      exportState({ state: 'revoked', revisionId: 'revision-2', digest: null }),
    );
    await renderSettings();
    expect(
      screen.getByText(
        'Approved revision cannot be exported. Review required identity and export limits, then save and approve a corrected revision.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Approve a revision to create your design.md export.'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'A newer approved revision is available. Update the publication to share it.',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open public design.md' }),
    ).toHaveAttribute('href', 'https://example.com/public/design.md');
    expect(
      screen.getByRole('link', { name: 'Open immutable revision design.md' }),
    ).toHaveAttribute(
      'href',
      'https://example.com/public/revision-1/design.md',
    );
    expect(
      screen.getByRole('button', { name: 'Download design.md' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Update publication' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Revoke public access' }),
    );
    await screen.findByText('design.md · revoked');
    expect(
      screen.queryByRole('link', { name: 'Open immutable revision design.md' }),
    ).not.toBeInTheDocument();
  });
});

interface CardDeferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}
function cardDeferred<T>(): CardDeferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('saved callback epochs and native exit capture', () => {
  it('notifies approval before auxiliary export/brand failures while retaining persisted approval', async () => {
    mocks.approveBrandOsRevision.mockResolvedValue(
      revision({ status: 'APPROVED' }),
    );
    await renderSettings();
    mocks.getBrandOsExport.mockRejectedValueOnce(new Error('export offline'));
    mocks.refresh.mockRejectedValueOnce(new Error('brand refresh offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
    await waitFor(() =>
      expect(mocks.saved).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status: 'APPROVED' }),
      ),
    );
    expect(
      await screen.findByRole('button', { name: 'Save as new draft' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('option', { name: 'Revision 1 · approved' }),
    ).toBeInTheDocument();
    expect(mocks.saved.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refresh.mock.invocationCallOrder[0],
    );
  });

  it.each(['acquiring', 'responding', 'unmounted'] as const)(
    'does not dispatch or notify stale save when %s',
    async (stage) => {
      const view = render(
        <BrandOsSettingsCard
          brandId="brand-1"
          onRefreshBrand={mocks.refresh}
          onRevisionSaved={mocks.saved}
        />,
      );
      await screen.findByLabelText('Description');
      const serviceGate = cardDeferred<typeof mocks>();
      const responseGate = cardDeferred<IBrandOsRevision>();
      if (stage === 'acquiring')
        mocks.getService.mockReturnValueOnce(serviceGate.promise);
      else
        mocks.updateBrandOsRevision.mockReturnValueOnce(responseGate.promise);
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Old edit' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
      if (stage !== 'acquiring')
        await waitFor(() =>
          expect(mocks.updateBrandOsRevision).toHaveBeenCalledTimes(1),
        );
      if (stage === 'unmounted') view.unmount();
      else {
        mocks.listBrandOsRevisions.mockResolvedValue([
          revision({ id: 'new-brand-revision', brandId: 'brand-2' }),
        ]);
        view.rerender(
          <BrandOsSettingsCard
            brandId="brand-2"
            onRefreshBrand={mocks.refresh}
            onRevisionSaved={mocks.saved}
          />,
        );
        await screen.findByLabelText('Description');
      }
      await act(async () => {
        serviceGate.resolve(mocks);
        responseGate.resolve(revision({ id: 'old-save' }));
      });
      expect(mocks.saved).not.toHaveBeenCalled();
      if (stage === 'acquiring')
        expect(mocks.updateBrandOsRevision).not.toHaveBeenCalled();
      if (stage !== 'unmounted')
        expect(screen.getByLabelText('Description')).toHaveValue(
          'Original voice',
        );
    },
  );

  it.each(['acquiring', 'responding', 'unmounted'] as const)(
    'fences stale approval and auxiliary refresh when %s',
    async (stage) => {
      const view = render(
        <BrandOsSettingsCard
          brandId="brand-1"
          onRefreshBrand={mocks.refresh}
          onRevisionSaved={mocks.saved}
        />,
      );
      await screen.findByLabelText('Description');
      const serviceGate = cardDeferred<typeof mocks>();
      const responseGate = cardDeferred<IBrandOsRevision>();
      if (stage === 'acquiring')
        mocks.getService.mockReturnValueOnce(serviceGate.promise);
      else
        mocks.approveBrandOsRevision.mockReturnValueOnce(responseGate.promise);
      fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
      if (stage !== 'acquiring')
        await waitFor(() =>
          expect(mocks.approveBrandOsRevision).toHaveBeenCalledTimes(1),
        );
      if (stage === 'unmounted') view.unmount();
      else {
        mocks.listBrandOsRevisions.mockResolvedValue([
          revision({ brandId: 'brand-2', id: 'new-revision' }),
        ]);
        view.rerender(
          <BrandOsSettingsCard
            brandId="brand-2"
            onRefreshBrand={mocks.refresh}
            onRevisionSaved={mocks.saved}
          />,
        );
        await screen.findByLabelText('Description');
      }
      const exportReads = mocks.getBrandOsExport.mock.calls.length;
      await act(async () => {
        serviceGate.resolve(mocks);
        responseGate.resolve(revision({ status: 'APPROVED' }));
      });
      expect(mocks.saved).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.getBrandOsExport).toHaveBeenCalledTimes(exportReads);
      if (stage === 'acquiring')
        expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
    },
  );

  it('does not notify reads, export actions or a rejected approval', async () => {
    mocks.approveBrandOsRevision.mockRejectedValueOnce(new Error('conflict'));
    await renderSettings();
    expect(mocks.saved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));
    await waitFor(() =>
      expect(mocks.listBrandOsRevisions).toHaveBeenCalledTimes(2),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
    await screen.findByRole('alert');
    expect(mocks.saved).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'real native button child click with dirty confirmation=%s runs exit only when accepted',
    async (accept) => {
      const exit = vi.fn();
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(accept);
      const view = render(
        <>
          <BrandOsSettingsCard
            brandId="brand-1"
            onRefreshBrand={mocks.refresh}
          />
          <Button data-brand-os-navigation="brand-1" onClick={exit}>
            <span>Wizard exit</span>
          </Button>
        </>,
      );
      await screen.findByLabelText('Description');
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Unsaved' },
      });
      fireEvent.click(screen.getByText('Wizard exit'));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledTimes(accept ? 1 : 0);
      view.unmount();
      confirm.mockRestore();
    },
  );

  it('ignores clean, unmarked, other-brand and disabled native buttons and preserves anchor exceptions', async () => {
    const exit = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <>
        <BrandOsSettingsCard brandId="brand-1" onRefreshBrand={mocks.refresh} />
        <Button
          data-brand-os-navigation="brand-1"
          label="Clean exit"
          onClick={exit}
        />
        <Button label="Unmarked" onClick={exit} />
        <Button
          data-brand-os-navigation="brand-2"
          label="Other brand"
          onClick={exit}
        />
        <Button
          data-brand-os-navigation="brand-1"
          label="Disabled"
          isDisabled
          onClick={exit}
        />
        <a href="/next" onClick={(event) => event.preventDefault()}>
          Navigate
        </a>
        <a
          href="/download"
          download
          onClick={(event) => event.preventDefault()}
        >
          Download
        </a>
        <a
          href="/blank"
          target="_blank"
          onClick={(event) => event.preventDefault()}
          rel="noopener"
        >
          New tab
        </a>
      </>,
    );
    await screen.findByLabelText('Description');
    fireEvent.click(screen.getByText('Clean exit'));
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Unsaved' },
    });
    for (const name of [
      'Unmarked',
      'Other brand',
      'Disabled',
      'Download',
      'New tab',
    ])
      fireEvent.click(screen.getByText(name));
    expect(confirm).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByText('Navigate'));
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});

const acknowledgementLabel =
  'I have reviewed the saved generation rules and their sources.';
const candidateHash = `sha256:${'a'.repeat(64)}`;
function savedRules(
  label = 'Saved source for account one',
): BrandGenerationRulesV1 {
  return {
    schemaVersion: 1,
    evidence: [{ id: 'manual-source', sourceType: 'manual', label }],
    facts: [],
    palette: [],
    typography: [],
    mandatory: [],
    avoid: [],
    examples: [],
    assets: [],
  };
}
function reviewedRevision(
  overrides: Partial<IBrandOsRevision> = {},
): IBrandOsRevision {
  const result = revision(overrides);
  return {
    ...result,
    content: { ...result.content, generationRules: savedRules() },
    generationRulesReviewCandidateHash: candidateHash,
    ...overrides,
  };
}
function cardProps() {
  return {
    brandId: 'brand-1',
    onRefreshBrand: mocks.refresh,
    onRevisionSaved: mocks.saved,
  };
}
async function renderReviewed(saved = reviewedRevision()) {
  mocks.listBrandOsRevisions.mockResolvedValue([saved]);
  const view = render(<BrandOsSettingsCard {...cardProps()} />);
  await screen.findByLabelText('Description');
  return view;
}
function acknowledge() {
  fireEvent.click(screen.getByRole('checkbox', { name: acknowledgementLabel }));
}

describe('saved generation rules acknowledgement and authority fences', () => {
  it('requires explicit review of the saved candidate, submits exact captured values once and emits the actual approved revision', async () => {
    const saved = reviewedRevision();
    const approved = {
      ...saved,
      status: 'APPROVED' as const,
      generationRulesReviewHash: candidateHash,
      generationRulesReviewCandidateHash: undefined,
    };
    const gate = cardDeferred<IBrandOsRevision>();
    mocks.approveBrandOsRevision.mockReturnValueOnce(gate.promise);
    await renderReviewed(saved);
    const button = screen.getByRole('button', { name: 'Approve revision' });
    expect(button).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: acknowledgementLabel }),
    ).not.toBeChecked();
    expect(mocks.saved).not.toHaveBeenCalled();
    acknowledge();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() =>
      expect(mocks.approveBrandOsRevision).toHaveBeenCalledExactlyOnceWith(
        'brand-1',
        saved.id,
        saved.updatedAt,
        candidateHash,
      ),
    );
    await act(async () => gate.resolve(approved));
    await waitFor(() =>
      expect(mocks.saved).toHaveBeenCalledExactlyOnceWith(approved),
    );
    expect(
      screen.queryByRole('checkbox', { name: acknowledgementLabel }),
    ).not.toBeInTheDocument();
    expect(mocks.publishBrandOsDesign).not.toHaveBeenCalled();
    expect(mocks.downloadBrandOsDesign).not.toHaveBeenCalled();
  });

  it.each([
    'missing',
    'malformed',
    'null rules',
    'invalid references',
  ] as const)(
    'fails closed for %s without treating present rules as legacy',
    async (mode) => {
      const saved = reviewedRevision();
      if (mode === 'missing') delete saved.generationRulesReviewCandidateHash;
      if (mode === 'malformed')
        saved.generationRulesReviewCandidateHash = `sha256:${'A'.repeat(64)}`;
      if (mode === 'null rules')
        saved.content = {
          ...saved.content,
          generationRules: null,
        } as unknown as IBrandKitDraft;
      if (mode === 'invalid references')
        saved.content.generationRules = {
          ...savedRules(),
          mandatory: [
            {
              id: 'bad-rule',
              text: 'Invalid reference',
              match: 'literal',
              required: true,
              evidenceIds: ['missing'],
            },
          ],
        };
      await renderReviewed(saved);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'These saved rules cannot be acknowledged.',
      );
      expect(
        screen.getByRole('button', { name: 'Approve revision' }),
      ).toBeDisabled();
      expect(
        screen.queryByRole('checkbox', { name: acknowledgementLabel }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
      expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
    },
  );

  it('never resurrects acknowledgement after editing then reverting, and displays only saved rules', async () => {
    await renderReviewed();
    acknowledge();
    const field = screen.getByLabelText('Description');
    fireEvent.change(field, { target: { value: 'Unsaved change' } });
    expect(
      screen.getByText('Saved source for account one'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: acknowledgementLabel }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Approve revision' }),
    ).toBeDisabled();
    fireEvent.change(field, { target: { value: 'Original voice' } });
    expect(
      screen.getByRole('checkbox', { name: acknowledgementLabel }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Approve revision' }),
    ).toBeDisabled();
  });

  it('clears review on discard, revision selection and explicit history refresh', async () => {
    const first = reviewedRevision();
    const second = reviewedRevision({
      id: 'revision-2',
      version: 2,
      generationRulesReviewCandidateHash: `sha256:${'b'.repeat(64)}`,
    });
    mocks.listBrandOsRevisions.mockResolvedValue([first, second]);
    render(<BrandOsSettingsCard {...cardProps()} />);
    await screen.findByLabelText('Description');
    acknowledge();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Dirty' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Discard unsaved edits' }),
    );
    expect(
      screen.getByRole('checkbox', { name: acknowledgementLabel }),
    ).not.toBeChecked();
    acknowledge();
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Revision history' }),
      { target: { value: second.id } },
    );
    expect(
      screen.getByRole('checkbox', { name: acknowledgementLabel }),
    ).not.toBeChecked();
    acknowledge();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));
    await screen.findByLabelText('Description');
    expect(
      screen.getByRole('checkbox', { name: acknowledgementLabel }),
    ).not.toBeChecked();
    expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
  });

  it('loads the fresh server candidate after save and requires another acknowledgement', async () => {
    const saved = reviewedRevision({
      updatedAt: '2026-10-02T10:00:00.000Z',
      generationRulesReviewCandidateHash: `sha256:${'b'.repeat(64)}`,
    });
    mocks.updateBrandOsRevision.mockResolvedValueOnce(saved);
    await renderReviewed();
    acknowledge();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Edited guide' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Revision 1 saved as a draft.');
    expect(
      screen.getByRole('checkbox', { name: acknowledgementLabel }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Approve revision' }),
    ).toBeDisabled();
    expect(mocks.saved).toHaveBeenCalledExactlyOnceWith(saved);
    expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
  });

  it.each(['Conflict 409: rules changed', 'Transport offline'])(
    'clears acknowledgement and preserves recoverable content on %s without retry',
    async (message) => {
      mocks.approveBrandOsRevision.mockRejectedValueOnce(new Error(message));
      await renderReviewed();
      acknowledge();
      fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.getByLabelText('Description')).toHaveValue(
        'Original voice',
      );
      expect(
        screen.getByText('Saved source for account one'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', { name: acknowledgementLabel }),
      ).not.toBeChecked();
      expect(
        screen.getByRole('button', { name: 'Approve revision' }),
      ).toBeDisabled();
      expect(mocks.approveBrandOsRevision).toHaveBeenCalledOnce();
      expect(mocks.saved).not.toHaveBeenCalled();
      expect(mocks.publishBrandOsDesign).not.toHaveBeenCalled();
    },
  );

  it.each(['actor', 'organization', 'session', 'role'] as const)(
    'cancels approval after deferred service acquisition when same-brand %s changes and hides old evidence immediately',
    async (change) => {
      const view = await renderReviewed();
      acknowledge();
      const oldGate = cardDeferred<typeof mocks>();
      mocks.getService.mockReturnValueOnce(oldGate.promise);
      fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
      const newLoad = cardDeferred<IBrandOsRevision[]>();
      mocks.listBrandOsRevisions.mockReturnValueOnce(newLoad.promise);
      if (change === 'role') mocks.role = MemberRole.USER;
      else mocks.getService = vi.fn().mockResolvedValue(mocks);
      view.rerender(<BrandOsSettingsCard {...cardProps()} />);
      expect(
        screen.queryByText('Saved source for account one'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('checkbox', { name: acknowledgementLabel }),
      ).not.toBeInTheDocument();
      await act(async () => oldGate.resolve(mocks));
      expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
      expect(mocks.saved).not.toHaveBeenCalled();
      await act(async () =>
        newLoad.resolve([
          reviewedRevision({
            organizationId: change === 'organization' ? 'org-2' : 'org-1',
            content: {
              ...draft(),
              organizationId: change === 'organization' ? 'org-2' : 'org-1',
              generationRules: savedRules('Current scope source'),
            },
          }),
        ]),
      );
      expect(
        await screen.findByText('Current scope source'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Saved source for account one'),
      ).not.toBeInTheDocument();
      if (change === 'role')
        expect(
          screen.queryByRole('button', { name: 'Approve revision' }),
        ).not.toBeInTheDocument();
      else
        expect(
          screen.getByRole('button', { name: 'Approve revision' }),
        ).toBeDisabled();
    },
  );

  it('cancels pre-POST approval when a refresh replaces the selected review during token acquisition', async () => {
    const view = await renderReviewed();
    acknowledge();
    const gate = cardDeferred<typeof mocks>();
    mocks.getService.mockReturnValueOnce(gate.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
    mocks.listBrandOsRevisions.mockResolvedValue([
      reviewedRevision({ updatedAt: '2026-10-02T12:00:00.000Z' }),
    ]);
    view.rerender(<BrandOsSettingsCard {...cardProps()} refreshKey={1} />);
    await screen.findByLabelText('Description');
    await act(async () => gate.resolve(mocks));
    expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Approve revision' }),
    ).toBeDisabled();
  });

  it.each(['brand', 'organization', 'revision'] as const)(
    'rejects a wrong saved %s without replacing recoverable edits',
    async (scope) => {
      const response = reviewedRevision({
        ...(scope === 'brand'
          ? { brandId: 'other-brand' }
          : scope === 'organization'
            ? { organizationId: 'other-org' }
            : { id: 'other-revision' }),
      });
      mocks.updateBrandOsRevision.mockResolvedValueOnce(response);
      await renderReviewed();
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Recoverable edited guide' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
      await screen.findByRole('alert');
      expect(screen.getByLabelText('Description')).toHaveValue(
        'Recoverable edited guide',
      );
      expect(
        screen.getByText('Saved source for account one'),
      ).toBeInTheDocument();
      expect(mocks.saved).not.toHaveBeenCalled();
    },
  );

  it('does not dispatch a reviewed approval after unmount during token acquisition', async () => {
    const view = await renderReviewed();
    acknowledge();
    const gate = cardDeferred<typeof mocks>();
    mocks.getService.mockReturnValueOnce(gate.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
    view.unmount();
    await act(async () => gate.resolve(mocks));
    expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
    expect(mocks.saved).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each(['brand', 'organization', 'revision'] as const)(
    'rejects a wrong returned %s after approval without callback or replacement',
    async (scope) => {
      const response = reviewedRevision({
        status: 'APPROVED',
        ...(scope === 'brand'
          ? { brandId: 'other-brand' }
          : scope === 'organization'
            ? { organizationId: 'other-org' }
            : { id: 'other-revision' }),
      });
      mocks.approveBrandOsRevision.mockResolvedValueOnce(response);
      await renderReviewed();
      acknowledge();
      fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
      await screen.findByRole('alert');
      expect(mocks.saved).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(
        screen.getByRole('option', { name: 'Revision 1 · draft' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', { name: acknowledgementLabel }),
      ).not.toBeChecked();
    },
  );

  it.each(['success', 'failure'] as const)(
    'ignores stale %s and finally without unlocking a newer scope approval',
    async (completion) => {
      const view = await renderReviewed();
      const old = cardDeferred<IBrandOsRevision>();
      const newer = cardDeferred<IBrandOsRevision>();
      mocks.approveBrandOsRevision
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(newer.promise);
      acknowledge();
      fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
      await waitFor(() =>
        expect(mocks.approveBrandOsRevision).toHaveBeenCalledTimes(1),
      );
      const current = reviewedRevision({
        organizationId: 'org-2',
        content: {
          ...draft(),
          organizationId: 'org-2',
          generationRules: savedRules('Current scope source'),
        },
      });
      mocks.listBrandOsRevisions.mockResolvedValue([current]);
      mocks.getService = vi.fn().mockResolvedValue(mocks);
      view.rerender(<BrandOsSettingsCard {...cardProps()} />);
      await screen.findByText('Current scope source');
      acknowledge();
      fireEvent.click(screen.getByRole('button', { name: 'Approve revision' }));
      await waitFor(() =>
        expect(mocks.approveBrandOsRevision).toHaveBeenCalledTimes(2),
      );
      const exportReads = mocks.getBrandOsExport.mock.calls.length;
      await act(async () => {
        if (completion === 'success')
          old.resolve(reviewedRevision({ status: 'APPROVED' }));
        else old.reject(new Error('Stale failure'));
      });
      expect(
        screen.queryByText('Saved source for account one'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Stale failure/)).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Approve revision' }),
      ).toBeDisabled();
      expect(mocks.saved).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.getBrandOsExport).toHaveBeenCalledTimes(exportReads);
      const approved = {
        ...current,
        status: 'APPROVED' as const,
        generationRulesReviewHash: candidateHash,
        generationRulesReviewCandidateHash: undefined,
      };
      await act(async () => newer.resolve(approved));
      await waitFor(() =>
        expect(mocks.saved).toHaveBeenCalledExactlyOnceWith(approved),
      );
    },
  );

  it('forks an approved guide as a fresh unacknowledged draft instead of reusing persisted evidence', async () => {
    const approved = reviewedRevision({
      status: 'APPROVED',
      generationRulesReviewHash: candidateHash,
      generationRulesReviewCandidateHash: undefined,
    });
    const fork = reviewedRevision({ id: 'revision-2', version: 2 });
    mocks.updateBrandOsRevision.mockResolvedValueOnce(fork);
    await renderReviewed(approved);
    expect(
      screen.queryByRole('checkbox', { name: acknowledgementLabel }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save as new draft' }));
    await screen.findByText('Revision 2 saved as a draft.');
    expect(
      screen.getByRole('checkbox', { name: acknowledgementLabel }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Approve revision' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('option', { name: 'Revision 1 · approved' }),
    ).toBeInTheDocument();
  });
});

describe('mounted current approved identity preview', () => {
  const identityHash = `sha256:${'d'.repeat(64)}`;
  const openLabel = 'View current approved identity';
  function approvedIdentity(): BrandIdentityPreviewResult {
    return {
      id: identityHash,
      source: 'current_approved_revision',
      snapshot: {
        schemaVersion: 1,
        organizationId: 'org-1',
        brandId: 'brand-1',
        revisionId: 'revision-1',
        revisionVersion: 1,
        approval: 'approved',
        resolvedAt: '2026-09-14T10:00:00.000Z',
        contentHash: identityHash,
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
      },
    };
  }
  function openPreview() {
    fireEvent.click(screen.getByRole('button', { name: openLabel }));
  }
  beforeEach(() => {
    mocks.getIdentityPreview.mockReset().mockResolvedValue(approvedIdentity());
    mocks.listBrandOsRevisions.mockResolvedValue([
      revision({ id: 'revision-2', version: 2 }),
      revision({ status: 'APPROVED', approvedAt: '2026-09-14T10:00:00.000Z' }),
    ]);
    mocks.getBrandOsExport.mockResolvedValue(
      exportState({ revisionId: 'revision-1' }),
    );
  });

  it('opens only on request and shows server-approved A while clean draft B stays selected', async () => {
    await renderSettings();
    expect(mocks.getIdentityPreview).not.toHaveBeenCalled();
    openPreview();
    await screen.findByText('Saved approved A');
    expect(mocks.getIdentityPreview).toHaveBeenCalledExactlyOnceWith(
      'org-1',
      'brand-1',
      undefined,
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole('region', { name: 'Current approved identity' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Revision history' }),
    ).toHaveValue('revision-2');
    expect(
      screen.getByRole('option', { name: 'Revision 2 · draft' }),
    ).toBeInTheDocument();
    expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
    expect(mocks.updateBrandOsRevision).not.toHaveBeenCalled();
    expect(mocks.saved).not.toHaveBeenCalled();
  });

  it('aborts and closes on unsaved edits, explains the saved-version boundary and reopens only after discard', async () => {
    const gate = cardDeferred<BrandIdentityPreviewResult>();
    mocks.getIdentityPreview.mockReturnValueOnce(gate.promise);
    await renderSettings();
    openPreview();
    await waitFor(() =>
      expect(mocks.getIdentityPreview).toHaveBeenCalledTimes(1),
    );
    const signal = mocks.getIdentityPreview.mock.calls[0]?.[3] as AbortSignal;
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Unsaved' },
    });
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole('button', { name: openLabel })).toBeDisabled();
    expect(
      screen.getByText(
        'Save or discard your changes to view the current approved identity.',
      ),
    ).toBeInTheDocument();
    await act(async () => gate.resolve(approvedIdentity()));
    expect(screen.queryByText('Saved approved A')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Discard unsaved edits' }),
    );
    expect(screen.getByRole('button', { name: openLabel })).toBeEnabled();
    expect(screen.queryByText('Saved approved A')).not.toBeInTheDocument();
    openPreview();
    await screen.findByText('Saved approved A');
    expect(mocks.getIdentityPreview).toHaveBeenCalledTimes(2);
  });

  it('closes on revision selection and explicit history refresh without reusing the old preview', async () => {
    await renderSettings();
    openPreview();
    await screen.findByText('Saved approved A');
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Revision history' }),
      { target: { value: 'revision-1' } },
    );
    expect(screen.queryByText('Saved approved A')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: openLabel })).toBeEnabled();
    openPreview();
    await screen.findByText('Saved approved A');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));
    await screen.findByLabelText('Description');
    expect(screen.queryByText('Saved approved A')).not.toBeInTheDocument();
    expect(mocks.getIdentityPreview).toHaveBeenCalledTimes(2);
  });

  it('reports access loss without claiming the guide is missing or exposing the response', async () => {
    mocks.getIdentityPreview.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404, data: { detail: 'PRIVATE' } },
      message: 'PRIVATE',
    });
    await renderSettings();
    openPreview();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The current approved identity cannot be shown. This does not mean the brand guide is missing or unapproved.',
    );
    expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
    expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
  });
});

describe('opt-in auto-save and guide readiness', () => {
  async function renderAutoSaving(
    onReadinessChange: (readiness: BrandOsGuideReadiness) => void = vi.fn(),
  ) {
    render(
      <BrandOsSettingsCard
        brandId="brand-1"
        isAutoSaveEnabled
        onReadinessChange={onReadinessChange}
        onRefreshBrand={mocks.refresh}
        onRevisionSaved={mocks.saved}
      />,
    );
    await screen.findByLabelText('Description');
  }
  function settle(ms = 1800) {
    return act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  it('saves settled edits once through the expected-updatedAt save and never approves', async () => {
    mocks.updateBrandOsRevision.mockImplementation(
      async (
        _brandId: string,
        _id: string,
        body: { content: IBrandKitDraft },
      ) =>
        revision({
          content: body.content,
          updatedAt: '2026-09-14T11:00:00.000Z',
        }),
    );
    await renderAutoSaving();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Edited' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Edited voice' },
    });
    await waitFor(
      () => expect(mocks.updateBrandOsRevision).toHaveBeenCalledTimes(1),
      { timeout: 4000 },
    );
    expect(mocks.updateBrandOsRevision).toHaveBeenCalledWith(
      'brand-1',
      'revision-1',
      expect.objectContaining({
        updatedAt: '2026-09-14T10:00:00.000Z',
        content: expect.objectContaining({
          fields: expect.objectContaining({
            description: expect.objectContaining({
              proposedValue: 'Edited voice',
            }),
          }),
        }),
      }),
    );
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    await settle();
    expect(mocks.updateBrandOsRevision).toHaveBeenCalledTimes(1);
    expect(mocks.approveBrandOsRevision).not.toHaveBeenCalled();
  });

  it('never auto-saves when the card is used without the opt-in', async () => {
    await renderSettings();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Edited voice' },
    });
    await settle();
    expect(mocks.updateBrandOsRevision).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Description')).toHaveValue('Edited voice');
  });

  it('keeps edits and does not retry the same content after a rejected auto-save', async () => {
    mocks.updateBrandOsRevision.mockRejectedValue(
      new Error('Conflict 409: this draft changed'),
    );
    await renderAutoSaving();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Edited voice' },
    });
    expect(
      await screen.findByRole('alert', {}, { timeout: 4000 }),
    ).toHaveTextContent('this draft changed');
    await settle();
    expect(mocks.updateBrandOsRevision).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Description')).toHaveValue('Edited voice');
    expect(mocks.saved).not.toHaveBeenCalled();
  });

  it('reports loaded, dirty and approved state for the selected revision', async () => {
    const readiness = vi.fn();
    await renderAutoSaving(readiness);
    await waitFor(() =>
      expect(readiness).toHaveBeenLastCalledWith({
        isLoaded: true,
        canManage: true,
        isApproved: false,
        isDirty: false,
        isBusy: false,
      }),
    );
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Edited voice' },
    });
    expect(readiness).toHaveBeenLastCalledWith(
      expect.objectContaining({ isDirty: true, isApproved: false }),
    );
  });

  it.each([
    [MemberRole.OWNER, true],
    [MemberRole.ADMIN, true],
    [MemberRole.CREATOR, false],
    [MemberRole.USER, false],
    [null, false],
  ] as const)(
    'reports an approved selected guide for %s',
    async (role, canManage) => {
      mocks.role = role;
      mocks.listBrandOsRevisions.mockResolvedValue([
        revision({
          status: 'APPROVED',
          approvedAt: '2026-09-14T10:00:00.000Z',
          approvedById: 'user-1',
        }),
      ]);
      const readiness = vi.fn();
      await renderAutoSaving(readiness);
      await waitFor(() =>
        expect(readiness).toHaveBeenLastCalledWith({
          isLoaded: true,
          canManage,
          isApproved: true,
          isDirty: false,
          isBusy: false,
        }),
      );
    },
  );

  it('waits for 1500 ms of quiet and restarts the wait on every edit', async () => {
    mocks.updateBrandOsRevision.mockImplementation(
      async (
        _brandId: string,
        _id: string,
        body: { content: IBrandKitDraft },
      ) =>
        revision({
          content: body.content,
          updatedAt: '2026-09-14T11:00:00.000Z',
        }),
    );
    await renderAutoSaving();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'First' },
    });
    await settle(1000);
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Second' },
    });
    await settle(1000);
    expect(mocks.updateBrandOsRevision).not.toHaveBeenCalled();
    await waitFor(
      () => expect(mocks.updateBrandOsRevision).toHaveBeenCalledTimes(1),
      { timeout: 3000 },
    );
    expect(
      mocks.updateBrandOsRevision.mock.calls[0][2].content.fields.description
        .proposedValue,
    ).toBe('Second');
  });

  it('reports busy while an auto-save is pending', async () => {
    const pending = cardDeferred<IBrandOsRevision>();
    mocks.updateBrandOsRevision.mockReturnValue(pending.promise);
    const readiness = vi.fn();
    await renderAutoSaving(readiness);
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Edited voice' },
    });
    await waitFor(
      () =>
        expect(readiness).toHaveBeenLastCalledWith(
          expect.objectContaining({ isBusy: true, isApproved: false }),
        ),
      { timeout: 4000 },
    );
  });

  it('keeps readiness unloaded while the member role is unresolved', async () => {
    mocks.role = undefined;
    const readiness = vi.fn();
    await renderAutoSaving(readiness);
    await waitFor(() => expect(readiness).toHaveBeenCalled());
    expect(readiness).not.toHaveBeenCalledWith(
      expect.objectContaining({ isLoaded: true }),
    );
  });

  it('never lets an older history read replace a newer auto-save', async () => {
    const savedRevision = (content: IBrandKitDraft) =>
      revision({ content, updatedAt: '2026-09-14T11:00:00.000Z' });
    mocks.updateBrandOsRevision.mockImplementation(
      async (
        _brandId: string,
        _id: string,
        body: { content: IBrandKitDraft },
      ) => savedRevision(body.content),
    );
    const view = render(
      <BrandOsSettingsCard
        brandId="brand-1"
        isAutoSaveEnabled
        onRefreshBrand={mocks.refresh}
        onRevisionSaved={mocks.saved}
      />,
    );
    await screen.findByLabelText('Description');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Edited voice' },
    });
    const staleHistory = cardDeferred<IBrandOsRevision[]>();
    mocks.listBrandOsRevisions.mockReturnValueOnce(staleHistory.promise);
    view.rerender(
      <BrandOsSettingsCard
        brandId="brand-1"
        refreshKey={1}
        isAutoSaveEnabled
        onRefreshBrand={mocks.refresh}
        onRevisionSaved={mocks.saved}
      />,
    );
    await settle();
    expect(mocks.updateBrandOsRevision).not.toHaveBeenCalled();
    const persisted = {
      ...draft(),
      fields: {
        description: {
          ...draft().fields.description,
          key: 'description',
          label: 'Description',
          group: 'profile',
          ownerPath: 'brand.description',
          applyActionDefault: 'accept',
          proposedValue: 'Edited voice',
          diagnostics: [],
          evidence: [],
        },
      },
    } satisfies IBrandKitDraft;
    mocks.listBrandOsRevisions.mockResolvedValue([savedRevision(persisted)]);
    await act(async () => {
      staleHistory.resolve([revision()]);
    });
    await waitFor(
      () => expect(mocks.updateBrandOsRevision).toHaveBeenCalledTimes(1),
      { timeout: 4000 },
    );
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    await settle(300);
    expect(screen.getByLabelText('Description')).toHaveValue('Edited voice');
  });
});

describe('mutation fence against stale history reads', () => {
  function withDescription(value: string): IBrandKitDraft {
    return {
      ...draft(),
      fields: {
        description: {
          ...draft().fields.description,
          key: 'description',
          label: 'Description',
          group: 'profile',
          ownerPath: 'brand.description',
          applyActionDefault: 'accept',
          proposedValue: value,
          diagnostics: [],
          evidence: [],
        },
      },
    } satisfies IBrandKitDraft;
  }
  function refreshWith(view: ReturnType<typeof render>, refreshKey: number) {
    view.rerender(
      <BrandOsSettingsCard {...cardProps()} refreshKey={refreshKey} />,
    );
  }

  it('discards an older read that resolves after a save and re-reads the saved guide', async () => {
    const saved = revision({
      content: withDescription('Saved voice'),
      updatedAt: '2026-09-14T11:00:00.000Z',
    });
    const save = cardDeferred<IBrandOsRevision>();
    mocks.updateBrandOsRevision.mockReturnValueOnce(save.promise);
    const view = render(<BrandOsSettingsCard {...cardProps()} />);
    await screen.findByLabelText('Description');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Saved voice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(mocks.updateBrandOsRevision).toHaveBeenCalledTimes(1),
    );
    // A scan completion refreshes history while the save is still in flight.
    const staleRead = cardDeferred<IBrandOsRevision[]>();
    mocks.listBrandOsRevisions.mockReturnValueOnce(staleRead.promise);
    refreshWith(view, 1);
    await waitFor(() =>
      expect(mocks.listBrandOsRevisions).toHaveBeenCalledTimes(2),
    );
    await act(async () => save.resolve(saved));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledTimes(1));
    mocks.listBrandOsRevisions.mockResolvedValue([saved]);
    await act(async () => staleRead.resolve([revision()]));
    // The stale response is dropped and history is read again.
    await waitFor(() =>
      expect(mocks.listBrandOsRevisions).toHaveBeenCalledTimes(3),
    );
    expect(await screen.findByLabelText('Description')).toHaveValue(
      'Saved voice',
    );
    expect(
      screen.queryByRole('button', { name: 'Discard unsaved edits' }),
    ).not.toBeInTheDocument();
  });
});
