import { describe, expect, it } from 'vitest';

import {
  deriveBrandNameFromDomain,
  extractBrandDomain,
  extractEmailDomain,
  isPersonalEmailDomain,
  resolveSignupBrandDomain,
  resolveSignupWorkspaceLabel,
} from './signup-brand-domain.helper';

describe('extractBrandDomain', () => {
  it('strips scheme, www, path and casing', () => {
    expect(extractBrandDomain('HTTPS://WWW.Acme.com/pricing?a=1')).toBe(
      'acme.com',
    );
  });

  it('accepts a bare hostname', () => {
    expect(extractBrandDomain('acme.com')).toBe('acme.com');
  });

  it('returns null for empty input', () => {
    expect(extractBrandDomain('   ')).toBeNull();
    expect(extractBrandDomain(null)).toBeNull();
  });
});

describe('extractEmailDomain', () => {
  it('returns the lowercased domain part', () => {
    expect(extractEmailDomain('  Vincent@Acme.COM ')).toBe('acme.com');
  });

  it('rejects values that are not a single local@domain pair', () => {
    expect(extractEmailDomain('not-an-email')).toBeNull();
    expect(extractEmailDomain('a@b@c.com')).toBeNull();
    expect(extractEmailDomain('vincent@localhost')).toBeNull();
    expect(extractEmailDomain(null)).toBeNull();
  });
});

describe('isPersonalEmailDomain', () => {
  it('matches known free-mail providers', () => {
    expect(isPersonalEmailDomain('gmail.com')).toBe(true);
    expect(isPersonalEmailDomain('GMAIL.COM')).toBe(true);
  });

  it('does not match corporate domains', () => {
    expect(isPersonalEmailDomain('acme.com')).toBe(false);
    expect(isPersonalEmailDomain(null)).toBe(false);
  });

  it('honours an explicit override list', () => {
    expect(isPersonalEmailDomain('acme.com', ['acme.com'])).toBe(true);
    expect(isPersonalEmailDomain('gmail.com', ['acme.com'])).toBe(false);
  });
});

describe('deriveBrandNameFromDomain', () => {
  it('title-cases each segment and drops the TLD', () => {
    expect(deriveBrandNameFromDomain('acme-studio.com')).toBe('Acme Studio');
    expect(deriveBrandNameFromDomain('my_great.brand.io')).toBe(
      'My Great Brand',
    );
  });
});

describe('resolveSignupBrandDomain', () => {
  it('prefers an explicitly requested domain over the email domain', () => {
    expect(
      resolveSignupBrandDomain({
        email: 'vincent@acme.com',
        requestedDomain: 'https://www.other-brand.io/about',
      }),
    ).toEqual({
      brandName: 'Other Brand',
      domain: 'other-brand.io',
      source: 'requested',
      websiteUrl: 'https://other-brand.io',
    });
  });

  it('falls back to a corporate email domain', () => {
    expect(resolveSignupBrandDomain({ email: 'vincent@acme.com' })).toEqual({
      brandName: 'Acme',
      domain: 'acme.com',
      source: 'email',
      websiteUrl: 'https://acme.com',
    });
  });

  it('refuses to scrape a personal mailbox domain', () => {
    expect(resolveSignupBrandDomain({ email: 'vincent@gmail.com' })).toEqual({
      brandName: null,
      domain: null,
      source: 'none',
      websiteUrl: null,
    });
  });

  it('resolves to none when nothing usable is supplied', () => {
    expect(
      resolveSignupBrandDomain({ email: null, requestedDomain: '  ' }),
    ).toEqual({
      brandName: null,
      domain: null,
      source: 'none',
      websiteUrl: null,
    });
  });
});

describe('resolveSignupWorkspaceLabel', () => {
  it('uses the corporate email domain as the workspace name', () => {
    expect(resolveSignupWorkspaceLabel({ email: 'vincent@shipshit.dev' })).toBe(
      'Shipshit',
    );
  });

  it('uses the signed-in name when the mailbox is personal', () => {
    expect(
      resolveSignupWorkspaceLabel({
        email: 'vincent@gmail.com',
        name: 'Vincent D',
      }),
    ).toBe('Vincent D');
  });

  it('falls back to the email local-part when there is no name', () => {
    expect(resolveSignupWorkspaceLabel({ email: 'vincent.d@gmail.com' })).toBe(
      'Vincent D',
    );
  });

  it('never returns Default Organization', () => {
    expect(resolveSignupWorkspaceLabel({})).toBe('Workspace');
    expect(resolveSignupWorkspaceLabel({ email: null, name: '  ' })).toBe(
      'Workspace',
    );
  });
});
