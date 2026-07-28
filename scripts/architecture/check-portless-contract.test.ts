import { describe, expect, it } from 'vitest';
import { checkPortlessContract } from './check-portless-contract';

describe('Portless local-development contract guard', () => {
  it('keeps Portless as the repository default with direct fallbacks', () => {
    expect(checkPortlessContract()).toEqual([]);
  });
});
