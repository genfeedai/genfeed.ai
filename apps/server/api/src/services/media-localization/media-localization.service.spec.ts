import { MediaLocalizationService } from '@api/services/media-localization/media-localization.service';
import { ByokProvider, IngredientStatus } from '@genfeedai/contracts';

vi.mock('@api/collections/ingredients/services/ingredients.service', () => ({
  IngredientsService: class {},
}));
vi.mock('@api/collections/metadata/services/metadata.service', () => ({
  MetadataService: class {},
}));
vi.mock('@api/services/byok/byok.service', () => ({ ByokService: class {} }));
vi.mock('@api/services/files-microservice/client/files-client.service', () => ({
  FilesClientService: class {},
}));
vi.mock(
  '@api/services/integrations/elevenlabs/services/elevenlabs.service',
  () => ({ ElevenLabsService: class {} }),
);
vi.mock(
  '@api/services/integrations/replicate/services/replicate.service',
  () => ({ ReplicateService: class {} }),
);
vi.mock('@api/shared/services/shared/shared.service', () => ({
  SharedService: class {},
}));

function harness() {
  const ingredients = {
    findOne: vi.fn().mockResolvedValue({ id: 'video', brandId: 'brand' }),
    patch: vi.fn().mockResolvedValue({}),
  };
  const metadata = { patch: vi.fn().mockResolvedValue({}) };
  const shared = {
    createMediaDocumentsInternal: vi.fn().mockResolvedValue({
      ingredientData: { id: 'audio' },
      metadataData: { id: 'metadata' },
    }),
  };
  const files = {
    deleteStoredObject: vi.fn().mockResolvedValue(undefined),
    uploadToS3: vi.fn().mockResolvedValue({
      publicUrl: 'https://cdn.example/background.wav',
      s3Key: 'ingredients/musics/audio.wav',
    }),
    getPresignedDownloadUrl: vi
      .fn()
      .mockResolvedValue('https://cdn.example/video.mp4'),
    extractMetadataFromUrl: vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          url.endsWith('.mp4')
            ? { duration: 30, hasAudio: true }
            : { duration: 2 },
        ),
      ),
    assembleSpeech: vi.fn().mockResolvedValue({
      publicUrl: 'https://cdn.example/audio.wav',
      s3Key: 'ingredients/audios/audio.wav',
      duration: 30,
    }),
  };
  const replicate = {
    separateDialogue: vi.fn().mockResolvedValue({
      backgroundUrl: 'https://provider.example/background.wav',
    }),
    transcribeAudio: vi.fn().mockResolvedValue({
      text: 'Hello. Try Genfeed.',
      language: 'en',
      segments: [
        { start: 1, end: 4, text: 'Hello.' },
        { start: 10, end: 14, text: 'Try Genfeed.' },
      ],
    }),
    generateTextCompletionSync: vi.fn().mockResolvedValue('Hola.'),
  };
  const elevenlabs = {
    getSpeechModelId: vi.fn().mockReturnValue('eleven_multilingual_v2'),
    generateAndUploadAudio: vi.fn().mockResolvedValue({
      audioUrl: 'https://cdn.example/speech.mp3',
      duration: 2,
    }),
  };
  const byok = {
    resolveApiKey: vi
      .fn()
      .mockImplementation((_org: string, provider: string) =>
        Promise.resolve({ apiKey: `${provider}-key` }),
      ),
  };
  const service = new MediaLocalizationService(
    ingredients as never,
    metadata as never,
    shared as never,
    files as never,
    replicate as never,
    elevenlabs as never,
    byok as never,
  );
  return { service, ingredients, shared, files, replicate, elevenlabs, byok };
}
const request = {
  videoId: 'video',
  organizationId: 'org',
  userId: 'user',
  targetLanguage: 'es',
  voiceId: 'voice',
};

