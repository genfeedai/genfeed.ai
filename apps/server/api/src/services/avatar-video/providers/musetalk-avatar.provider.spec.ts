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

  describe('generateVideo', () => {
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
    it('providerName is still accessible after failed calls', async () => {
      await provider.getStatus('x', 'org-1').catch(() => {});
      expect(provider.providerName).toBe('musetalk');
    });
  });
});
