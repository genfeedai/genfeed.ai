import { downloadPublicMedia } from '@files/services/audio-overlay/media-download';

const guardedFetch = vi.hoisted(() => vi.fn());
vi.mock('@libs/security/destination-guard', () => ({
  safeFetch: guardedFetch,
}));

describe('downloadPublicMedia', () => {
  beforeEach(() => vi.clearAllMocks());
  it('downloads through the existing public destination guard', async () => {
    guardedFetch.mockResolvedValue(new Response('audio'));
    await expect(
      downloadPublicMedia('https://cdn.example.com/audio.wav', 10),
    ).resolves.toEqual(Buffer.from('audio'));
    expect(guardedFetch).toHaveBeenCalledWith(
      'https://cdn.example.com/audio.wav',
      { signal: expect.any(AbortSignal) },
      {},
    );
  });
  it('rejects oversized streamed bodies without trusting content length', async () => {
    guardedFetch.mockResolvedValue(
      new Response('oversized', { headers: { 'content-length': '1' } }),
    );
    await expect(
      downloadPublicMedia('https://cdn.example.com/audio.wav', 2),
    ).rejects.toThrow('size limit');
  });
  it('propagates destination guard rejection without an alternate fetch path', async () => {
    guardedFetch.mockRejectedValue(new Error('Destination blocked'));
    await expect(
      downloadPublicMedia('http://127.0.0.1/private', 10),
    ).rejects.toThrow('Destination blocked');
    expect(guardedFetch).toHaveBeenCalledTimes(1);
  });
});

describe('configured private storage downloads', () => {
  const config = {
    get: (key: string) =>
      key === 'GENFEEDAI_CDN_URL'
        ? 'http://minio:9000/bucket'
        : 'http://files:3012',
  };
  it('permits only the exact configured storage origin and pins redirects to it', async () => {
    guardedFetch.mockResolvedValue(new Response('audio'));
    await downloadPublicMedia(
      'http://minio:9000/bucket/audio.wav',
      10,
      config as never,
    );
    expect(guardedFetch).toHaveBeenLastCalledWith(
      'http://minio:9000/bucket/audio.wav',
      expect.any(Object),
      { allowedOrigins: ['http://minio:9000'], allowPrivateNetwork: true },
    );
  });
  it.each([
    'http://minio:9001/private',
    'http://169.254.169.254/latest/meta-data',
    'http://minio.attacker.test:9000/audio',
  ])(
    'keeps arbitrary destination %s under the public-only policy',
    async (url) => {
      guardedFetch.mockResolvedValue(new Response('audio'));
      await downloadPublicMedia(url, 10, config as never);
      expect(guardedFetch).toHaveBeenLastCalledWith(
        url,
        expect.any(Object),
        {},
      );
    },
  );
  it('resolves local media paths using only the configured files host', async () => {
    guardedFetch.mockResolvedValue(new Response('audio'));
    await downloadPublicMedia(
      '/local/ingredients/audios/speech.wav',
      10,
      config as never,
    );
    expect(guardedFetch).toHaveBeenLastCalledWith(
      'http://files:3012/local/ingredients/audios/speech.wav',
      expect.any(Object),
      { allowedOrigins: ['http://files:3012'], allowPrivateNetwork: true },
    );
  });
});
