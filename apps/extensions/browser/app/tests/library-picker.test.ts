import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activate: vi.fn(async () => undefined),
  attach: vi.fn(),
}));

vi.mock('~platforms/composer-helpers', () => ({
  activateComposer: mocks.activate,
}));
vi.mock('~platforms/media-attach', () => ({
  attachMediaToComposer: mocks.attach,
}));

import { platforms } from '~platforms/config';
import { openLibraryPicker } from '~platforms/library-picker';
import { currentToastText } from '~platforms/ui/toast';

const REFERENCE = {
  brandId: 'brand-1',
  kind: 'ingredient',
  organizationId: 'org-1',
  recordId: 'asset-1',
  serializer: 'ingredient',
};
const ITEMS = [
  {
    id: 'asset-1',
    kind: 'image',
    reference: REFERENCE,
    thumbnail: 'data:image/png;base64,AA==',
    title: 'Launch card',
  },
  { id: 'asset-2', kind: 'video', reference: REFERENCE, title: 'Teaser' },
];

const send = vi.mocked(chrome.runtime.sendMessage);

function picker(): ShadowRoot {
  const host = document.getElementById('genfeed-library-picker');
  if (!host?.shadowRoot) throw new Error('No picker');
  return host.shadowRoot;
}

function respond(responses: Record<string, unknown>): void {
  send.mockImplementation(
    (async (message: { event: string }) => responses[message.event]) as never,
  );
}

async function open(): Promise<ShadowRoot> {
  openLibraryPicker(platforms.twitter, null);
  await vi.waitFor(() =>
    expect(picker().querySelectorAll('.tile').length).toBeGreaterThan(0),
  );
  return picker();
}

describe('openLibraryPicker', () => {
  beforeEach(() => {
    send.mockReset();
    mocks.attach.mockReset();
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it("lists the brand's images and videos", async () => {
    respond({ pageLibraryList: { items: ITEMS, success: true } });
    const root = await open();

    const tiles = Array.from(root.querySelectorAll('.tile'));
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'Attach image: Launch card',
      'Attach video: Teaser',
    ]);
    expect(tiles[0].querySelector('img')?.getAttribute('src')).toBe(
      ITEMS[0].thumbnail,
    );
  });

  it('attaches the picked asset to the reply box and posts nothing', async () => {
    respond({
      pageLibraryFile: {
        dataUrl: 'data:image/png;base64,AA==',
        filename: 'genfeed-library.png',
        success: true,
      },
      pageLibraryList: { items: ITEMS, success: true },
    });
    mocks.attach.mockResolvedValue('attached');
    const root = await open();

    (root.querySelector('.tile') as HTMLButtonElement).click();

    await vi.waitFor(() =>
      expect(document.getElementById('genfeed-library-picker')).toBeNull(),
    );
    expect(mocks.attach).toHaveBeenCalledWith(
      platforms.twitter,
      'data:image/png;base64,AA==',
      'genfeed-library.png',
    );
    expect(send).toHaveBeenCalledWith({
      event: 'pageLibraryFile',
      reference: REFERENCE,
    });
    expect(currentToastText()).toContain('Added the image to the reply box');
  });

  it('says so and offers to open the asset when the site cannot take it', async () => {
    respond({
      pageLibraryFile: {
        dataUrl: 'data:video/mp4;base64,AA==',
        filename: 'genfeed-library.mp4',
        success: true,
      },
      pageLibraryList: { items: ITEMS, success: true },
      pageLibraryOpen: { success: true },
    });
    mocks.attach.mockResolvedValue('unsupported');
    const root = await open();

    (root.querySelectorAll('.tile')[1] as HTMLButtonElement).click();
    await vi.waitFor(() => expect(root.querySelector('.open')).not.toBeNull());
    expect(root.querySelector('.note')?.textContent).toBe(
      "This site can't take the video here.",
    );

    (root.querySelector('.open') as HTMLButtonElement).click();
    expect(send).toHaveBeenLastCalledWith({
      event: 'pageLibraryOpen',
      reference: REFERENCE,
    });
  });

  it('explains an empty Library and a failed load', async () => {
    respond({ pageLibraryList: { items: [], success: true } });
    openLibraryPicker(platforms.twitter, null);
    await vi.waitFor(() =>
      expect(picker().querySelector('.note')?.textContent).toBe(
        "This brand's Library has no images or videos yet.",
      ),
    );

    respond({
      pageLibraryList: {
        error: 'Select a brand in Genfeed to use its Library.',
        success: false,
      },
    });
    openLibraryPicker(platforms.twitter, null);
    await vi.waitFor(() =>
      expect(picker().querySelector('.note')?.textContent).toBe(
        'Select a brand in Genfeed to use its Library.',
      ),
    );
  });

  it('closes on Escape', async () => {
    respond({ pageLibraryList: { items: ITEMS, success: true } });
    await open();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.getElementById('genfeed-library-picker')).toBeNull();
  });
});
