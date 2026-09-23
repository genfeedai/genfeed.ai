// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSignupAttributionForTests,
  captureSignupFirstTouch,
  decorateSignupLink,
  initSignupAttribution,
} from './signup-attribution';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { app: 'https://app.genfeed.ai' } },
}));

const APP_ORIGIN = 'https://app.genfeed.ai';

function anchor(href: string): HTMLAnchorElement {
  const element = document.createElement('a');
  element.href = href;
  return element;
}

describe('captureSignupFirstTouch', () => {
  it('records UTM tags, the external referrer and the landing path', () => {
    expect(
      captureSignupFirstTouch(
        {
          hostname: 'genfeed.ai',
          pathname: '/use-cases/creators',
          search: '?utm_source=Newsletter&utm_term=private',
        },
        'https://www.google.com/',
      ),
    ).toEqual({
      landingPath: '/use-cases/creators',
      referrerDomain: 'google.com',
      utmSource: 'newsletter',
    });
  });

  it('ignores an internal referrer', () => {
    expect(
      captureSignupFirstTouch(
        { hostname: 'genfeed.ai', pathname: '/pricing', search: '' },
        'https://genfeed.ai/',
      ),
    ).toEqual({ landingPath: '/pricing' });
  });

  it('keeps a referral code off the attribution record', () => {
    expect(
      captureSignupFirstTouch(
        {
          hostname: 'genfeed.ai',
          pathname: '/',
          search: '?ref=ABCDEF23JKMN',
        },
        '',
      ),
    ).toEqual({ landingPath: '/' });
  });
});

describe('decorateSignupLink', () => {
  it('adds attribution to an app sign-up link and keeps its own params', () => {
    const link = anchor(`${APP_ORIGIN}/sign-up?plan=payg&utm_source=ads`);

    decorateSignupLink(
      link,
      { referrerDomain: 'chatgpt.com', utmSource: 'chatgpt' },
      APP_ORIGIN,
    );

    const url = new URL(link.href);
    expect(url.searchParams.get('plan')).toBe('payg');
    expect(url.searchParams.get('utm_source')).toBe('ads');
    expect(url.searchParams.get('signup_referrer')).toBe('chatgpt.com');
  });

  it('leaves login, other-app and marketing links untouched', () => {
    for (const href of [
      `${APP_ORIGIN}/login`,
      'https://genfeed.ai/sign-up',
      'https://docs.genfeed.ai/',
    ]) {
      const link = anchor(href);
      decorateSignupLink(link, { referrerDomain: 'chatgpt.com' }, APP_ORIGIN);
      expect(link.href).toBe(new URL(href).toString());
    }
  });
});

describe('initSignupAttribution', () => {
  afterEach(() => {
    __resetSignupAttributionForTests();
    document.body.innerHTML = '';
  });

  it('decorates a sign-up CTA when the visitor interacts with it', () => {
    window.history.replaceState({}, '', '/studio?utm_source=chatgpt');
    initSignupAttribution();

    const link = anchor(`${APP_ORIGIN}/sign-up`);
    const label = document.createElement('span');
    link.append(label);
    document.body.append(link);
    link.addEventListener('click', (event) => event.preventDefault());

    label.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const url = new URL(link.href);
    expect(url.searchParams.get('utm_source')).toBe('chatgpt');
    expect(url.searchParams.get('signup_landing')).toBe('/studio');
  });

  it('forwards a landing referral code onto the sign-up link', () => {
    window.history.replaceState({}, '', '/?ref=ABCDEF23JKMN');
    initSignupAttribution();

    const link = anchor(`${APP_ORIGIN}/sign-up`);
    document.body.append(link);
    link.addEventListener('click', (event) => event.preventDefault());
    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(new URL(link.href).searchParams.get('ref')).toBe('abcdef23jkmn');
  });

  it('does not replace a referral code the sign-up link already has', () => {
    window.history.replaceState({}, '', '/?ref=ABCDEF23JKMN');
    initSignupAttribution();

    const link = anchor(`${APP_ORIGIN}/sign-up?ref=FREND2345XYZ`);
    document.body.append(link);
    link.addEventListener('click', (event) => event.preventDefault());
    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(new URL(link.href).searchParams.get('ref')).toBe('FREND2345XYZ');
  });

  it('drops an invalid landing referral code', () => {
    window.history.replaceState({}, '', '/?ref=not+a+code');
    initSignupAttribution();

    const link = anchor(`${APP_ORIGIN}/sign-up`);
    document.body.append(link);
    link.addEventListener('click', (event) => event.preventDefault());
    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(new URL(link.href).searchParams.has('ref')).toBe(false);
  });
});
