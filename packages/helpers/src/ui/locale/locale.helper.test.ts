import { beforeEach, describe, expect, it, vi } from 'vitest';

// locale.helper.ts reads next/headers, which cannot run under vitest. Only the
// request accessors are mocked — the real allowlist from @genfeedai/contracts/constants
// is exercised so a locale added there is genuinely covered here.

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

import {
  negotiateAcceptLanguage,
  resolveRequestLocale,
} from '@helpers/ui/locale/locale.helper';
import { cookies, headers } from 'next/headers';

type MockedRequestAccessor = ReturnType<typeof vi.fn>;

function mockRequest({
  acceptLanguage,
  cookie,
}: {
  acceptLanguage?: string;
  cookie?: string;
}) {
  (cookies as unknown as MockedRequestAccessor).mockResolvedValue({
    get: vi
      .fn()
      .mockReturnValue(cookie === undefined ? undefined : { value: cookie }),
  });
  (headers as unknown as MockedRequestAccessor).mockResolvedValue({
    get: vi.fn().mockReturnValue(acceptLanguage ?? null),
  });
}

describe('negotiateAcceptLanguage', () => {
  it('returns undefined when the header is absent', () => {
    expect(negotiateAcceptLanguage(null)).toBeUndefined();
  });

  it('matches an exact allowlisted tag', () => {
    expect(negotiateAcceptLanguage('en')).toBe('en');
    expect(negotiateAcceptLanguage('en-XA')).toBe('en-XA');
  });

  it('falls back to the bare language subtag for a regional variant', () => {
    expect(negotiateAcceptLanguage('en-GB')).toBe('en');
  });

  it('honours quality ordering rather than header order', () => {
    expect(negotiateAcceptLanguage('de;q=0.9,en;q=1.0')).toBe('en');
  });

  it('skips unlisted languages ranked above an allowlisted one', () => {
    expect(negotiateAcceptLanguage('de,fr;q=0.8,en;q=0.3')).toBe('en');
  });

  it('never selects a tag explicitly refused with q=0', () => {
    expect(negotiateAcceptLanguage('en;q=0')).toBeUndefined();
  });

  it('ignores a wildcard rather than treating it as a match', () => {
    expect(negotiateAcceptLanguage('*')).toBeUndefined();
  });

  it('returns undefined when nothing in the header is allowlisted', () => {
    expect(negotiateAcceptLanguage('de,fr;q=0.8')).toBeUndefined();
  });

  it('tolerates whitespace and a malformed quality value', () => {
    expect(negotiateAcceptLanguage('  en ; q=oops ')).toBeUndefined();
    expect(negotiateAcceptLanguage(' de , en ;q=0.5 ')).toBe('en');
  });
});

describe('resolveRequestLocale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers an allowlisted cookie over Accept-Language', async () => {
    mockRequest({ acceptLanguage: 'en', cookie: 'en-XA' });

    await expect(resolveRequestLocale()).resolves.toBe('en-XA');
  });

  it('falls back to Accept-Language when the cookie is absent', async () => {
    mockRequest({ acceptLanguage: 'en-XA' });

    await expect(resolveRequestLocale()).resolves.toBe('en-XA');
  });

  it('ignores a cookie value that is not allowlisted', async () => {
    mockRequest({ acceptLanguage: 'en-XA', cookie: 'de' });

    await expect(resolveRequestLocale()).resolves.toBe('en-XA');
  });

  it('returns the default locale when nothing is stored or negotiable', async () => {
    mockRequest({ acceptLanguage: 'de,fr;q=0.8' });

    await expect(resolveRequestLocale()).resolves.toBe('en');
  });

  it('returns the default locale when the request carries neither signal', async () => {
    mockRequest({});

    await expect(resolveRequestLocale()).resolves.toBe('en');
  });
});
