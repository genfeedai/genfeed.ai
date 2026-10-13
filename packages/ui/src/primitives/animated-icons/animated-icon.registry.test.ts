import { Bell, Settings, Sparkles, Trash2 } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import {
  ANIMATED_ICON_COUNT,
  ANIMATED_ICON_LOADERS,
  findAnimatedIcon,
} from './animated-icon.registry';

describe('animated icon registry', () => {
  it('maps a lucide icon to its animated twin and nothing else', () => {
    expect(findAnimatedIcon(Bell)).toBeDefined();
    expect(findAnimatedIcon(Sparkles)).toBeDefined();
    expect(findAnimatedIcon(Settings)).toBeDefined();
    expect(findAnimatedIcon(Trash2)).toBeUndefined();
    expect(findAnimatedIcon(() => null)).toBeUndefined();
    expect(findAnimatedIcon(undefined)).toBeUndefined();
  });

  it('treats lucide aliases as the same icon', async () => {
    const { Home, House, CircleHelp, CircleQuestionMark } = await import(
      'lucide-react'
    );

    expect(findAnimatedIcon(Home)).toBe(findAnimatedIcon(House));
    expect(findAnimatedIcon(CircleHelp)).toBe(
      findAnimatedIcon(CircleQuestionMark),
    );
    expect(findAnimatedIcon(House)).toBeDefined();
  });

  it('registers one animated icon per copied component', async () => {
    const files = Object.keys(
      import.meta.glob('./icons/*.tsx', { eager: false }),
    );

    expect(files).toHaveLength(ANIMATED_ICON_COUNT);
  });

  it('loads every animated icon into a renderable component', async () => {
    const loaders = import.meta.glob('./icons/*.tsx');
    const modules = await Promise.all(
      Object.values(loaders).map((load) => load()),
    );

    for (const module of modules) {
      const exported = Object.values(module as Record<string, unknown>);
      // forwardRef components are objects, so check for a render function.
      expect(
        exported.some(
          (value) =>
            typeof value === 'object' &&
            value !== null &&
            '$$typeof' in value &&
            'render' in value,
        ),
      ).toBe(true);
    }
  });

  it('resolves every registry entry to the component its file exports', async () => {
    for (const [, load] of ANIMATED_ICON_LOADERS) {
      const { default: component } = await load();

      expect(component).toBeDefined();
    }
  });
});
