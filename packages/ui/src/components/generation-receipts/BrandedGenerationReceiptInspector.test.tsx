const hash = `sha256:${'a'.repeat(64)}`;
const time = '2026-10-01T00:00:00.000Z';
function receipt() {
  return {
    schemaVersion: 1,
    id: 'receipt',
    organizationId: 'org',
    brandId: 'brand',
    actorId: 'PRIVATE_ACTOR',
    requestKey: 'PRIVATE_REQUEST',
    candidateIndex: 0,
    requestHash: hash,
    revision: 0,
    state: 'created',
    mode: 'raw',
    surface: 'api',
    contentType: 'post',
    format: 'text',
    createdAt: time,
    updatedAt: time,
    snapshot: null,
    resolutionHash: null,
    layers: [],
    learning: null,
    prompts: {
      original: { contentHash: hash, retention: 'pending' },
      enhanced: null,
      compiled: null,
    },
    execution: null,
    artifact: null,
    validation: null,
    compliance: 'not_claimed',
    diagnostics: [],
    costs: [{ id: 'cost', stage: 'generation', status: 'pending' }],
    budget: {
      version: 'brand-enforcement-v1',
      maximumGenerationAttempts: 1,
      automaticPaidRetries: 0,
      generationAttemptsUsed: 0,
    },
    isDeleted: false,
  };
}
function publicReceipt() {
  const { actorId: _actor, requestKey: _key, ...value } = receipt();
  return {
    ...value,
    platform: null,
    parentRequestId: null,
    runId: null,
    workflowExecutionId: null,
    generationId: null,
  };
}

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const service = {
    get: vi.fn(),
    getRevision: vi.fn(),
    readPrompt: vi.fn(),
    getIdentityPreview: vi.fn(),
  };
  return { service, getService: async () => service };
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import BrandedGenerationReceiptInspector from './BrandedGenerationReceiptInspector';

