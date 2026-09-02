import { ContentCampaignStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  parseCampaignStatusFilter,
  toDateInputValue,
} from './campaigns-status';

describe('campaigns-status', () => {
  it('parses product campaign statuses and rejects unknown filters', () => {
    expect(parseCampaignStatusFilter(ContentCampaignStatus.ACTIVE)).toBe(
      ContentCampaignStatus.ACTIVE,
    );
    expect(parseCampaignStatusFilter('all')).toBeUndefined();
    expect(parseCampaignStatusFilter('pending')).toBeUndefined();
  });

  it('narrows ISO timestamps to date-input values', () => {
    expect(toDateInputValue('2026-09-15T00:00:00.000Z')).toBe('2026-09-15');
    expect(toDateInputValue(null)).toBe('');
  });
});
