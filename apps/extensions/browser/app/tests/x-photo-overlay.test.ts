import { beforeEach, describe, expect, it } from 'vitest';

import {
  findPhotoOverlayHost,
  X_PHOTO_IMAGE_SELECTOR,
} from '~platforms/x-photo-overlay';

function post(inner: string): void {
  document.body.innerHTML = `<article data-testid="tweet">${inner}</article>`;
}

describe('X photo overlay targets', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('selects the photos in a post and not avatars or emoji', () => {
    post(`
      <div data-testid="Tweet-User-Avatar"><img id="avatar" src="https://pbs.twimg.com/profile_images/1.jpg"></div>
      <img id="emoji" src="https://abs-0.twimg.com/emoji/v2/svg/1f600.svg">
      <div data-testid="tweetPhoto"><img id="photo" src="https://pbs.twimg.com/media/a.jpg"></div>`);

    const found = Array.from(
      document.querySelectorAll(X_PHOTO_IMAGE_SELECTOR),
    ).map((image) => image.id);

    expect(found).toEqual(['photo']);
  });

  it("uses X's own photo frame when X positions it", () => {
    post(`<div data-testid="tweetPhoto" style="position: relative">
      <img id="photo" src="https://pbs.twimg.com/media/a.jpg"></div>`);
    const image = document.getElementById('photo') as HTMLImageElement;

    expect(findPhotoOverlayHost(image)).toBe(
      document.querySelector('[data-testid="tweetPhoto"]'),
    );
  });

  it('leaves a frame alone that X does not position', () => {
    post(`<div data-testid="tweetPhoto">
      <img id="photo" src="https://pbs.twimg.com/media/a.jpg"></div>`);
    const frame = document.querySelector<HTMLElement>(
      '[data-testid="tweetPhoto"]',
    );
    const image = document.getElementById('photo') as HTMLImageElement;

    expect(findPhotoOverlayHost(image)).toBeNull();
    expect(frame?.style.position).toBe('');
  });
});
