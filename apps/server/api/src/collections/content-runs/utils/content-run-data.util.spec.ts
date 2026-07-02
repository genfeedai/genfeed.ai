import { describe, expect, it } from 'vitest';

import {
  hydrateContentRun,
  hydrateContentRuns,
  isContentRunRecord,
  toContentRunJsonValue,
} from './content-run-data.util';

describe('content-run-data.util', () => {
  it('detects plain content-run records', () => {
    expect(isContentRunRecord({ id: 'run-1' })).toBe(true);
    expect(isContentRunRecord(null)).toBe(false);
    expect(isContentRunRecord(['run-1'])).toBe(false);
  });

  it('hydrates stored config while preserving row field precedence', () => {
    expect(
      hydrateContentRun({
        brandId: 'brand-row',
        config: {
          brand: 'brand-config',
          organization: 'org-config',
          source: 'hosted',
          status: 'config-status',
        },
        id: 'run-1',
        organizationId: 'org-row',
        status: 'row-status',
      }),
    ).toEqual({
      _id: 'run-1',
      brand: 'brand-row',
      brandId: 'brand-row',
      config: {
        brand: 'brand-config',
        organization: 'org-config',
        source: 'hosted',
        status: 'config-status',
      },
      id: 'run-1',
      organization: 'org-row',
      organizationId: 'org-row',
      source: 'hosted',
      status: 'row-status',
    });
  });

  it('hydrates config fallback fields when row fields are missing', () => {
    expect(
      hydrateContentRun({
        config: {
          brand: 'brand-config',
          organization: 'org-config',
          status: 'config-status',
        },
        id: 'run-2',
      }),
    ).toMatchObject({
      _id: 'run-2',
      brand: 'brand-config',
      organization: 'org-config',
      status: 'config-status',
    });
  });

  it('keeps null runs out of hydrated run lists', () => {
    expect(hydrateContentRun(null)).toBeNull();
    expect(hydrateContentRuns([{ config: {}, id: 'run-1' }])).toHaveLength(1);
  });

  it('serializes undefined as a Prisma JSON null value', () => {
    expect(toContentRunJsonValue(undefined)).toBeNull();
  });
});
