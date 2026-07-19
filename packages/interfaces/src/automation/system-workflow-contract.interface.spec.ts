import { describe, expect, it } from 'bun:test';
import {
  buildSystemWorkflowDuplicateMetadata,
  buildSystemWorkflowMetadata,
  buildSystemWorkflowUpgradeMetadata,
  getSystemWorkflowDuplicateMetadata,
  getSystemWorkflowMetadata,
  isProtectedSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
  SYSTEM_WORKFLOW_TEMPLATE_VERSION,
} from './system-workflow-contract.interface';

const canonicalMetadata = buildSystemWorkflowMetadata({
  canonicalId: 'scheduled-post-publishing',
  changeSummary: 'Current publishing template.',
  sourceIssue: 1029,
  version: 2,
});

const duplicateMetadata = getSystemWorkflowDuplicateMetadata(
  buildSystemWorkflowDuplicateMetadata(
    { systemWorkflow: canonicalMetadata },
    'workflow-source-1',
  ),
);

if (!duplicateMetadata) {
  throw new Error('Expected builder output to produce duplicate metadata.');
}

describe('system workflow metadata contract', () => {
  it('accepts current builder output', () => {
    expect(
      getSystemWorkflowMetadata({ systemWorkflow: canonicalMetadata }),
    ).toEqual(canonicalMetadata);
    expect(duplicateMetadata).not.toBeNull();
  });

  it('normalizes canonical metadata stored before template versioning', () => {
    const metadata = {
      canonicalId: 'scheduled-post-publishing',
      credentialPolicy: 'tenant-connected-account',
      duplicable: true,
      immutable: true,
      kind: 'system-workflow',
      owner: 'genfeed',
      productizationIssue: 1011,
      sourceIssue: 1029,
      visibility: 'organization',
    };

    expect(getSystemWorkflowMetadata({ systemWorkflow: metadata })).toEqual({
      ...metadata,
      changeSummary: SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
      version: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
    });
    expect(
      isProtectedSystemWorkflowMetadata({ systemWorkflow: metadata }),
    ).toBe(true);
  });

  it('normalizes legacy identity-only canonical metadata', () => {
    expect(
      getSystemWorkflowMetadata({
        systemWorkflow: {
          canonicalId: 'daily-trends-digest',
          immutable: true,
          kind: 'system-workflow',
          owner: 'genfeed',
        },
      }),
    ).toEqual(
      buildSystemWorkflowMetadata({
        canonicalId: 'daily-trends-digest',
      }),
    );
  });

  const invalidCanonicalCases: Array<[string, unknown]> = [
    ['a non-record value', 'system-workflow'],
    ['an empty canonicalId', { ...canonicalMetadata, canonicalId: '' }],
    ['a non-string changeSummary', { ...canonicalMetadata, changeSummary: 2 }],
    [
      'an unknown credentialPolicy',
      { ...canonicalMetadata, credentialPolicy: 'unknown' },
    ],
    ['a non-boolean duplicable flag', { ...canonicalMetadata, duplicable: 1 }],
    ['a mutable marker', { ...canonicalMetadata, immutable: false }],
    ['an unknown kind', { ...canonicalMetadata, kind: 'workflow' }],
    ['an unknown owner', { ...canonicalMetadata, owner: 'tenant' }],
    [
      'a different productization issue',
      { ...canonicalMetadata, productizationIssue: 999 },
    ],
    ['an invalid source issue', { ...canonicalMetadata, sourceIssue: 0 }],
    ['an invalid version', { ...canonicalMetadata, version: 0 }],
    ['an unknown visibility', { ...canonicalMetadata, visibility: 'private' }],
  ];

  for (const [label, systemWorkflow] of invalidCanonicalCases) {
    it(`rejects canonical metadata with ${label}`, () => {
      expect(getSystemWorkflowMetadata({ systemWorkflow })).toBeNull();
    });
  }

  it('normalizes duplicate metadata stored before upgrade tracking', () => {
    const legacyDuplicate = {
      canonicalId: 'scheduled-post-publishing',
      credentialPolicy: 'tenant-connected-account',
      duplicatedAt: '2026-07-01T12:00:00.000Z',
      productizationIssue: 1011,
      sourceIssue: 1029,
      sourceWorkflowId: 'workflow-source-1',
    };

    expect(
      getSystemWorkflowDuplicateMetadata({
        duplicatedFromSystemWorkflow: legacyDuplicate,
      }),
    ).toEqual({
      ...legacyDuplicate,
      currentSystemWorkflowChangeSummary:
        SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
      currentSystemWorkflowVersion: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
      sourceWorkflowChangeSummary: SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
      sourceWorkflowVersion: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
      upgradeEligible: false,
      upgradePolicy: 'manual',
      upgradeStatus: 'current',
    });
  });

  it('normalizes legacy identity-only duplicate metadata', () => {
    expect(
      getSystemWorkflowDuplicateMetadata({
        duplicatedFromSystemWorkflow: {
          canonicalId: 'daily-trends-digest',
          sourceWorkflowId: 'workflow-source-1',
        },
      }),
    ).toMatchObject({
      canonicalId: 'daily-trends-digest',
      sourceWorkflowId: 'workflow-source-1',
      sourceWorkflowVersion: SYSTEM_WORKFLOW_TEMPLATE_VERSION,
      upgradeEligible: false,
      upgradeStatus: 'current',
    });
  });

  const currentDuplicate = duplicateMetadata;
  const invalidDuplicateCases: Array<[string, unknown]> = [
    ['a non-record value', 'duplicate'],
    ['an empty canonicalId', { ...currentDuplicate, canonicalId: '' }],
    [
      'a non-string current change summary',
      { ...currentDuplicate, currentSystemWorkflowChangeSummary: 2 },
    ],
    [
      'an invalid current version',
      { ...currentDuplicate, currentSystemWorkflowVersion: 0 },
    ],
    [
      'an unknown credential policy',
      { ...currentDuplicate, credentialPolicy: 'unknown' },
    ],
    ['an invalid duplicatedAt', { ...currentDuplicate, duplicatedAt: 2 }],
    [
      'a different productization issue',
      { ...currentDuplicate, productizationIssue: 999 },
    ],
    ['an invalid source issue', { ...currentDuplicate, sourceIssue: 0 }],
    [
      'a non-string source change summary',
      { ...currentDuplicate, sourceWorkflowChangeSummary: 2 },
    ],
    [
      'an empty source workflow id',
      { ...currentDuplicate, sourceWorkflowId: '' },
    ],
    [
      'an invalid source version',
      { ...currentDuplicate, sourceWorkflowVersion: 0 },
    ],
    [
      'a non-boolean upgrade flag',
      { ...currentDuplicate, upgradeEligible: 'yes' },
    ],
    [
      'an unknown upgrade policy',
      { ...currentDuplicate, upgradePolicy: 'automatic' },
    ],
    [
      'an unknown upgrade status',
      { ...currentDuplicate, upgradeStatus: 'pending' },
    ],
  ];

  for (const [label, duplicatedFromSystemWorkflow] of invalidDuplicateCases) {
    it(`rejects duplicate metadata with ${label}`, () => {
      expect(
        getSystemWorkflowDuplicateMetadata({
          duplicatedFromSystemWorkflow,
        }),
      ).toBeNull();
    });
  }

  it('rejects upgrade metadata built from different canonical workflows', () => {
    expect(() =>
      buildSystemWorkflowUpgradeMetadata(
        currentDuplicate,
        buildSystemWorkflowMetadata({
          canonicalId: 'daily-trends-digest',
          version: 3,
        }),
      ),
    ).toThrow(
      'duplicate canonicalId "scheduled-post-publishing" does not match current canonicalId "daily-trends-digest"',
    );
  });
});
