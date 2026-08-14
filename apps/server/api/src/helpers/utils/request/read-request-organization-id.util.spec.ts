import { describe, expect, it } from 'vitest';
import {
  isUsableOrganizationId,
  readRequestOrganizationId,
} from './read-request-organization-id.util';

describe('isUsableOrganizationId', () => {
  it('accepts cuid and legacy 24-hex ids', () => {
    expect(isUsableOrganizationId('cmptu23g70001zixnzwbzwp2e')).toBe(true);
    expect(isUsableOrganizationId('507f191e810c19729de860ee')).toBe(true);
  });

  it('rejects slugs and empty values', () => {
    expect(isUsableOrganizationId('default')).toBe(false);
    expect(isUsableOrganizationId('')).toBe(false);
    expect(isUsableOrganizationId(undefined)).toBe(false);
  });
});

describe('readRequestOrganizationId', () => {
  it('prefers a usable request.context organization id', () => {
    expect(
      readRequestOrganizationId({
        context: { organizationId: 'cmptu23g70001zixnzwbzwp2e' },
        user: {
          publicMetadata: { organization: '507f191e810c19729de860ee' },
        },
      }),
    ).toBe('cmptu23g70001zixnzwbzwp2e');
  });

  it('falls back to the session organization when context is missing', () => {
    expect(
      readRequestOrganizationId({
        user: {
          publicMetadata: { organization: 'cmptu23g70001zixnzwbzwp2e' },
        },
      }),
    ).toBe('cmptu23g70001zixnzwbzwp2e');
  });

  it('skips a URL slug in context and uses the session cuid', () => {
    expect(
      readRequestOrganizationId({
        context: { organizationId: 'default' },
        user: {
          publicMetadata: { organization: 'cmptu23g70001zixnzwbzwp2e' },
        },
      }),
    ).toBe('cmptu23g70001zixnzwbzwp2e');
  });

  it('returns undefined when neither source is a usable organization id', () => {
    expect(
      readRequestOrganizationId({
        context: { organizationId: 'default' },
        user: { publicMetadata: { organization: 'default' } },
      }),
    ).toBeUndefined();
  });
});
