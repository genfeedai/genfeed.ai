import { downloadBounded } from '@libs/security/bounded-download';
import {
  DISCORD_ATTACHMENT_MAX_BYTES,
  downloadDiscordAttachment,
} from '@libs/security/discord-media-attachment';

vi.mock('@libs/security/bounded-download', () => ({
  downloadBounded: vi.fn(),
}));

describe('downloadDiscordAttachment', () => {
  const mockDownload = vi.mocked(downloadBounded);

  function respond(contentType: string) {
    mockDownload.mockResolvedValue({
      data: Buffer.from('bytes'),
      headers: new Headers({ 'content-type': contentType }),
    });
  }

  beforeEach(() => vi.clearAllMocks());

  it('names an image after its content type', async () => {
    respond('image/webp');
    await expect(
      downloadDiscordAttachment('https://cdn/x?Signature=s', 'ing_1', 'image'),
    ).resolves.toEqual({
      attachment: Buffer.from('bytes'),
      name: 'ing_1.webp',
    });
  });

  it('downloads over https only and within the upload limit', async () => {
    respond('video/mp4');
    await downloadDiscordAttachment('https://cdn/v', 'ing-1-video', 'video');
    expect(mockDownload).toHaveBeenCalledWith(
      'https://cdn/v',
      expect.objectContaining({
        destination: { allowedSchemes: ['https:'] },
        maxBytes: DISCORD_ATTACHMENT_MAX_BYTES,
      }),
    );
  });

  it('strips unsafe characters from the file name', async () => {
    respond('image/png');
    const result = await downloadDiscordAttachment(
      'https://cdn/x',
      '../a b',
      'image',
    );
    expect(result?.name).toBe('ab.png');
  });

  it('rejects an unexpected content type', async () => {
    respond('text/html');
    await expect(
      downloadDiscordAttachment('https://cdn/x', 'a', 'image'),
    ).resolves.toBeNull();
    respond('video/mp4');
    await expect(
      downloadDiscordAttachment('https://cdn/x', 'a', 'image'),
    ).resolves.toBeNull();
  });

  it('returns null when the download fails or is too large', async () => {
    mockDownload.mockRejectedValue(new Error('too large'));
    await expect(
      downloadDiscordAttachment('https://cdn/x', 'a', 'image'),
    ).resolves.toBeNull();
  });
});
