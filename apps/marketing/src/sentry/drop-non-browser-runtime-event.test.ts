import { describe, expect, it } from 'vitest';
import { dropNonBrowserRuntimeEvent } from './drop-non-browser-runtime-event';

function eventWithFrames(filenames: string[]) {
  return {
    exception: {
      values: [
        {
          stacktrace: {
            frames: filenames.map((filename) => ({ filename })),
          },
        },
      ],
    },
  };
}

describe('dropNonBrowserRuntimeEvent', () => {
  it('drops an error raised inside a Deno-core crawler runtime', () => {
    const event = eventWithFrames([
      'ext:core/01_core.js',
      '<obscura:bootstrap>',
      '<script>',
    ]);

    expect(dropNonBrowserRuntimeEvent(event)).toBeNull();
  });

  it('keeps an error from the site bundle', () => {
    const event = eventWithFrames([
      'app:///_next/static/chunks/main.js',
      'app:///_next/static/chunks/page.js',
    ]);

    expect(dropNonBrowserRuntimeEvent(event)).toBe(event);
  });

  it('keeps events without a stack trace', () => {
    const event = { message: 'Hydration Error' };

    expect(dropNonBrowserRuntimeEvent(event)).toBe(event);
  });
});
