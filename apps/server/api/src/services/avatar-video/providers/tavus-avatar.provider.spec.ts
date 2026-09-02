import { NotImplementedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { TavusAvatarProvider } from './tavus-avatar.provider';

describe('TavusAvatarProvider', () => {
  let provider: TavusAvatarProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TavusAvatarProvider],
    }).compile();

    provider = module.get<TavusAvatarProvider>(TavusAvatarProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should expose providerName as "tavus"', () => {
    expect(provider.providerName).toBe('tavus');
  });

  describe('generateVideo', () => {
    it('should throw NotImplementedException', async () => {
      await expect(provider.generateVideo({} as never)).rejects.toThrow(
        NotImplementedException,
      );
    });

    it('should throw with "coming soon" message', async () => {
      await expect(provider.generateVideo({} as never)).rejects.toThrow(
        'coming soon',
      );
    });

    it('should reject regardless of input payload', async () => {
      const inputVariants = [
        { avatarId: 'av-1', scriptText: 'Hello' },
        {},
        null,
        { avatarId: undefined, scriptText: '' },
      ];

      for (const input of inputVariants) {
        await expect(provider.generateVideo(input as never)).rejects.toThrow(
          NotImplementedException,
        );
      }
    });
  });

  describe('getStatus', () => {
    it('should throw NotImplementedException', async () => {
      await expect(provider.getStatus('job-123', 'org-1')).rejects.toThrow(
        NotImplementedException,
      );
    });

    it('should throw with "coming soon" message', async () => {
      await expect(provider.getStatus('job-abc', 'org-1')).rejects.toThrow(
        'coming soon',
      );
    });

    it('should reject for any jobId value', async () => {
      const jobIds = ['job-1', '', 'some-uuid-1234', '   '];
      for (const jobId of jobIds) {
        await expect(provider.getStatus(jobId, 'org-1')).rejects.toThrow(
          NotImplementedException,
        );
      }
    });
  });
});
