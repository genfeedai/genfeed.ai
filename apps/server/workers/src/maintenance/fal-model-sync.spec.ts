import {
  assertFalApiKeyConfigured,
  parseFalModelSyncArgs,
} from '@workers/maintenance/fal-model-sync';

describe('Fal model sync maintenance command', () => {
  it('requires an explicit live invocation', () => {
    expect(parseFalModelSyncArgs(['--live'])).toEqual({ live: true });
    expect(() => parseFalModelSyncArgs([])).toThrow('explicitly with --live');
    expect(() => parseFalModelSyncArgs(['--dry-run'])).toThrow(
      'explicitly with --live',
    );
    expect(() => parseFalModelSyncArgs(['--live', '--all'])).toThrow(
      'explicitly with --live',
    );
  });

  it('requires the worker-owned Fal key without ever returning it', () => {
    expect(() => assertFalApiKeyConfigured(undefined)).toThrow(
      'FAL_API_KEY must be configured',
    );
    expect(() => assertFalApiKeyConfigured('')).toThrow(
      'FAL_API_KEY must be configured',
    );
    expect(assertFalApiKeyConfigured('secret-value')).toBeUndefined();
  });
});
