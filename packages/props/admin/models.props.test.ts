import { describe, expect, it } from 'vitest';
import {
  ADMIN_MODEL_TYPE_TABS,
  resolveAdminModelFilters,
  resolveAdminModelType,
} from './models.props';

describe('admin model type tabs', () => {
  it('defaults to Active and keeps All last', () => {
    expect(ADMIN_MODEL_TYPE_TABS[0]?.value).toBe('active');
    expect(ADMIN_MODEL_TYPE_TABS.at(-1)?.value).toBe('all');
    expect(resolveAdminModelType()).toBe('active');
    expect(resolveAdminModelType('all')).toBe('all');
    expect(resolveAdminModelType('nope')).toBe('active');
  });
});

describe('admin catalog filters', () => {
  it('keeps categories, providers and status independent and rejects unknown values', () => {
    expect(
      resolveAdminModelFilters(
        new URLSearchParams(
          'category=image&category=video&category=invalid&provider=replicate&provider=fal&provider=invalid&status=inactive',
        ),
      ),
    ).toEqual({
      categories: ['image', 'video'],
      providers: ['replicate', 'fal'],
      statuses: ['inactive'],
    });
  });
  it('preserves the supported categories of legacy Other links', () => {
    expect(
      resolveAdminModelFilters(new URLSearchParams(), 'other').categories,
    ).toEqual([
      'text',
      'image-edit',
      'video-edit',
      'image-upscale',
      'video-upscale',
      'voice',
    ]);
  });
  it('preserves legacy links and supports clearing the Active default', () => {
    expect(
      resolveAdminModelFilters(new URLSearchParams(), 'active').statuses,
    ).toEqual(['active']);
    expect(
      resolveAdminModelFilters(new URLSearchParams('status=all'), 'active')
        .statuses,
    ).toEqual([]);
    expect(
      resolveAdminModelFilters(new URLSearchParams(), 'image').categories,
    ).toEqual(['image']);
  });
});
