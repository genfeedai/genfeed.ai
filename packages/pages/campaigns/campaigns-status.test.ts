import {
  ContentCampaignItemKind,
  ContentCampaignItemOutcomeStatus,
  ContentCampaignStatus,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  parseCampaignStatusFilter,
  summarizeCampaignLifecycleItems,
  toDateInputValue,
  visibleCampaignDeskActions,
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

  it('shows generate and start on a draft, pause on an active campaign', () => {
    expect(visibleCampaignDeskActions(ContentCampaignStatus.DRAFT)).toEqual({
      canArchive: true,
      canComplete: false,
      canGenerate: true,
      canPause: false,
      canRestore: false,
      canStart: true,
    });
    expect(visibleCampaignDeskActions(ContentCampaignStatus.ACTIVE)).toEqual({
      canArchive: true,
      canComplete: true,
      canGenerate: true,
      canPause: true,
      canRestore: false,
      canStart: false,
    });
    expect(visibleCampaignDeskActions(ContentCampaignStatus.ARCHIVED)).toEqual({
      canArchive: false,
      canComplete: false,
      canGenerate: false,
      canPause: false,
      canRestore: true,
      canStart: false,
    });
  });

  it('counts independent lifecycle item outcomes', () => {
    expect(
      summarizeCampaignLifecycleItems([
        {
          id: 'cpost00000001',
          kind: ContentCampaignItemKind.POST,
          retryable: false,
          status: ContentCampaignItemOutcomeStatus.SUCCEEDED,
        },
        {
          id: 'cpost00000002',
          kind: ContentCampaignItemKind.POST,
          retryable: true,
          status: ContentCampaignItemOutcomeStatus.INELIGIBLE,
        },
        {
          id: 'cpost00000003',
          kind: ContentCampaignItemKind.POST,
          retryable: true,
          status: ContentCampaignItemOutcomeStatus.FAILED,
        },
        {
          id: 'ccred00000001',
          kind: ContentCampaignItemKind.RELEASE,
          retryable: false,
          status: ContentCampaignItemOutcomeStatus.SKIPPED,
        },
      ]),
    ).toEqual({
      failed: 1,
      ineligible: 1,
      skipped: 1,
      succeeded: 1,
    });
  });
});
