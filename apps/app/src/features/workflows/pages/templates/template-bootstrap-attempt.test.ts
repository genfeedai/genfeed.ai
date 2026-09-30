import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reserveTemplateAttempt,
  templateAttemptKey,
  templateAttemptScope,
} from './template-bootstrap-attempt';

describe('Persistent per-tab template attempts', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
  });
  afterEach(() => vi.unstubAllGlobals());
  const scope = () => templateAttemptScope('user', 'org', 'brand', 'template');
  it('reserves synchronously and keeps successful/failed attempts across reloads', async () => {
    const nonce = reserveTemplateAttempt(scope());
    const key = await templateAttemptKey(scope(), nonce);
    expect(reserveTemplateAttempt(scope())).toBe(nonce);
    vi.resetModules();
    const reloaded = await import('./template-bootstrap-attempt');
    expect(
      await reloaded.templateAttemptKey(
        scope(),
        reloaded.reserveTemplateAttempt(scope()),
      ),
    ).toBe(key);
  });
  it('only an explicit new attempt replaces the nonce', () => {
    const first = reserveTemplateAttempt(scope());
    expect(reserveTemplateAttempt(scope())).toBe(first);
    const next = reserveTemplateAttempt(scope(), true);
    expect(next).not.toBe(first);
    expect(reserveTemplateAttempt(scope())).toBe(next);
  });
  it.each([
    ['other-user', 'org', 'brand', 'template'],
    ['user', 'other-org', 'brand', 'template'],
    ['user', 'org', 'other-brand', 'template'],
    ['user', 'org', 'brand', 'other-template'],
  ])('separates identity %j', async (user, org, brand, template) => {
    const other = templateAttemptScope(user, org, brand, template);
    expect(
      await templateAttemptKey(other, reserveTemplateAttempt(other)),
    ).not.toBe(
      await templateAttemptKey(scope(), reserveTemplateAttempt(scope())),
    );
  });
  it('creates an independent attempt in a new empty tab storage', () => {
    const nonce = reserveTemplateAttempt(scope());
    sessionStorage.clear();
    expect(reserveTemplateAttempt(scope())).not.toBe(nonce);
  });
  it('uses stable scoped module memory when storage is inaccessible', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const nonce = reserveTemplateAttempt(scope());
    expect(reserveTemplateAttempt(scope())).toBe(nonce);
    const next = reserveTemplateAttempt(scope(), true);
    expect(next).not.toBe(nonce);
    expect(reserveTemplateAttempt(scope())).toBe(next);
    vi.restoreAllMocks();
  });
});
