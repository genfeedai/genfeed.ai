import { projectProvisionalBrandIdentitySnapshot } from '@api/services/branded-generation-receipts/brand-identity-snapshot-projection.util';
import { projectBrandSnapshotContributions } from '@api/services/harness/branded-generation-compiler';
import { buildGenfeedDefaultKitDraft } from '@genfeedai/helpers';
import { BrandOsRevisionStatus, toPrismaJson } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const time = new Date('2026-10-02T00:00:00.000Z');

function provisionalSnapshot() {
  const content = {
    ...buildGenfeedDefaultKitDraft({
      id: 'brand',
      label: 'Acme',
      organization: 'org',
    }),
    brandId: 'brand',
    organizationId: 'org',
  };
  return projectProvisionalBrandIdentitySnapshot(
    {
      approvedAt: null,
      approvedById: null,
      brandId: 'brand',
      content: z.json().parse(toPrismaJson(content)),
      createdAt: time,
      exportSchemaVersion: '1',
      generationRulesReviewHash: null,
      id: 'draft-1',
      isDeleted: false,
      organizationId: 'org',
      sourcePreviewTokenHash: null,
      status: BrandOsRevisionStatus.DRAFT,
      updatedAt: time,
      version: 1,
    },
    time.toISOString(),
  );
}

describe('provisional snapshot compilation', () => {
  it('never labels an unapproved draft voice as approved', () => {
    const [required] = projectBrandSnapshotContributions(provisionalSnapshot());
    const headers = required.map((section) => section.header);
    expect(headers).toContain(
      '## Brand Voice (provisional, awaiting owner review)',
    );
    expect(headers).not.toContain('## Approved Brand Voice');
  });

  it('keeps the approved wording for approved identities', () => {
    const approved = {
      ...provisionalSnapshot(),
      approval: 'approved' as const,
    };
    const [required] = projectBrandSnapshotContributions(approved);
    expect(required.map((section) => section.header)).toContain(
      '## Approved Brand Voice',
    );
  });
});
