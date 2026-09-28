import { describe, expect, it } from 'vitest';
import { CORE_APPS } from './core-apps';

describe('CORE_APPS', () => {
  it('exposes exactly Agent, Automation, and Studio', () => {
    expect(CORE_APPS.map((app) => app.id)).toEqual([
      'agent',
      'automation',
      'studio',
    ]);
  });

  it('has no standalone editor app — editing lives inside Studio', () => {
    expect(CORE_APPS.some((app) => app.href.startsWith('/editor'))).toBe(false);
  });

  it('opens Studio on the Generate surface', () => {
    expect(CORE_APPS.find((app) => app.id === 'studio')).toMatchObject({
      href: '/studio/generate',
    });
  });
});
