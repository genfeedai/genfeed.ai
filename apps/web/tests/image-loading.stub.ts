import { afterEach } from 'vitest';

/**
 * jsdom never loads images, so Radix Avatar (which shows its picture only
 * after a preload succeeds) would keep showing initials in every test. This
 * preloader reports a successful load for any URL, the way a browser does for
 * a reachable picture. A test that needs a picture to fail adds its URL to
 * `failingImageUrls`.
 */
export const failingImageUrls = new Set<string>();

class PreloadingImage extends EventTarget {
  complete = false;
  crossOrigin: string | null = null;
  referrerPolicy = '';

  set src(url: string) {
    queueMicrotask(() => {
      const isFailing = failingImageUrls.has(url);
      this.complete = !isFailing;
      this.dispatchEvent(new Event(isFailing ? 'error' : 'load'));
    });
  }
}

window.Image = PreloadingImage as unknown as typeof window.Image;

afterEach(() => {
  failingImageUrls.clear();
});
