import { randomUUID } from 'node:crypto';
import {
  type CharacterOperation,
  characterJournalSchema,
  characterObservation,
  characterReceipt,
} from '@api/collections/content-runs/services/storyboard-character-replace-state';
import { STORYBOARD_CHARACTER_REPLACE_MODEL_KEY } from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import { describe, expect, it } from 'vitest';

function operation(): CharacterOperation {
  return {
    version: 1,
    operationId: randomUUID(),
    intentHash: 'intent',
    runId: 'run',
    organizationId: 'org',
    brandId: 'brand',
    shotId: 'shot',
    videoAssetId: 'video',
    imageAssetIds: ['image'],
    prompt: '',
    modelKey: STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
    sourceVersion: { id: 'video', updatedAt: '2026-10-01T00:00:00.000Z' },
    referenceVersions: [{ id: 'image', updatedAt: '2026-10-01T00:00:00.000Z' }],
    shotFingerprint: 'shot',
    sourceFingerprint: 'source',
    body: {
      video_url: 'https://fixture.invalid/video',
      image_urls: ['https://fixture.invalid/image'],
      prompt: '',
      resolution: '720p',
    },
    credentialFingerprint: 'private',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    state: 'submitting',
    receipts: [],
  };
}
describe('character journal boundary', () => {
  it('keeps all 128 entries, refuses overflow', () => {
    expect(
      characterJournalSchema.parse(Array.from({ length: 128 }, operation)),
    ).toHaveLength(128);
    expect(
      characterJournalSchema.safeParse(Array.from({ length: 129 }, operation))
        .success,
    ).toBe(false);
  });
  it('hides immutable request, credentials and lease from public receipts', () => {
    const receipt = characterReceipt(operation(), false);
    expect(receipt).not.toHaveProperty('body');
    expect(receipt).not.toHaveProperty('credentialFingerprint');
    expect(receipt).not.toHaveProperty('leaseUntil');
    expect(receipt).not.toHaveProperty('requestId');
  });
  it('retains every conflicting accepted id', () => {
    const first = characterObservation(operation(), 'first', 'queued');
    const second = characterObservation(first, 'second', 'queued');
    expect(second.receipts.map((r) => r.requestId)).toEqual([
      'first',
      'second',
    ]);
    expect(second.errorCode).toBe(
      'CHARACTER_REPLACEMENT_PROVIDER_IDEMPOTENCY_VIOLATION',
    );
  });
  it('completed without HTTPS output stays reconciling', () => {
    expect(
      characterObservation(operation(), 'first', 'completed', 'http://bad')
        .state,
    ).toBe('reconciling');
  });
  it('retains terminal outcome and observed URL through stale and incomplete observations', () => {
    const ready = characterObservation(
      operation(),
      'first',
      'completed',
      'https://fixture.invalid/out',
    );
    for (const status of ['queued', 'failed', 'completed']) {
      const next = characterObservation(ready, 'first', status);
      expect(next.state).toBe('ready');
      expect(next.receipts[0].outputUrl).toBe('https://fixture.invalid/out');
    }
  });
  it.each([undefined, 123, 'undocumented'])(
    'normalizes malformed provider status %s without losing the accepted handle',
    (status) => {
      const observed = characterObservation(
        operation(),
        'accepted',
        status,
        'https://fixture.invalid/unproven',
      );
      expect(observed.receipts).toEqual([
        { requestId: 'accepted', status: 'unknown' },
      ]);
      expect(observed.state).toBe('reconciling');
      expect(observed.errorCode).toBe(
        'CHARACTER_REPLACEMENT_PROVIDER_STATUS_UNKNOWN',
      );
      expect(characterReceipt(observed, true)).not.toHaveProperty('output');
    },
  );
});
