import '@testing-library/jest-dom/vitest';
import { brandIdentitySnapshotV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BrandIdentitySnapshotView from '@ui/components/generation-receipts/BrandIdentitySnapshotView';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string, values?: Record<string, string | number>) =>
      `${namespace}.${key}${values?.revision === undefined ? '' : `:${values.revision}`}`,
}));
const hash = `sha256:${'a'.repeat(64)}`;
const exact = '  <script>alert(1)</script> Café\n東京  ';
function snapshot(): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId: 'saved-A',
    revisionVersion: 7,
    approval: 'approved',
    resolvedAt: '2026-10-02T00:00:00.000Z',
    contentHash: hash,
    identity: {
      name: '  Saved Ω  ',
      description: '  Identity\n完整  ',
      positioning: 'Positioning',
      language: 'fr',
    },
    voice: {
      tone: 'Tone',
      style: 'Style',
      audience: ['  Authors  '],
      values: ['Precise'],
      messagingPillars: ['Pillar'],
      avoid: ['Voice avoid'],
      sample: 'Sample',
      guidelines: 'Guidelines',
    },
    generationRules: {
      schemaVersion: 1,
      evidence: [
        {
          id: 'e',
          sourceType: 'manual',
          label: 'Saved evidence',
          sourceId: 'source',
          sourceVersion: 2,
          url: 'https://example.com/evidence',
          excerpt: exact,
          contentHash: hash,
          confidence: 0.7,
        },
      ],
      facts: [
        {
          id: 'fact',
          kind: 'testimonial',
          subject: 'Customer',
          predicate: 'reported',
          value: 'Exact factual wording',
          unit: 'points',
          qualifier: 'Saved survey',
          attributedTo: 'Named customer',
          match: 'literal',
          required: true,
          evidenceIds: ['e'],
          appliesToMediaKinds: ['text'],
        },
      ],
      approvedLiterals: [
        {
          id: 'literal:fact',
          kind: 'fact',
          factRuleId: 'fact',
          text: exact,
          evidenceIds: ['e'],
        },
        {
          id: 'literal:copy',
          kind: 'approved_copy',
          text: '  Exact copy\n完整  ',
          evidenceIds: ['e'],
        },
      ],
      palette: [
        {
          id: 'palette',
          color: '#ABCDEF',
          usage: 'Primary',
          required: false,
          evidenceIds: ['e'],
        },
      ],
      typography: [
        {
          id: 'font',
          family: 'Recorded font',
          role: 'Heading',
          weight: 700,
          style: 'italic',
          availability: 'unknown',
          required: true,
          evidenceIds: ['e'],
        },
      ],
      mandatory: [
        {
          id: 'mandatory',
          text: '  Mandatory literal\n完整  ',
          match: 'literal',
          required: true,
          evidenceIds: ['e'],
          appliesToMediaKinds: ['text', 'image'],
        },
      ],
      avoid: [
        {
          id: 'avoid',
          text: 'Avoid example',
          match: 'semantic',
          required: false,
          evidenceIds: ['e'],
        },
      ],
      examples: [
        {
          id: 'example',
          polarity: 'positive',
          text: 'Exact example',
          evidenceIds: ['e'],
        },
      ],
      assets: [
        {
          id: 'asset-ref',
          assetId: 'stored-object-key',
          role: 'logo',
          required: true,
          evidenceIds: ['e'],
          contentHash: hash,
          mimeType: 'image/png',
          textCoverage: {
            kind: 'approved_literals',
            literalIds: ['literal:copy'],
            evidenceIds: ['e'],
          },
        },
      ],
    },
    diagnostics: [
      {
        code: 'font_unavailable',
        severity: 'warning',
        message: 'Recorded missing font bytes',
        ruleId: 'font',
        evidenceIds: ['e'],
      },
    ],
  };
}
const scope = {
  organizationId: 'org',
  brandId: 'brand',
  source: 'current_approved_revision' as const,
};
async function openDetails() {
  await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(10));
  for (const button of screen.getAllByRole('button')) fireEvent.click(button);
}
describe('pure canonical saved identity inspection', () => {
  afterEach(() => vi.restoreAllMocks());
  it('renders every saved canonical section, full literals, evidence, asset inventory and diagnostics with exact escaped authored text', async () => {
    const value = snapshot();
    expect(brandIdentitySnapshotV1Schema.safeParse(value).success).toBe(true);
    const { container } = render(
      <BrandIdentitySnapshotView {...scope} snapshot={value} />,
    );
    await openDetails();
    for (const text of [
      'Exact factual wording',
      'Named customer',
      '#ABCDEF',
      'Recorded font',
      'Avoid example',
      'Exact example',
      'stored-object-key',
      'https://example.com/evidence',
      'Recorded missing font bytes',
      'literal:copy',
    ])
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    for (const text of [
      exact,
      '  Mandatory literal\n完整  ',
      '  Exact copy\n完整  ',
      '  Identity\n完整  ',
    ])
      expect(
        Array.from(container.querySelectorAll('span,pre')).some(
          (node) => node.textContent === text,
        ),
      ).toBe(true);
    expect(
      container.querySelector('script,a,img,video,audio,iframe'),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /generate|download|reuse/i }),
    ).not.toBeInTheDocument();
  });
  it('shows actual revision, version, resolved time and hash without replacing them with a current timestamp', () => {
    render(<BrandIdentitySnapshotView {...scope} snapshot={snapshot()} />);
    expect(screen.getByText('saved-A')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('2026-10-02T00:00:00.000Z')).toBeInTheDocument();
    expect(screen.getByText(hash)).toBeInTheDocument();
  });
  it.each(['approved', 'provisional'] as const)(
    'labels historical %s as recorded for the actual receipt revision',
    async (approval) => {
      render(
        <BrandIdentitySnapshotView
          {...scope}
          source="receipt_snapshot"
          receiptRevision={3}
          snapshot={{ ...snapshot(), approval }}
        />,
      );
      expect(
        screen.getByRole('region', {
          name: 'pages.generationReceipts.identitySnapshot.receiptTitle:3',
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          `pages.generationReceipts.identitySnapshot.${approval === 'approved' ? 'recordedApproved' : 'recordedProvisional'}`,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          'pages.generationReceipts.identitySnapshot.currentTitle',
        ),
      ).not.toBeInTheDocument();
    },
  );
  it.each([
    { organizationId: 'foreign' },
    { brandId: 'foreign' },
    { contentHash: 'not-a-digest' },
    { revisionVersion: 0 },
    { private: 'PRIVATE' },
    { approval: 'provisional' },
  ])(
    'rejects invalid/foreign/current-nonapproved evidence before any text leaks %j',
    (patch) => {
      render(
        <BrandIdentitySnapshotView
          {...scope}
          snapshot={Object.assign(snapshot(), patch)}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'pages.generationReceipts.identitySnapshot.unavailable',
      );
      expect(screen.queryByText('saved-A')).not.toBeInTheDocument();
    },
  );
  it.each([null, Object.assign(snapshot(), { generationRules: {} })])(
    'handles null or malformed snapshot without invented identity',
    (value) => {
      render(<BrandIdentitySnapshotView {...scope} snapshot={value} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByText('  Saved Ω  ')).not.toBeInTheDocument();
    },
  );
  it('hides old evidence immediately when expected scope changes', () => {
    const value = snapshot();
    const { rerender } = render(
      <BrandIdentitySnapshotView {...scope} snapshot={value} />,
    );
    expect(screen.getByText('saved-A')).toBeInTheDocument();
    rerender(
      <BrandIdentitySnapshotView
        {...scope}
        brandId="brand-B"
        snapshot={value}
      />,
    );
    expect(screen.queryByText('saved-A')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
  it.each([
    'unknown',
    'unavailable',
    'owned_asset',
    'verified_runtime',
  ] as const)(
    'preserves recorded font availability %s without claiming qualification',
    async (availability) => {
      const value = snapshot();
      value.generationRules.typography[0] = {
        ...value.generationRules.typography[0],
        availability,
        ...(availability === 'owned_asset'
          ? { fontAssetReferenceId: 'font-ref' }
          : {}),
        ...(availability === 'verified_runtime'
          ? { runtimeFontId: 'recorded-runtime' }
          : {}),
      };
      if (availability === 'owned_asset')
        value.generationRules.assets.push({
          id: 'font-ref',
          assetId: 'font-storage-id',
          role: 'font',
          required: true,
          evidenceIds: ['e'],
          contentHash: hash,
          mimeType: 'font/woff2',
        });
      render(<BrandIdentitySnapshotView {...scope} snapshot={value} />);
      await openDetails();
      expect(
        screen.getByText(
          `pages.brandOsSettings.generationRulesReview.availability.${availability}`,
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/qualified|ready to generate|compliance pass/i),
      ).not.toBeInTheDocument();
    },
  );
  it('has no request, prompt-reveal, download or storage side effect', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { container } = render(
      <BrandIdentitySnapshotView
        {...scope}
        source="receipt_snapshot"
        receiptRevision={2}
        snapshot={snapshot()}
      />,
    );
    await openDetails();
    expect(fetch).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(container.querySelector('a,[download]')).toBeNull();
  });
  it('retains duplicate recorded diagnostics without dropping evidence', async () => {
    const value = snapshot();
    value.diagnostics.push({ ...value.diagnostics[0] });
    render(<BrandIdentitySnapshotView {...scope} snapshot={value} />);
    await openDetails();
    expect(screen.getAllByText('Recorded missing font bytes')).toHaveLength(2);
  });
  it('shows empty saved sections without inventing rules or font availability', async () => {
    const value = snapshot();
    value.generationRules = {
      schemaVersion: 1,
      evidence: [],
      facts: [],
      palette: [],
      typography: [],
      mandatory: [],
      avoid: [],
      examples: [],
      assets: [],
    };
    value.diagnostics = [];
    render(<BrandIdentitySnapshotView {...scope} snapshot={value} />);
    await openDetails();
    expect(screen.queryByText('Recorded font')).not.toBeInTheDocument();
    expect(
      screen.getAllByText('pages.brandOsSettings.generationRulesReview.empty')
        .length,
    ).toBeGreaterThanOrEqual(10);
  });
});
