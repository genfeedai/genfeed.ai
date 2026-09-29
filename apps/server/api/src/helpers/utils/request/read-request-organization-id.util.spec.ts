import { testId } from '@helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';
import { isUsableOrganizationId } from './read-request-organization-id.util';

// Low-entropy, same-shape stand-in for a legacy 24-char hex Mongo ObjectId —
// this exercises isUsableOrganizationId's LEGACY_OBJECT_ID_PATTERN branch,
// which specifically requires 24 hex chars (testId's cuid shape won't match).
const LEGACY_OBJECT_ID = '000000000000000000000001';
const ORGANIZATION_ID = testId('org');

describe('isUsableOrganizationId', () => {
  it('accepts cuid and legacy 24-hex ids', () => {
    expect(isUsableOrganizationId(ORGANIZATION_ID)).toBe(true);
    expect(isUsableOrganizationId(LEGACY_OBJECT_ID)).toBe(true);
  });

  it('rejects slugs and empty values', () => {
    expect(isUsableOrganizationId('default')).toBe(false);
    expect(isUsableOrganizationId('')).toBe(false);
    expect(isUsableOrganizationId(undefined)).toBe(false);
  });
});
