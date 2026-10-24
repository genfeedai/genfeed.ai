import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { platforms } from '~platforms/config';
import { attachMediaToComposer, dataUrlToFile } from '~platforms/media-attach';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('dataUrlToFile', () => {
  it('turns a data URL into a named file with its type', () => {
    const file = dataUrlToFile(PNG, 'test.png');

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('test.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBeGreaterThan(0);
  });
});

// jsdom has no DataTransfer and does not let a script assign `input.files`.
const originalFiles = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'files',
);

describe('attachMediaToComposer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.stubGlobal(
      'DataTransfer',
      class {
        files: File[] = [];
        items = {
          add: (file: File) => {
            this.files.push(file);
          },
        };
      },
    );
    const chosen = new WeakMap<HTMLInputElement, unknown>();
    Object.defineProperty(HTMLInputElement.prototype, 'files', {
      configurable: true,
      get(this: HTMLInputElement) {
        return chosen.get(this) ?? null;
      },
      set(this: HTMLInputElement, value: unknown) {
        chosen.set(this, value);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalFiles) {
      Object.defineProperty(HTMLInputElement.prototype, 'files', originalFiles);
    }
  });

  it('hands an image to the X file input and fires change', async () => {
    document.body.innerHTML =
      '<input type="file" data-testid="fileInput" accept="image/*">';
    const input = document.querySelector('input') as HTMLInputElement;
    let changed = false;
    input.addEventListener('change', () => {
      changed = true;
    });

    const outcome = await attachMediaToComposer(
      platforms.twitter,
      PNG,
      'genfeed-image.png',
    );

    expect(outcome).toBe('attached');
    expect(changed).toBe(true);
    expect(input.files?.[0]?.name).toBe('genfeed-image.png');
  });

  it('opens the media control first when the input does not exist yet', async () => {
    document.body.innerHTML =
      '<button aria-label="Add photos or video" id="open"></button>';
    document.getElementById('open')?.addEventListener('click', () => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<input type="file" data-testid="fileInput">',
      );
    });

    const outcome = await attachMediaToComposer(
      platforms.twitter,
      PNG,
      'genfeed-image.png',
    );

    expect(outcome).toBe('attached');
  });

  it('says so when the upload control cannot be found', async () => {
    await expect(
      attachMediaToComposer(platforms.twitter, PNG, 'genfeed-image.png'),
    ).resolves.toBe('failed');
  });

  it('does not attach video where the site takes images only', async () => {
    document.body.innerHTML = '<input type="file" accept="image/*">';

    await expect(
      attachMediaToComposer(platforms.linkedin, PNG, 'genfeed-video.mp4'),
    ).resolves.toBe('unsupported');
  });

  it('is unsupported on a site with no reply upload at all', async () => {
    await expect(
      attachMediaToComposer(platforms.youtube, PNG, 'genfeed-image.png'),
    ).resolves.toBe('unsupported');
    await expect(
      attachMediaToComposer(null, PNG, 'genfeed-image.png'),
    ).resolves.toBe('unsupported');
  });
});
