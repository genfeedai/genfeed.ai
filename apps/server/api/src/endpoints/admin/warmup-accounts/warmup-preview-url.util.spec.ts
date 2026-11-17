import { buildPreviewInviteUrl } from '@api/endpoints/admin/warmup-accounts/warmup-preview-url.util';

describe('buildPreviewInviteUrl', () => {
  it.each([
    ['https://staging.example.org'],
    ['https://staging.example.org/'],
    ['https://staging.example.org///'],
    ['  https://staging.example.org/  '],
  ])(
    'keeps the configured origin %j and drops only its trailing slashes',
    (configured) => {
      expect(buildPreviewInviteUrl(configured, 'acme', 'tok-123')).toBe(
        'https://staging.example.org/@acme/invite/tok-123',
      );
    },
  );

  it('keeps a configured path and port', () => {
    expect(
      buildPreviewInviteUrl('http://localhost:3000/site/', 'acme', 'tok-123'),
    ).toBe('http://localhost:3000/site/@acme/invite/tok-123');
  });

  it('leaves the token exactly as minted', () => {
    expect(
      buildPreviewInviteUrl('https://staging.example.org/', 'acme', 'a/b+c='),
    ).toContain('/invite/a%2Fb%2Bc%3D');
  });

  it.each([[undefined], [null], [''], ['   '], ['/'], [42]])(
    'falls back to the production website when the origin is %j',
    (configured) => {
      expect(buildPreviewInviteUrl(configured, 'acme', 'tok-123')).toBe(
        'https://genfeed.ai/@acme/invite/tok-123',
      );
    },
  );
});
