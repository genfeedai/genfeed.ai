import { MemberRole } from '@genfeedai/contracts';
import type {
  IBrandKitDraft,
  IBrandOsExportState,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandOsSettingsCard from './BrandOsSettingsCard';

const mocks = vi.hoisted(() => ({
  role: 'owner',
  getService: vi.fn(),
  listBrandOsRevisions: vi.fn(),
  updateBrandOsRevision: vi.fn(),
  approveBrandOsRevision: vi.fn(),
  getBrandOsExport: vi.fn(),
  downloadBrandOsDesign: vi.fn(),
  publishBrandOsDesign: vi.fn(),
  revokeBrandOsDesign: vi.fn(),
  refresh: vi.fn(),
  saved: vi.fn(),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const t = translateFromCatalog('pages.brandOsSettings');
  const common = translateFromCatalog('common.actions');
  return {
    useTranslations: (namespace: string) =>
      namespace === 'common.actions' ? common : t,
  };
});
vi.mock('@hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => mocks.role,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
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
      aria-label="Revision history"
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
  return {
    exportSchemaVersion: '1',
    id: 'revision-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    version: 1,
    status: 'DRAFT',
    content: draft(),
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
    mocks.role = MemberRole.MEMBER;
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
}
function cardDeferred<T>(): CardDeferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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
