import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { HeyGenVoiceCatalogService } from '@api/services/integrations/heygen/services/heygen-voice-catalog.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';

describe('HeyGenVoiceCatalogService', () => {
  const findMany = vi.fn();
  const heygen = {
    getPersonalVoices: vi.fn(),
    getPublicVoices: vi.fn(),
  };
  let service: HeyGenVoiceCatalogService;

  function row(id: string, providerData: unknown = { gender: 'female' }) {
    return {
      externalId: id,
      name: `Voice ${id}`,
      providerData,
      sampleAudioUrl: `https://example.com/${id}.mp3`,
    };
  }

  const personalVoice = {
    connection: { kind: 'byok', organizationId: 'org-1', provider: 'heygen' },
    gender: 'male',
    index: 0,
    name: 'My voice',
    ownership: 'private',
    preview: '',
    voiceId: 'mine',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    heygen.getPersonalVoices.mockResolvedValue([]);
    service = new HeyGenVoiceCatalogService(
      { externalVoice: { findMany } } as unknown as PrismaService,
      heygen as unknown as HeyGenService,
    );
  });

  it('serves stock voices from the stored catalogue without calling HeyGen', async () => {
    findMany.mockResolvedValue([row('a'), row('b', { index: 3 })]);

    const voices = await service.getVoices('org-1');

    expect(heygen.getPublicVoices).not.toHaveBeenCalled();
    expect(voices).toEqual([
      {
        connection: {
          kind: 'platform',
          organizationId: 'org-1',
          provider: 'heygen',
        },
        gender: 'female',
        index: 0,
        name: 'Voice a',
        ownership: 'public',
        preview: 'https://example.com/a.mp3',
        voiceId: 'a',
      },
      expect.objectContaining({ gender: null, index: 1, voiceId: 'b' }),
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          externalProvider: 'HEYGEN',
          isActive: true,
          isDefaultSelectable: true,
        }),
      }),
    );
  });

  it('appends the workspace voices after the stock ones and re-indexes', async () => {
    findMany.mockResolvedValue([row('a')]);
    heygen.getPersonalVoices.mockResolvedValue([personalVoice]);

    const voices = await service.getVoices('org-1');

    expect(
      voices.map(({ index, ownership, voiceId }) => [
        index,
        ownership,
        voiceId,
      ]),
    ).toEqual([
      [0, 'public', 'a'],
      [1, 'private', 'mine'],
    ]);
  });

  it('reads the live catalogue once when nothing is stored yet', async () => {
    findMany.mockResolvedValue([]);
    heygen.getPublicVoices.mockResolvedValue([
      { ...personalVoice, voiceId: 'live' },
    ]);

    const voices = await service.getVoices('org-1');

    expect(heygen.getPublicVoices).toHaveBeenCalledWith('org-1');
    expect(voices.map((voice) => voice.voiceId)).toEqual(['live']);
  });

  it('does not hide a credential lookup failure behind the stock voices', async () => {
    findMany.mockResolvedValue([row('a')]);
    heygen.getPersonalVoices.mockRejectedValue(new Error('storage down'));

    await expect(service.getVoices('org-1')).rejects.toThrow('storage down');
  });

  it('returns only the workspace voices when no stock voices exist anywhere', async () => {
    findMany.mockResolvedValue([]);
    heygen.getPublicVoices.mockResolvedValue([]);
    heygen.getPersonalVoices.mockResolvedValue([personalVoice]);

    const voices = await service.getVoices('org-1');

    expect(voices.map((voice) => voice.voiceId)).toEqual(['mine']);
  });
});
