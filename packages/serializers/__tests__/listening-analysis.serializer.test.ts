import {
  ListeningSignalSerializer,
  ListeningThemeSerializer,
} from '@serializers/server/social/listening-analysis.serializer';
import { describe, expect, it } from 'vitest';

type SerializedDocument = {
  data: {
    attributes: Record<string, unknown>;
    id: string;
  };
};

describe('listening analysis serializers', () => {
  it('exposes the complete evidence set and bounded theme window', () => {
    const output = ListeningThemeSerializer.serialize({
      brandId: 'brand-1',
      clusterKey: 'ai-agents',
      currentWindowEnd: '2026-08-26T12:00:00.000Z',
      currentWindowStart: '2026-08-25T12:00:00.000Z',
      evidenceIds: ['evidence-1', 'evidence-2'],
      id: 'theme-1',
      idempotencyKey: 'theme-key',
      label: 'ai agents',
      methodologyVersion: 'deterministic-keyword-v1',
      organizationId: 'org-1',
      reviewState: 'acknowledged',
      reviewedAt: '2026-08-26T12:30:00.000Z',
      reviewedBy: 'legacyBase62UserId',
      topicId: 'topic-1',
    }) as SerializedDocument;

    expect(output.data.attributes.evidenceIds).toEqual([
      'evidence-1',
      'evidence-2',
    ]);
    expect(output.data.attributes.currentWindowStart).toBe(
      '2026-08-25T12:00:00.000Z',
    );
    expect(output.data.attributes.currentWindowEnd).toBe(
      '2026-08-26T12:00:00.000Z',
    );
    expect(output.data.attributes.reviewState).toBe('acknowledged');
    expect(output.data.attributes.reviewedAt).toBe('2026-08-26T12:30:00.000Z');
    expect(output.data.attributes.reviewedBy).toBe('legacyBase62UserId');
  });

  it('preserves sufficient source coverage and the numeric value', () => {
    const output = ListeningSignalSerializer.serialize({
      brandId: 'brand-1',
      confidence: 0.75,
      currentWindowEnd: '2026-08-26T12:00:00.000Z',
      currentWindowStart: '2026-08-25T12:00:00.000Z',
      evidenceIds: ['evidence-1', 'evidence-2'],
      excludedSourceIds: ['source-2'],
      id: 'signal-1',
      idempotencyKey: 'signal-key',
      includedSourceIds: ['source-1'],
      methodologyVersion: 'deterministic-keyword-v1',
      organizationId: 'org-1',
      previousWindowEnd: '2026-08-25T12:00:00.000Z',
      previousWindowStart: '2026-08-24T12:00:00.000Z',
      signalType: 'change',
      status: 'sufficient',
      topicId: 'topic-1',
      value: 0.5,
    }) as SerializedDocument;

    expect(output.data.attributes.includedSourceIds).toEqual(['source-1']);
    expect(output.data.attributes.excludedSourceIds).toEqual(['source-2']);
    expect(output.data.attributes.value).toBe(0.5);
  });

  it('preserves an explicit insufficient result without a numeric value', () => {
    const output = ListeningSignalSerializer.serialize({
      confidence: 0,
      evidenceIds: [],
      excludedSourceIds: ['source-1'],
      id: 'signal-2',
      includedSourceIds: [],
      insufficiencyReason: 'stale_evidence',
      signalType: 'volume',
      status: 'insufficient_evidence',
      value: null,
    }) as SerializedDocument;

    expect(output.data.attributes.status).toBe('insufficient_evidence');
    expect(output.data.attributes.insufficiencyReason).toBe('stale_evidence');
    expect(output.data.attributes.value).toBeNull();
  });
});
