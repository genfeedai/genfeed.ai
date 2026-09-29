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

  it('keeps null runs out of hydrated run lists', () => {
    expect(hydrateContentRun(null)).toBeNull();
    expect(hydrateContentRuns([{ config: {}, id: 'run-1' }])).toHaveLength(1);
  });

  it('serializes undefined as a Prisma JSON null value', () => {
    expect(toContentRunJsonValue(undefined)).toBeNull();
  });
});
