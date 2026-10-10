import { describe, expect, it } from 'vitest';
import {
  getStudioAppForPath,
  STUDIO_APP_IDS,
  STUDIO_APP_MENU_ITEMS,
} from './studio-menu-items.config';

describe('Studio app menus (#5502)', () => {
  it('gives every Studio app its own nav without listing the others', () => {
    for (const appId of STUDIO_APP_IDS) {
      const items = STUDIO_APP_MENU_ITEMS[appId];
      expect(items).toHaveLength(1);
      expect(getStudioAppForPath(items[0].href ?? '')).toBe(appId);
      for (const matchPath of items[0].matchPaths ?? []) {
        expect(getStudioAppForPath(matchPath)).toBe(appId);
      }
    }
  });

  it('names apps with one word and runs Turbo on the Batch surface', () => {
    expect(
      STUDIO_APP_IDS.map((appId) => STUDIO_APP_MENU_ITEMS[appId][0].label),
    ).toEqual([
      'Playground',
      'Storyboard',
      'Turbo',
      'Motion',
      'Clips',
      'Editor',
    ]);
    expect(STUDIO_APP_MENU_ITEMS.turbo[0].href).toBe('/studio/batch');
    expect(STUDIO_APP_MENU_ITEMS.turbo[0].organizationModule).toBe('batch');
  });

  it('resolves nested Studio routes to their app and nothing else', () => {
    expect(getStudioAppForPath('/studio/clips/project-1')).toBe('clips');
    expect(getStudioAppForPath('/studio/editor/new')).toBe('editor');
    expect(getStudioAppForPath('/studio/batch/new')).toBe('turbo');
    expect(getStudioAppForPath('/studio/storyboard/run-1')).toBe('storyboard');
    expect(getStudioAppForPath('/studio')).toBeUndefined();
    expect(getStudioAppForPath('/studio/playgrounds')).toBeUndefined();
    expect(getStudioAppForPath('/library/assets')).toBeUndefined();
  });
});
