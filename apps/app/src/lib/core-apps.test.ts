import { describe, expect, it } from 'vitest';
import { CORE_APPS } from './core-apps';

describe('CORE_APPS', () => {
  it('opens Studio on the Generate surface', () => {
    expect(CORE_APPS.find((app) => app.id === 'studio')).toMatchObject({
      href: '/studio/generate',
    });
  });
});
