import { ImageTaskModel } from '@genfeedai/contracts';
import { GenerateImageTask } from '@workers/crons/workflows/task-types/generate-image.task';

describe('GenerateImageTask', () => {
  const leonardoService = {
    generateImage: vi.fn(),
  };
  const replicateService = {
    runModel: vi.fn(),
  };
  const falService = {
    generateImage: vi.fn(),
  };
  const byokService = {
    resolveApiKey: vi.fn(),
  };
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  let task: GenerateImageTask;

  beforeEach(() => {
    vi.clearAllMocks();
    task = new GenerateImageTask(
      leonardoService as never,
      replicateService as never,
      falService as never,
      byokService as never,
      logger as never,
    );
  });

  it('uses the Leonardo generation id returned by the provider', async () => {
    byokService.resolveApiKey.mockResolvedValue({ apiKey: 'leo-key' });
    leonardoService.generateImage.mockResolvedValue('generation-123');

    const result = await task.execute(
      {
        model: ImageTaskModel.LEONARDO,
        prompt: 'cinematic product shot',
      },
      'user-1',
      'org-1',
    );

    expect(result.success).toBe(true);
    expect(result.imageId).toBe('generation-123');
    expect(leonardoService.generateImage).toHaveBeenCalledWith(
      expect.any(String),
      {
        height: 1024,
        style: 'photorealistic',
        width: 1024,
      },
      'leo-key',
    );
  });
});
