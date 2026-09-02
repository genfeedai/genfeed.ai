import { NotImplementedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { AvatarVideoJobInput } from '../avatar-video-provider.interface';
import { MusetalkAvatarProvider } from './musetalk-avatar.provider';

describe('MusetalkAvatarProvider', () => {
  let provider: MusetalkAvatarProvider;

  const mockInput: AvatarVideoJobInput = {
    avatarId: 'avatar-musetalk-01',
    language: 'en',
    organizationId: 'org-123',
    script: 'Hello world',
    userId: 'user-456',
    voiceId: 'voice-en-01',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MusetalkAvatarProvider],
    }).compile();

    provider = module.get<MusetalkAvatarProvider>(MusetalkAvatarProvider);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('has providerName set to musetalk', () => {
    expect(provider.providerName).toBe('musetalk');
  });

  describe('generateVideo', () => {
    it('throws NotImplementedException', async () => {
      await expect(provider.generateVideo(mockInput)).rejects.toThrow(
        NotImplementedException,
      );
    });

    it('throws with "coming soon" message', async () => {
      await expect(provider.generateVideo(mockInput)).rejects.toThrow(
        'MuseTalk provider coming soon',
      );
    });

    it('throws regardless of the input provided', async () => {
      const minimalInput: AvatarVideoJobInput = {
        avatarId: 'any',
        organizationId: 'any',
        script: '',
        userId: 'any',
        voiceId: 'any',
      };
      await expect(provider.generateVideo(minimalInput)).rejects.toThrow(
        NotImplementedException,
      );
    });

    it('does not return a resolved promise', async () => {
      let resolved = false;
      await provider
        .generateVideo(mockInput)
        .then(() => {
          resolved = true;
        })
        .catch(() => {});
      expect(resolved).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('throws NotImplementedException', async () => {
      await expect(provider.getStatus('any-job-id', 'org-1')).rejects.toThrow(
        NotImplementedException,
      );
    });

    it('throws with "coming soon" message', async () => {
      await expect(provider.getStatus('job-123', 'org-1')).rejects.toThrow(
        'MuseTalk provider coming soon',
      );
    });

    it('throws for any job id', async () => {
      await expect(provider.getStatus('', 'org-1')).rejects.toThrow(
        NotImplementedException,
      );
    });

    it('does not return a resolved promise', async () => {
      let resolved = false;
      await provider
        .getStatus('job', 'org-1')
        .then(() => {
          resolved = true;
        })
        .catch(() => {});
      expect(resolved).toBe(false);
    });

    it('providerName is still accessible after failed calls', async () => {
      await provider.getStatus('x', 'org-1').catch(() => {});
      expect(provider.providerName).toBe('musetalk');
    });
  });
});
