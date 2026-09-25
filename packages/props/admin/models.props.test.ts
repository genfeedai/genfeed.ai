import { describe, expect, it } from 'vitest';
import { ADMIN_MODEL_TYPE_TABS, resolveAdminModelType } from './models.props';

describe('admin model type tabs', () => {
  it('defaults to Active and keeps All last', () => {
    expect(ADMIN_MODEL_TYPE_TABS[0]?.value).toBe('active');
    expect(ADMIN_MODEL_TYPE_TABS.at(-1)?.value).toBe('all');
    expect(resolveAdminModelType()).toBe('active');
    expect(resolveAdminModelType('all')).toBe('all');
    expect(resolveAdminModelType('nope')).toBe('active');
  });
});
