import { resolvePredictionTarget } from '@api/services/integrations/replicate/helpers/replicate-prediction-target.util';
import { describe, expect, it } from 'vitest';

describe('shared Replicate prediction target', () => {
  it('keeps a named endpoint distinct from an immutable version', () => {
    expect(resolvePredictionTarget('owner/model')).toEqual({
      model: 'owner/model',
    });
    expect(resolvePredictionTarget('immutable-version')).toEqual({
      version: 'immutable-version',
    });
  });
  it('uses the explicit version in an owner/model:version key', () => {
    expect(resolvePredictionTarget('owner/model:immutable-version')).toEqual({
      version: 'immutable-version',
    });
  });
  it('preserves the existing named-target treatment of an empty version suffix', () => {
    expect(resolvePredictionTarget('owner/model:')).toEqual({
      model: 'owner/model:',
    });
  });
  it('encodes target kind without a model/version collision in a frozen string', () => {
    expect(JSON.stringify(resolvePredictionTarget('owner/model'))).not.toBe(
      JSON.stringify(resolvePredictionTarget('key:owner/model')),
    );
  });
});
