import { describe, expect, it } from 'vitest';
import {
  classifyRetiredContent,
  parseRetirementArgs,
  type RetiredContentRow,
} from './retire-content-drafts';

function row(overrides: Partial<RetiredContentRow> = {}): RetiredContentRow {
  return {
    approvedById: null,
    approvedVersionPinId: null,
    brandId: 'brand-1',
    brandIsDeleted: false,
    brandOrganizationId: 'org-1',
    brandUserId: 'user-1',
    confidence: 0.9,
    content: 'Reviewable content',
    contentRunId: null,
    contentRunValid: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    generatedBy: 'content-writing',
    id: 'legacy-1',
    isDeleted: false,
    mediaUrls: [],
    metadata: {},
    migratedPostId: null,
    organizationId: 'org-1',
    ownerUserId: 'user-1',
    platforms: [],
    representedPostId: null,
    reviewActorUserId: 'user-1',
    skillSlug: 'content-writing',
    status: 'READY',
    type: 'text',
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  };
}

describe('retired content classification', () => {
  it.each(['DRAFT', 'READY', 'APPROVED', 'REJECTED'])(
    'classifies %s with complete ownership as convertible',
    (status) => {
      expect(classifyRetiredContent(row({ status }))).toEqual({
        disposition: 'convertible',
      });
    },
  );

  it('reuses the canonical target recorded by a published row', () => {
    expect(
      classifyRetiredContent(
        row({ representedPostId: 'post-1', status: 'PUBLISHED' }),
      ),
    ).toEqual({
      disposition: 'already_migrated',
      targetPostId: 'post-1',
    });
  });

  it('classifies an idempotently migrated row as already migrated', () => {
    expect(
      classifyRetiredContent(row({ migratedPostId: 'post-migrated' })),
    ).toEqual({
      disposition: 'already_migrated',
      targetPostId: 'post-migrated',
    });
  });

  it('retains soft-deleted rows for explicit operator disposition', () => {
    expect(classifyRetiredContent(row({ isDeleted: true }))).toEqual({
      disposition: 'retained_deleted',
    });
  });

  it('fails closed when a published row has no canonical target', () => {
    expect(classifyRetiredContent(row({ status: 'PUBLISHED' }))).toEqual({
      disposition: 'blocked_published_without_target',
    });
  });

  it.each([
    [{ brandId: null }, 'blocked_missing_brand'],
    [{ brandIsDeleted: true }, 'blocked_missing_brand'],
    [{ brandOrganizationId: 'other-org' }, 'blocked_tenant_mismatch'],
    [{ ownerUserId: null }, 'blocked_missing_owner'],
    [
      { reviewActorUserId: null, status: 'APPROVED' },
      'blocked_missing_reviewer',
    ],
    [{ contentRunValid: false }, 'blocked_invalid_content_run'],
    [{ content: null }, 'blocked_missing_content'],
    [{ content: '   ' }, 'blocked_missing_content'],
    [{ status: 'UNKNOWN' }, 'blocked_unknown_status'],
  ] as const)(
    'reports ambiguous ownership without deleting it',
    (input, expected) => {
      expect(classifyRetiredContent(row(input))).toEqual({
        disposition: expected,
      });
    },
  );

  it('defaults to dry-run with bounded batch overrides', () => {
    expect(parseRetirementArgs([])).toEqual({ batchSize: 100, dryRun: true });
    expect(parseRetirementArgs(['--batch=25', '--live'])).toEqual({
      batchSize: 25,
      dryRun: false,
    });
  });
});
