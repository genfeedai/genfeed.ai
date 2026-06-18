import { resolvePresignedDownloadKey } from '@files/controllers/files.controller';

describe('resolvePresignedDownloadKey', () => {
  it('preserves Skills Pro registry keys', () => {
    const generateS3Key = vi.fn(
      (type: string, key: string) => `ingredients/${type}/${key}`,
    );

    const key = resolvePresignedDownloadKey(
      'skills',
      'skills/v1/content-factory-pro/1.0.0/skill.zip',
      generateS3Key,
    );

    expect(key).toBe('skills/v1/content-factory-pro/1.0.0/skill.zip');
    expect(generateS3Key).not.toHaveBeenCalled();
  });

  it('rejects Skills Pro keys outside the registry prefix', () => {
    const generateS3Key = vi.fn(
      (type: string, key: string) => `ingredients/${type}/${key}`,
    );

    expect(() =>
      resolvePresignedDownloadKey('skills', 'private/skill.zip', generateS3Key),
    ).toThrow('Invalid Skills Pro download key');
    expect(generateS3Key).not.toHaveBeenCalled();
  });

  it('keeps media downloads on the existing ingredients path', () => {
    const generateS3Key = vi.fn(
      (type: string, key: string) => `ingredients/${type}/${key}`,
    );

    const key = resolvePresignedDownloadKey(
      'videos',
      'clip.mp4',
      generateS3Key,
    );

    expect(key).toBe('ingredients/videos/clip.mp4');
    expect(generateS3Key).toHaveBeenCalledWith('videos', 'clip.mp4');
  });
});
