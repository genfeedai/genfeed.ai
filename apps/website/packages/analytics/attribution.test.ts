import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetAttributionForwardingForTests,
  initAttributionForwarding,
  readAttributionParams,
  withAttributionParams,
} from './attribution';

const APP_ORIGIN = 'https://app.genfeed.ai';

function setLocation(pathAndSearch: string): void {
  window.history.replaceState({}, '', pathAndSearch);
}

function mountAnchor(href: string): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.setAttribute('href', href);
  anchor.textContent = 'Get Started';
  document.body.appendChild(anchor);
  return anchor;
}

function activate(anchor: HTMLAnchorElement, type: 'click' | 'pointerdown') {
  anchor.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
}

describe('readAttributionParams', () => {
  it('keeps only allowlisted keys with slug-safe values', () => {
    const params = readAttributionParams(
      '?utm_source=x&utm_medium=social&utm_campaign=launch-2026&ref=ABCDEF23JKMN&plan=pro&fbclid=abc',
    );

    expect(Object.fromEntries(params)).toEqual({
      ref: 'ABCDEF23JKMN',
      utm_campaign: 'launch-2026',
      utm_medium: 'social',
      utm_source: 'x',
    });
  });

  it('drops values that are empty, too long, or outside the slug charset', () => {
    const tooLong = 'a'.repeat(101);
    const params = readAttributionParams(
      `?utm_source=&utm_medium=${tooLong}&utm_campaign=hello%20world&utm_content=<script>&utm_term=ok_term`,
    );

    expect(Object.fromEntries(params)).toEqual({ utm_term: 'ok_term' });
  });
});

describe('withAttributionParams', () => {
  const attribution = new URLSearchParams({
    utm_medium: 'social',
    utm_source: 'x',
  });

  it('appends attribution to links on the app origin', () => {
    expect(
      withAttributionParams(
        `${APP_ORIGIN}/sign-up?plan=pro`,
        attribution,
        APP_ORIGIN,
      ),
    ).toBe(`${APP_ORIGIN}/sign-up?plan=pro&utm_medium=social&utm_source=x`);
  });

  it('never overwrites a parameter the link already carries', () => {
    expect(
      withAttributionParams(
        `${APP_ORIGIN}/sign-up?utm_source=pricing-page`,
        attribution,
        APP_ORIGIN,
      ),
    ).toBe(`${APP_ORIGIN}/sign-up?utm_source=pricing-page&utm_medium=social`);
  });

  it('leaves links to other origins, relative links, and empty attribution untouched', () => {
    expect(
      withAttributionParams(
        'https://calendly.com/vincent-genfeed/30min',
        attribution,
        APP_ORIGIN,
      ),
    ).toBe('https://calendly.com/vincent-genfeed/30min');
    expect(withAttributionParams('/pricing', attribution, APP_ORIGIN)).toBe(
      '/pricing',
    );
    expect(
      withAttributionParams(
        `${APP_ORIGIN}/sign-up`,
        new URLSearchParams(),
        APP_ORIGIN,
      ),
    ).toBe(`${APP_ORIGIN}/sign-up`);
  });
});

describe('initAttributionForwarding', () => {
  afterEach(() => {
    __resetAttributionForwardingForTests();
    document.body.innerHTML = '';
    setLocation('/');
  });

  it('rewrites an app link on click with the landing page attribution', () => {
    setLocation('/pricing?utm_source=hn&utm_campaign=show-hn&plan=ignored');
    initAttributionForwarding(APP_ORIGIN);
    const anchor = mountAnchor(`${APP_ORIGIN}/sign-up?plan=pro`);

    activate(anchor, 'click');

    expect(anchor.getAttribute('href')).toBe(
      `${APP_ORIGIN}/sign-up?plan=pro&utm_source=hn&utm_campaign=show-hn`,
    );
  });

  it('rewrites on pointerdown so middle-click and touch navigations carry attribution', () => {
    setLocation('/?ref=ABCDEF23JKMN');
    initAttributionForwarding(APP_ORIGIN);
    const anchor = mountAnchor(`${APP_ORIGIN}/sign-up`);

    activate(anchor, 'pointerdown');

    expect(anchor.getAttribute('href')).toBe(
      `${APP_ORIGIN}/sign-up?ref=ABCDEF23JKMN`,
    );
  });

  it('keeps the landing attribution alive across client-side navigation', () => {
    setLocation('/?utm_source=newsletter');
    initAttributionForwarding(APP_ORIGIN);
    setLocation('/pricing');
    const anchor = mountAnchor(`${APP_ORIGIN}/sign-up?plan=pro`);

    activate(anchor, 'click');

    expect(anchor.getAttribute('href')).toBe(
      `${APP_ORIGIN}/sign-up?plan=pro&utm_source=newsletter`,
    );
  });

  it('prefers parameters on the current URL over the landing page', () => {
    setLocation('/?utm_source=newsletter');
    initAttributionForwarding(APP_ORIGIN);
    setLocation('/pricing?utm_source=x');
    const anchor = mountAnchor(`${APP_ORIGIN}/sign-up`);

    activate(anchor, 'click');

    expect(anchor.getAttribute('href')).toBe(
      `${APP_ORIGIN}/sign-up?utm_source=x`,
    );
  });

  it('ignores links that do not point at the app and clicks outside anchors', () => {
    setLocation('/?utm_source=x');
    initAttributionForwarding(APP_ORIGIN);
    const calendly = mountAnchor('https://calendly.com/vincent-genfeed/30min');
    const internal = mountAnchor('/pricing');
    const button = document.createElement('button');
    document.body.appendChild(button);

    activate(calendly, 'click');
    activate(internal, 'click');
    button.dispatchEvent(new Event('click', { bubbles: true }));

    expect(calendly.getAttribute('href')).toBe(
      'https://calendly.com/vincent-genfeed/30min',
    );
    expect(internal.getAttribute('href')).toBe('/pricing');
  });

  it('does nothing when the visitor arrived without attribution', () => {
    setLocation('/pricing');
    initAttributionForwarding(APP_ORIGIN);
    const anchor = mountAnchor(`${APP_ORIGIN}/sign-up?plan=pro`);

    activate(anchor, 'click');

    expect(anchor.getAttribute('href')).toBe(`${APP_ORIGIN}/sign-up?plan=pro`);
  });
});
