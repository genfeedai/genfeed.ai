import { MusicTaskModel } from '@genfeedai/contracts';
import { GenerateMusicTask } from '@workers/crons/workflows/task-types/generate-music.task';

describe('GenerateMusicTask', () => {
  const replicateService = {
    runModel: vi.fn(),
  };
  const elevenLabsService = {
    textToSpeech: vi.fn(),
  };
  const byokService = {
    resolveApiKey: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
  };

  let task: GenerateMusicTask;

  beforeEach(() => {
    vi.clearAllMocks();
    task = new GenerateMusicTask(
      replicateService as never,
      elevenLabsService as never,
      byokService as never,
      logger as never,
    );
  });

  it('uses the ElevenLabs audio payload as an MPEG data URI', async () => {
    byokService.resolveApiKey.mockResolvedValue({ apiKey: 'eleven-key' });
    elevenLabsService.textToSpeech.mockResolvedValue({
      audioBase64: 'dGVzdC1hdWRpbw==',
    });

    const result = await task.execute(
      {
        model: MusicTaskModel.ELEVENLABS,
        prompt: 'spoken intro',
      },
      'user-1',
      'org-1',
    );

    expect(result.success).toBe(true);
    expect(result.musicId).toBe('data:audio/mpeg;base64,dGVzdC1hdWRpbw==');
    expect(elevenLabsService.textToSpeech).toHaveBeenCalledWith(
      'default',
      'spoken intro',
      'org-1',
      'user-1',
      'eleven-key',
    );
  });
});
