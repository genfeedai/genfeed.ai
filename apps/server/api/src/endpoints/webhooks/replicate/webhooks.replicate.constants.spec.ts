import { isAllowedReplicateOutputUrl } from '@api/endpoints/webhooks/replicate/webhooks.replicate.constants';

describe('isAllowedReplicateOutputUrl', () => {
  it.each([
    'https://replicate.delivery/pbxt/abc/out-0.png',
    'https://pbxt.replicate.delivery/abc/out-0.png',
    'https://tjzk.replicate.delivery/models/x.mp4',
    'https://replicate.com/api/models/x',
    'https://api.replicate.com/v1/files/x',
  ])('accepts the Replicate-owned host %s', (url) => {
    expect(isAllowedReplicateOutputUrl(url)).toBe(true);
  });

  it.each([
    ['a foreign host', 'https://evil.example.com/payload.png'],
    ['the EC2 metadata endpoint', 'https://169.254.169.254/latest/meta-data/'],
    ['an internal service', 'https://api.genfeed.internal/v1/admin'],
    ['loopback', 'https://127.0.0.1:3010/v1/users'],
  ])('rejects %s', (_label, url) => {
    expect(isAllowedReplicateOutputUrl(url)).toBe(false);
  });

  it('rejects plain http even on an allowed host', () => {
    expect(
      isAllowedReplicateOutputUrl('http://replicate.delivery/pbxt/out.png'),
    ).toBe(false);
  });

  it('rejects a suffix-shaped lookalike domain', () => {
    // `endsWith('replicate.delivery')` alone would accept this.
    expect(
      isAllowedReplicateOutputUrl('https://notreplicate.delivery/out.png'),
    ).toBe(false);
    expect(
      isAllowedReplicateOutputUrl(
        'https://replicate.delivery.evil.com/out.png',
      ),
    ).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(isAllowedReplicateOutputUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedReplicateOutputUrl('data:text/plain;base64,aGVsbG8=')).toBe(
      false,
    );
  });

  it.each([undefined, null, '', 42, {}, ['https://replicate.delivery/x']])(
    'rejects the non-URL value %s',
    (value) => {
      expect(isAllowedReplicateOutputUrl(value)).toBe(false);
    },
  );

  it('ignores host casing', () => {
    expect(
      isAllowedReplicateOutputUrl('https://PBXT.Replicate.Delivery/out.png'),
    ).toBe(true);
  });
});