describe('MediaLocalizationService', () => {
  it('rejects inaccessible videos before signing URLs or invoking providers', async () => {
    const h = harness();
    h.ingredients.findOne.mockResolvedValue(null);
    await expect(h.service.localize(request)).rejects.toThrow('Source video');
    expect(h.ingredients.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org', isDeleted: false }),
      'none',
    );
    expect(h.files.getPresignedDownloadUrl).not.toHaveBeenCalled();
    expect(h.replicate.transcribeAudio).not.toHaveBeenCalled();
  });
  it('preserves source gaps and full duration and stores the editable translation with lineage', async () => {
    const h = harness();
    const result = await h.service.localize(request);
    expect(h.files.assembleSpeech).toHaveBeenCalledWith(
      expect.objectContaining({
        durationSeconds: 30,
        segments: [
          {
            audioUrl: 'https://cdn.example/speech.mp3',
            startSeconds: 1,
            endSeconds: 4,
          },
          {
            audioUrl: 'https://cdn.example/speech.mp3',
            startSeconds: 10,
            endSeconds: 14,
          },
        ],
      }),
    );
    expect(h.byok.resolveApiKey).toHaveBeenCalledWith(
      'org',
      ByokProvider.ELEVENLABS,
    );
    expect(h.elevenlabs.generateAndUploadAudio).toHaveBeenCalledWith(
      'voice',
      'Hola.',
      expect.any(String),
      'org',
      'user',
      expect.any(String),
      { languageCode: 'es' },
    );
    expect(result.transcript.text).toBe('Hello. Try Genfeed.');
    expect(result.segments[0]).toMatchObject({
      sourceText: 'Hello.',
      text: 'Hola.',
    });
    expect(h.ingredients.patch).toHaveBeenLastCalledWith(
      'audio',
      expect.objectContaining({
        status: IngredientStatus.GENERATED,
        s3Key: 'ingredients/audios/audio.wav',
        providerData: expect.any(Object),
      }),
    );
  });
  it('rejects overlapping edits before voice generation', async () => {
    const h = harness();
    await expect(
      h.service.localize({
        ...request,
        segments: [
          { start: 1, end: 4, text: 'Hola' },
          { start: 3, end: 5, text: 'Prueba' },
        ],
      }),
    ).rejects.toThrow('non-overlapping');
    expect(h.elevenlabs.generateAndUploadAudio).not.toHaveBeenCalled();
    expect(h.ingredients.patch).toHaveBeenCalledWith(
      'audio',
      expect.objectContaining({ status: IngredientStatus.FAILED }),
    );
  });
  it('never truncates unfit speech and bounds automatic rewrites', async () => {
    const h = harness();
    h.files.extractMetadataFromUrl.mockResolvedValue({
      duration: 30,
      hasAudio: true,
    });
    await expect(h.service.localize(request)).rejects.toThrow('exceeds');
    expect(h.elevenlabs.generateAndUploadAudio).toHaveBeenCalledTimes(2);
    expect(h.files.assembleSpeech).not.toHaveBeenCalled();
    expect(h.ingredients.patch).toHaveBeenLastCalledWith(
      'audio',
      expect.objectContaining({ status: IngredientStatus.FAILED }),
    );
  });
  it('does not rewrite user-edited segments when speech is too long', async () => {
    const h = harness();
    await expect(
      h.service.localize({
        ...request,
        segments: [{ start: 0, end: 1, text: 'Texto aprobado' }],
      }),
    ).rejects.toThrow('exceeds');
    expect(h.replicate.generateTextCompletionSync).not.toHaveBeenCalled();
    expect(h.elevenlabs.generateAndUploadAudio).toHaveBeenCalledTimes(1);
  });
  it('marks output failed when assembly changes source duration', async () => {
    const h = harness();
    h.files.assembleSpeech.mockResolvedValue({
      publicUrl: 'https://cdn.example/audio.wav',
      s3Key: 'key',
      duration: 15,
    });
    await expect(h.service.localize(request)).rejects.toThrow('preserve');
    expect(h.ingredients.patch).toHaveBeenLastCalledWith(
      'audio',
      expect.objectContaining({ status: IngredientStatus.FAILED }),
    );
  });
  it('rejects inaccessible dialogue separation sources before provider work', async () => {
    const h = harness();
    h.ingredients.findOne.mockResolvedValue(null);
    await expect(h.service.separateDialogue(request)).rejects.toThrow(
      'Ready source media',
    );
    expect(h.files.getPresignedDownloadUrl).not.toHaveBeenCalled();
    expect(h.shared.createMediaDocumentsInternal).not.toHaveBeenCalled();
  });
  it('honors a different language and voice on each approved segment', async () => {
    const h = harness();
    await h.service.localize({
      ...request,
      segments: [
        {
          start: 0,
          end: 3,
          text: 'Bonjour',
          voiceId: 'french-voice',
          language: 'fr',
        },
        {
          start: 3,
          end: 6,
          text: 'Hola',
          voiceId: 'spanish-voice',
          language: 'es',
        },
      ],
    });
    expect(h.elevenlabs.generateAndUploadAudio).toHaveBeenNthCalledWith(
      1,
      'french-voice',
      'Bonjour',
      expect.any(String),
      'org',
      'user',
      expect.any(String),
      { languageCode: 'fr' },
    );
    expect(h.elevenlabs.generateAndUploadAudio).toHaveBeenNthCalledWith(
      2,
      'spanish-voice',
      'Hola',
      expect.any(String),
      'org',
      'user',
      expect.any(String),
      { languageCode: 'es' },
    );
  });
  it('stores a separated background stem with review requirement and source lineage', async () => {
    const h = harness();
    h.files.extractMetadataFromUrl.mockResolvedValue({
      duration: 30,
      hasAudio: true,
    });
    const result = await h.service.separateDialogue(request);
    expect(result).toMatchObject({
      audio: {
        id: 'audio',
        audioUrl: 'https://cdn.example/background.wav',
        duration: 30,
      },
      reviewRequired: true,
    });
    expect(h.files.uploadToS3).toHaveBeenCalledWith(
      'audio.wav',
      'musics',
      expect.objectContaining({
        url: 'https://provider.example/background.wav',
      }),
    );
    expect(h.replicate.separateDialogue).toHaveBeenCalledWith(
      'https://cdn.example/video.mp4',
      expect.any(String),
    );
    expect(h.shared.createMediaDocumentsInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceIds: ['video'],
        parentId: 'video',
        organizationId: 'org',
      }),
    );
    expect(h.ingredients.patch).toHaveBeenLastCalledWith(
      'audio',
      expect.objectContaining({
        s3Key: 'ingredients/musics/audio.wav',
        status: IngredientStatus.GENERATED,
      }),
    );
  });

  it('marks background output failed when the separation provider fails', async () => {
    const h = harness();
    h.replicate.separateDialogue.mockRejectedValue(
      new Error('Provider unavailable'),
    );
    await expect(h.service.separateDialogue(request)).rejects.toThrow(
      'Provider unavailable',
    );
    expect(h.ingredients.patch).toHaveBeenLastCalledWith(
      'audio',
      expect.objectContaining({ status: IngredientStatus.FAILED }),
    );
    expect(h.files.uploadToS3).not.toHaveBeenCalled();
  });
  it('signs the persisted source object key instead of guessing its filename', async () => {
    const h = harness();
    h.ingredients.findOne.mockResolvedValue({
      id: 'video',
      brandId: 'brand',
      s3Key: 'ingredients/videos/compositions/final.mp4',
    });
    await h.service.localize(request);
    expect(h.files.getPresignedDownloadUrl).toHaveBeenCalledWith(
      'compositions/final.mp4',
      'videos',
    );
  });

  it('preserves a supplied script for a silent source and records actual provider calls without claiming vendor cost', async () => {
    const h = harness();
    h.files.extractMetadataFromUrl.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('.mp4')
          ? { duration: 30, hasAudio: false }
          : { duration: 2 },
      ),
    );
    const result = await h.service.localize({
      ...request,
      script: 'Hola Genfeed',
    });
    expect(result.transcript).toEqual({
      text: 'Hola Genfeed',
      segments: [{ start: 0, end: 30, text: 'Hola Genfeed' }],
    });
    expect(h.replicate.transcribeAudio).not.toHaveBeenCalled();
    expect(h.ingredients.patch).toHaveBeenLastCalledWith(
      'audio',
      expect.objectContaining({
        providerData: {
          localization: expect.objectContaining({
            transcriptSource: 'provided-script',
            suppliedScript: 'Hola Genfeed',
            usage: expect.objectContaining({
              transcription: { modelId: 'openai/whisper', calls: 0 },
              synthesis: expect.objectContaining({
                calls: 1,
                characters: 12,
                generatedSeconds: 2,
              }),
              sourceSeconds: 30,
              outputSeconds: 30,
              vendorCost: null,
            }),
          }),
        },
      }),
    );
  });
  it('separates dialogue from a saved AUDIO artifact using its persisted storage path', async () => {
    const h = harness();
    h.ingredients.findOne.mockResolvedValue({
      id: 'saved-audio',
      brandId: 'brand',
      category: 'AUDIO',
      status: IngredientStatus.GENERATED,
      s3Key: 'ingredients/audios/saved.wav',
    });
    h.files.extractMetadataFromUrl.mockResolvedValue({
      duration: 30,
      hasAudio: true,
    });
    await h.service.separateDialogue({ ...request, videoId: 'saved-audio' });
    expect(h.files.getPresignedDownloadUrl).toHaveBeenCalledWith(
      'saved.wav',
      'audios',
    );
    expect(h.ingredients.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        category: { in: ['VIDEO', 'MUSIC', 'VOICE', 'AUDIO'] },
        OR: expect.any(Array),
      }),
      'none',
    );
  });

  it.each(['localize', 'separateDialogue'] as const)(
    'requires completed media before %s invokes providers',
    async (method) => {
      const h = harness();
      const unfinished = {
        id: 'video',
        brandId: 'brand',
        status: IngredientStatus.PROCESSING,
      };
      h.ingredients.findOne.mockImplementation(
        (query: { OR: Array<{ status: { in?: string[] } | string }> }) =>
          Promise.resolve(
            query.OR.some(
              (condition) =>
                typeof condition.status === 'object' &&
                condition.status.in?.includes(unfinished.status),
            )
              ? unfinished
              : null,
          ),
      );
      await expect(h.service[method](request)).rejects.toThrow();
      expect(h.files.getPresignedDownloadUrl).not.toHaveBeenCalled();
      expect(h.ingredients.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          OR: expect.any(Array),
          isDeleted: false,
          organizationId: 'org',
        }),
        'none',
      );
    },
  );
  it.each(['UPLOADED', 'VALIDATED', 'DRAFT'])(
    'accepts ready persisted library media in %s state',
    async (status) => {
      const h = harness();
      h.ingredients.findOne.mockResolvedValue({
        id: 'video',
        brandId: 'brand',
        status,
        s3Key: 'ingredients/videos/uploaded.mp4',
      });
      await expect(h.service.localize(request)).resolves.toMatchObject({
        duration: 30,
      });
    },
  );
  it('rejects an empty draft before provider work', async () => {
    const h = harness();
    h.ingredients.findOne.mockResolvedValue({
      id: 'video',
      brandId: 'brand',
      status: IngredientStatus.DRAFT,
      s3Key: '',
    });
    await expect(h.service.localize(request)).rejects.toThrow();
    expect(h.replicate.transcribeAudio).not.toHaveBeenCalled();
  });
  it('normalizes tiny provider timestamp overlaps and end overruns without deleting speech', async () => {
    const h = harness();
    h.replicate.transcribeAudio.mockResolvedValue({
      text: 'One. Two.',
      language: 'en',
      segments: [
        { start: 0, end: 4, text: 'One.' },
        { start: 3.95, end: 30.1, text: 'Two.' },
      ],
    });
    const result = await h.service.localize(request);
    expect(result.transcript.segments).toEqual([
      { start: 0, end: 4, text: 'One.' },
      { start: 4, end: 30, text: 'Two.' },
    ]);
  });
  it('reports malformed provider text without a TypeError', async () => {
    const h = harness();
    h.replicate.transcribeAudio.mockResolvedValue({
      text: 'One',
      language: 'en',
      segments: [{ start: 0, end: 3, text: null }],
    });
    await expect(h.service.localize(request)).rejects.toThrow('malformed');
    expect(h.elevenlabs.generateAndUploadAudio).not.toHaveBeenCalled();
  });
  it('deletes temporary segment uploads after a successful assembly', async () => {
    const h = harness();
    const result = await h.service.localize(request);
    expect(h.files.deleteStoredObject).toHaveBeenCalledTimes(2);
    for (const call of h.elevenlabs.generateAndUploadAudio.mock.calls)
      expect(h.files.deleteStoredObject).toHaveBeenCalledWith(
        `ingredients/musics/${call[2]}`,
      );
    expect(result.segments[0]).not.toHaveProperty('audioUrl');
  });
  it('cleans both temporary attempts after timing failure', async () => {
    const h = harness();
    h.files.extractMetadataFromUrl.mockResolvedValue({
      duration: 30,
      hasAudio: true,
    });
    await expect(h.service.localize(request)).rejects.toThrow('exceeds');
    expect(h.files.deleteStoredObject).toHaveBeenCalledTimes(2);
    expect(h.files.assembleSpeech).not.toHaveBeenCalled();
  });
  it('requires an explicit edit for meaningful provider overlap instead of truncating dialogue', async () => {
    const h = harness();
    h.replicate.transcribeAudio.mockResolvedValue({
      text: 'One. Two.',
      language: 'en',
      segments: [
        { start: 0, end: 4, text: 'One.' },
        { start: 3, end: 6, text: 'Two.' },
      ],
    });
    await expect(h.service.localize(request)).rejects.toThrow(
      'corrected timed segments',
    );
    expect(h.elevenlabs.generateAndUploadAudio).not.toHaveBeenCalled();
    expect(h.ingredients.patch).toHaveBeenLastCalledWith(
      'audio',
      expect.objectContaining({
        providerData: {
          localization: expect.objectContaining({
            originalProviderSegments: [
              { start: 0, end: 4, text: 'One.' },
              { start: 3, end: 6, text: 'Two.' },
            ],
          }),
        },
      }),
    );
  });
});