const input = {
  organizationId: 'org',
  brandId: 'brand',
  receiptId: 'receipt',
  isOpen: true,
};
describe('shared saved receipt inspector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.service.get.mockResolvedValue({
      ...publicReceipt(),
      layers: [
        {
          kind: 'pack',
          id: 'actual-pack',
          version: ' opaque ',
          status: 'skipped',
          reasonCode: 'context_budget_exceeded',
          evidenceIds: [],
          omittedIds: ['actual-pack'],
        },
      ],
      prompts: {
        original: {
          contentHash: hash,
          retention: 'retained',
          snapshotId: 'snapshot',
        },
        enhanced: { contentHash: hash, retention: 'pending' },
        compiled: {
          contentHash: hash,
          retention: 'unavailable',
          reasonCode: 'prompt_payload_purged',
        },
      },
    });
    mocks.service.readPrompt.mockResolvedValue({
      id: 'receipt:0:original',
      receiptId: 'receipt',
      receiptRevision: 0,
      stage: 'original',
      status: 'retained',
      text: '<img src=x onerror=alert(1)> 🎨\r\n',
      contentHash: hash,
      reasonCode: null,
    });
  });
  it('shows recorded raw/nonapproved state, unknown cost, layers and distinct prompt slots', async () => {
    render(<BrandedGenerationReceiptInspector {...input} />);
    await screen.findAllByText(/actual-pack/);
    expect(screen.getByText(/created · raw · not_claimed/)).toBeInTheDocument();
    expect(
      screen.getByText(/generation · pending · unknown/),
    ).toBeInTheDocument();
    expect(screen.getByText('noValidation')).toBeInTheDocument();
    expect(screen.getByText('promptPending')).toBeInTheDocument();
    expect(screen.getByText(/prompt_payload_purged/)).toBeInTheDocument();
    expect(screen.queryByText('approved')).not.toBeInTheDocument();
    expect(mocks.service.readPrompt).not.toHaveBeenCalled();
  });
  it('keeps provisional validation unverified despite a perfect quality score and shows saved provenance', async () => {
    const snapshotHash = `sha256:${'b'.repeat(64)}`;
    const artifactHash = `sha256:${'c'.repeat(64)}`;
    const validation = {
      schemaVersion: 1,
      id: 'saved-report',
      rubricVersion: 7,
      checkedAt: time,
      snapshotHash,
      artifactId: 'saved-artifact',
      artifactVersion: 'artifact-v3',
      artifactHash,
      checks: [
        {
          ruleId: 'saved-fact',
          category: 'fact',
          severity: 'hard',
          result: 'unknown',
          method: 'exact_text',
          evidenceIds: [],
          reasonCode: 'validation_unavailable',
        },
      ],
      quality: {
        score: 1,
        confidence: 1,
        evaluatorId: 'saved-evaluator',
        evaluatorVersion: 4,
        calibrationStatus: 'unverified',
      },
      diagnostics: [
        {
          code: 'validation_unavailable',
          severity: 'warning',
          message: 'Saved evaluator unavailable',
          evidenceIds: [],
        },
      ],
    };
    mocks.service.get.mockResolvedValueOnce({
      ...publicReceipt(),
      state: 'needs_review',
      mode: 'provisional_brand',
      compliance: 'unverified',
      resolutionHash: hash,
      snapshot: {
        schemaVersion: 1,
        organizationId: 'org',
        brandId: 'brand',
        revisionId: 'draft-revision',
        revisionVersion: 2,
        approval: 'provisional',
        resolvedAt: time,
        contentHash: snapshotHash,
        identity: { name: 'Acme' },
        voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
        generationRules: {
          schemaVersion: 1,
          evidence: [
            {
              id: 'saved-evidence',
              sourceType: 'manual',
              label: 'Owner attestation',
            },
          ],
          facts: [
            {
              id: 'saved-fact',
              kind: 'statement',
              subject: 'Product',
              predicate: 'is',
              value: 'Acme',
              required: true,
              match: 'literal',
              evidenceIds: ['saved-evidence'],
            },
          ],
          palette: [],
          typography: [],
          mandatory: [],
          avoid: [],
          examples: [],
          assets: [],
        },
        diagnostics: [],
      },
      learning: {
        schemaVersion: 1,
        brandFeedback: { status: 'not_applicable', sourceIds: [] },
        global: {
          status: 'not_applicable',
          scope: { format: 'text', objective: 'engagement' },
        },
        privateAccount: {
          mode: 'no_destination',
          configVersion: 'v1',
          synthetic: false,
          application: {
            status: 'unavailable',
            reasonCodes: ['no_destination'],
            privatePolicyApplied: false,
            sharedReleaseApplied: false,
            revalidatedAt: time,
          },
        },
      },
      prompts: {
        original: {
          contentHash: hash,
          retention: 'retained',
          snapshotId: 'original',
        },
        enhanced: null,
        compiled: {
          contentHash: hash,
          retention: 'retained',
          snapshotId: 'compiled',
        },
      },
      execution: {
        provider: 'provider',
        model: 'model',
        providerAttemptRef: 'attempt',
        dispatchClaimedAt: time,
        result: 'completed',
      },
      artifact: {
        kind: 'post',
        id: 'saved-artifact',
        version: 'artifact-v3',
        contentHash: artifactHash,
        mediaKind: 'text',
        parts: [],
      },
      validation,
      budget: { ...publicReceipt().budget, generationAttemptsUsed: 1 },
    });
    const view = render(<BrandedGenerationReceiptInspector {...input} />);
    await screen.findByText('needs_review · provisional_brand · unverified');
    expect(
      screen.getByText('saved-fact · fact · hard · unknown'),
    ).toBeInTheDocument();
    const savedDetails = Array.from(
      view.container.querySelectorAll('pre'),
    ).find((node) => node.textContent?.includes('saved-report'));
    expect(JSON.parse(savedDetails?.textContent ?? 'null')).toEqual({
      id: validation.id,
      rubricVersion: validation.rubricVersion,
      checkedAt: validation.checkedAt,
      snapshotHash,
      artifactId: validation.artifactId,
      artifactVersion: validation.artifactVersion,
      artifactHash,
      quality: validation.quality,
      diagnostics: validation.diagnostics,
    });
    expect(screen.queryByText('approved')).not.toBeInTheDocument();
    expect(mocks.service.readPrompt).not.toHaveBeenCalled();
  });
  it('reveals only on explicit action and renders saved text inertly with an accessible hide action', async () => {
    const view = render(<BrandedGenerationReceiptInspector {...input} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'showPrompt · original' }),
    );
    await waitFor(() =>
      expect(
        Array.from(view.container.querySelectorAll('pre')).find((node) =>
          node.textContent?.includes('onerror'),
        )?.textContent,
      ).toBe('<img src=x onerror=alert(1)> 🎨\r\n'),
    );
    expect(view.container.querySelector('img')).toBeNull();
    expect(mocks.service.readPrompt).toHaveBeenCalledExactlyOnceWith(
      'brand',
      'receipt',
      0,
      'original',
      expect.any(AbortSignal),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'hidePrompt · original' }),
    );
    expect(screen.queryByText(/onerror/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'showPrompt · original' }),
    ).toBeInTheDocument();
  });
  it('shows safe restricted error without creator identities or plaintext', async () => {
    mocks.service.readPrompt.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 403 },
      message: 'PRIVATE',
    });
    render(<BrandedGenerationReceiptInspector {...input} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'showPrompt · original' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('promptRestricted'),
    );
    expect(screen.queryByText(/PRIVATE/)).toBeNull();
  });
  describe('recorded identity snapshot', () => {
    function identitySnapshot(name: string, version: number, mark: string) {
      return {
        schemaVersion: 1,
        organizationId: 'org',
        brandId: 'brand',
        revisionId: `brand-revision-${version}`,
        revisionVersion: version,
        approval: 'approved',
        resolvedAt: time,
        contentHash: `sha256:${mark.repeat(64)}`,
        identity: { name },
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
    beforeEach(() => {
      mocks.service.getRevision.mockResolvedValue({
        ...publicReceipt(),
        id: 'receipt:1',
        receiptId: 'receipt',
        revision: 1,
        snapshot: identitySnapshot('Recorded A', 1, 'd'),
      });
      mocks.service.get.mockResolvedValue({
        ...publicReceipt(),
        revision: 2,
        snapshot: identitySnapshot('Current B', 2, 'e'),
      });
    });
    it('shows the exact loaded revision A and never replaces it with later approval B', async () => {
      const view = render(
        <BrandedGenerationReceiptInspector {...input} revision={1} />,
      );
      await screen.findByText('Recorded A');
      expect(
        screen.getByRole('region', { name: 'receiptTitle' }),
      ).toBeInTheDocument();
      expect(screen.getByText('recordedApproved')).toBeInTheDocument();
      expect(screen.queryByText('Current B')).not.toBeInTheDocument();
      expect(mocks.service.getRevision).toHaveBeenCalledExactlyOnceWith(
        'brand',
        'receipt',
        1,
        expect.any(AbortSignal),
      );
      view.rerender(<BrandedGenerationReceiptInspector {...input} />);
      await screen.findByText('Current B');
      expect(screen.queryByText('Recorded A')).not.toBeInTheDocument();
      view.rerender(
        <BrandedGenerationReceiptInspector {...input} revision={1} />,
      );
      await screen.findByText('Recorded A');
      expect(screen.queryByText('Current B')).not.toBeInTheDocument();
      expect(mocks.service.getIdentityPreview).not.toHaveBeenCalled();
      expect(mocks.service.readPrompt).not.toHaveBeenCalled();
    });
    it('shows unavailable instead of a snapshot recorded for another scope', async () => {
      mocks.service.get.mockResolvedValueOnce({
        ...publicReceipt(),
        organizationId: 'other-org',
        snapshot: {
          ...identitySnapshot('Foreign identity', 3, 'f'),
          organizationId: 'other-org',
        },
      });
      render(<BrandedGenerationReceiptInspector {...input} />);
      await screen.findByText(/created · raw · not_claimed/);
      expect(screen.queryByText('Foreign identity')).not.toBeInTheDocument();
      expect(screen.getByText('unavailable')).toBeInTheDocument();
      expect(mocks.service.getIdentityPreview).not.toHaveBeenCalled();
    });
  });
});
