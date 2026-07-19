import {
  buildSystemWorkflowDuplicateMetadata,
  buildSystemWorkflowMetadata,
  buildSystemWorkflowUpgradeMetadata,
  getSystemWorkflowDuplicateMetadata,
  getSystemWorkflowMetadata,
  isProtectedSystemWorkflowMetadata,
} from '@api/collections/workflows/system-workflow.contract';
import { describe, expect, it, vi } from 'vitest';

describe('system workflow contract', () => {
  it('stores canonical template version and change summary', () => {
    const metadata = buildSystemWorkflowMetadata({
      canonicalId: 'scheduled-post-publishing',
      changeSummary: 'Route scheduled publishing through system workflows.',
      sourceIssue: 1029,
      version: 2,
    });

    expect(metadata).toMatchObject({
      canonicalId: 'scheduled-post-publishing',
      changeSummary: 'Route scheduled publishing through system workflows.',
      sourceIssue: 1029,
      version: 2,
    });
  });

  it('pins duplicate metadata to the source version without auto-upgrading it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));

    try {
      const metadata = buildSystemWorkflowDuplicateMetadata(
        {
          systemWorkflow: buildSystemWorkflowMetadata({
            canonicalId: 'reply-dm-automation',
            changeSummary: 'Initial reply and DM workflow wrapper.',
            sourceIssue: 1011,
            version: 3,
          }),
        },
        'workflow-source-1',
      );

      expect(metadata.systemWorkflow).toBeUndefined();
      expect(metadata.duplicatedFromSystemWorkflow).toMatchObject({
        canonicalId: 'reply-dm-automation',
        currentSystemWorkflowChangeSummary:
          'Initial reply and DM workflow wrapper.',
        currentSystemWorkflowVersion: 3,
        duplicatedAt: '2026-07-01T12:00:00.000Z',
        sourceWorkflowChangeSummary: 'Initial reply and DM workflow wrapper.',
        sourceWorkflowId: 'workflow-source-1',
        sourceWorkflowVersion: 3,
        upgradeEligible: false,
        upgradePolicy: 'manual',
        upgradeStatus: 'current',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks duplicates upgrade eligible when the canonical template advances', () => {
    const duplicate = getSystemWorkflowDuplicateMetadata({
      duplicatedFromSystemWorkflow: {
        canonicalId: 'scheduled-post-publishing',
        currentSystemWorkflowChangeSummary: 'Initial version.',
        currentSystemWorkflowVersion: 1,
        credentialPolicy: 'tenant-connected-account',
        duplicatedAt: '2026-07-01T12:00:00.000Z',
        productizationIssue: 1011,
        sourceWorkflowChangeSummary: 'Initial version.',
        sourceWorkflowId: 'workflow-source-1',
        sourceWorkflowVersion: 1,
        upgradeEligible: false,
        upgradePolicy: 'manual',
        upgradeStatus: 'current',
      },
    });

    expect(duplicate).not.toBeNull();
    if (!duplicate) {
      throw new Error('Expected valid duplicate system workflow metadata.');
    }

    const upgradeMetadata = buildSystemWorkflowUpgradeMetadata(
      duplicate,
      buildSystemWorkflowMetadata({
        canonicalId: 'scheduled-post-publishing',
        changeSummary: 'Add retry provenance.',
        version: 2,
      }),
    );

    expect(upgradeMetadata).toMatchObject({
      currentSystemWorkflowChangeSummary: 'Add retry provenance.',
      currentSystemWorkflowVersion: 2,
      sourceWorkflowVersion: 1,
      upgradeEligible: true,
      upgradeStatus: 'upgrade_available',
    });
  });

  it('normalizes legacy canonical and duplicate metadata', () => {
    const legacyCanonical = {
      systemWorkflow: {
        canonicalId: 'scheduled-post-publishing',
        immutable: true,
        kind: 'system-workflow',
        owner: 'genfeed',
      },
    };
    const legacyDuplicate = {
      duplicatedFromSystemWorkflow: {
        canonicalId: 'scheduled-post-publishing',
        sourceWorkflowId: 'workflow-source-1',
      },
    };

    expect(getSystemWorkflowMetadata(legacyCanonical)).toMatchObject({
      canonicalId: 'scheduled-post-publishing',
      version: 1,
    });
    expect(isProtectedSystemWorkflowMetadata(legacyCanonical)).toBe(true);
    expect(getSystemWorkflowDuplicateMetadata(legacyDuplicate)).toMatchObject({
      canonicalId: 'scheduled-post-publishing',
      sourceWorkflowId: 'workflow-source-1',
      sourceWorkflowVersion: 1,
      upgradeEligible: false,
    });
  });
});
