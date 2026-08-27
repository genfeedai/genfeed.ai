import {
  buildLogoDevLogoUrl,
  normalizePublicWebsiteDomain,
} from './logo-dev-logo.util';

describe('Logo.dev website logo fallback', () => {
  it('normalizes a public website down to a credential-free company domain', () => {
    expect(
      normalizePublicWebsiteDomain(
        'https://user:password@WWW.Acme.com:8443/private?token=secret',
      ),
    ).toBe('acme.com');
  });

  it.each([
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://10.0.0.5',
    'http://metadata.google.internal',
    'https://service.home.arpa',
    'https://private.onion',
    'https://acme.test',
    'https://acme.example',
    'https://public',
    'ftp://acme.com/logo.png',
  ])('rejects non-public domain input %s', (sourceUrl) => {
    expect(normalizePublicWebsiteDomain(sourceUrl)).toBeUndefined();
  });

  it('builds the documented PNG monogram fallback with a publishable key', () => {
    expect(
      buildLogoDevLogoUrl(
        'https://www.Acme.com/about?campaign=private',
        ' pk_example ',
      ),
    ).toBe(
      'https://img.logo.dev/acme.com?token=pk_example&size=128&format=png&fallback=monogram',
    );
  });

  it.each([undefined, '', 'sk_secret', 'not-a-key'])(
    'keeps Logo.dev disabled for a missing or unsafe key',
    (publishableKey) => {
      expect(
        buildLogoDevLogoUrl('https://acme.com', publishableKey),
      ).toBeUndefined();
    },
  );
});
