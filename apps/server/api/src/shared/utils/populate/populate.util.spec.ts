import {
  getPopulationLevel,
  PopulateBuilder,
  PopulatePatterns,
} from '@api/shared/utils/populate/populate.util';
import { describe, expect, it } from 'vitest';

describe('PopulateBuilder', () => {
  it('creates a path-only populate option', () => {
    expect(PopulateBuilder.create('asset')).toEqual({ path: 'asset' });
  });

  it('selects explicit fields', () => {
    expect(PopulateBuilder.withFields('brand', ['id', 'label'])).toEqual({
      path: 'brand',
      select: ['id', 'label'],
    });
  });

  it('treats idOnly and minimal as id-only selects', () => {
    expect(PopulateBuilder.idOnly('user')).toEqual({
      path: 'user',
      select: ['id'],
    });
    expect(PopulateBuilder.minimal('organization')).toEqual({
      path: 'organization',
      select: ['id'],
    });
  });
});

describe('PopulatePatterns', () => {
  it('exposes full and minimal variants for common relations', () => {
    expect(PopulatePatterns.assetFull).toEqual({ path: 'asset' });
    expect(PopulatePatterns.brandId).toEqual({
      path: 'brand',
      select: ['id'],
    });
    expect(PopulatePatterns.userMinimal.select).toEqual(
      expect.arrayContaining(['id', 'handle', 'email']),
    );
    expect(PopulatePatterns.postsMinimal.select).toEqual(
      expect.arrayContaining(['platform', 'status', 'externalId']),
    );
  });
});

describe('getPopulationLevel', () => {
  it('returns id-only, minimal, and full options', () => {
    expect(getPopulationLevel('brand', 'id')).toEqual({
      path: 'brand',
      select: ['id'],
    });
    expect(getPopulationLevel('brand', 'minimal')).toEqual({
      path: 'brand',
      select: ['id'],
    });
    expect(getPopulationLevel('brand', 'full')).toEqual({ path: 'brand' });
  });

  it('defaults to minimal when the level is omitted or unknown', () => {
    expect(getPopulationLevel('user')).toEqual({
      path: 'user',
      select: ['id'],
    });
    expect(getPopulationLevel('user', 'unknown' as 'minimal')).toEqual({
      path: 'user',
      select: ['id'],
    });
  });
});
