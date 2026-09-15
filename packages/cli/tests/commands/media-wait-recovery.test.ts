import { IngredientStatus } from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createImage: vi.fn(),
  createVideo: vi.fn(),
  getImage: vi.fn(),
  getVideo: vi.fn(),
  printJson: vi.fn(),
}));
vi.mock('@/api/images', () => ({ createImage: mocks.createImage, getImage: mocks.getImage }));
vi.mock('@/api/videos', () => ({ createVideo: mocks.createVideo, getVideo: mocks.getVideo }));
vi.mock('@/api/client', () => ({ requireAuth: vi.fn().mockResolvedValue('test-key') }));
vi.mock('@/config/store', () => ({
  getActiveBrand: vi.fn().mockResolvedValue('brand-1'),
  getActiveProfile: vi.fn().mockResolvedValue({ profile: { defaults: {} } }),
  getApiKey: vi.fn().mockResolvedValue('test-key'),
  getApiUrl: vi.fn().mockResolvedValue('https://api.example.test/v1'),
}));
vi.mock('@/ui/theme', () => ({ formatLabel: vi.fn(), print: vi.fn(), printJson: mocks.printJson }));
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({ disconnect: vi.fn(), on: vi.fn(), removeAllListeners: vi.fn() })),
}));
vi.mock('@/utils/errors', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/utils/errors')>();
  return {
    ...original,
    handleError: (error: unknown) => {
      throw error;
    },
  };
});

const processing = {
  id: 'original-media',
  model: 'test-model',
  status: IngredientStatus.PROCESSING,
};
const generated = {
  ...processing,
  status: IngredientStatus.GENERATED,
  url: 'https://cdn.example.test/original',
};

describe.each(['image', 'video'] as const)('%s generation command recovery', (kind) => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  async function command() {
    return kind === 'image'
      ? (await import('@/commands/generate/image')).imageCommand
      : (await import('@/commands/generate/video')).videoCommand;
  }

  it('creates once and recovers the original result without socket events', async () => {
    const create = kind === 'image' ? mocks.createImage : mocks.createVideo;
    const get = kind === 'image' ? mocks.getImage : mocks.getVideo;
    create.mockResolvedValue(processing);
    get.mockResolvedValueOnce(processing).mockResolvedValue(generated);
    const selectedCommand = await command();
    const promise = selectedCommand.parseAsync(['a landscape', '--json'], { from: 'user' });
    await vi.advanceTimersByTimeAsync(2000);
    await promise;
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', text: 'a landscape' })
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith('original-media', expect.any(AbortSignal));
    expect(get.mock.calls[0]?.[1].aborted).toBe(true);
    expect(mocks.printJson).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'original-media',
        status: IngredientStatus.GENERATED,
        url: generated.url,
      })
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no-wait as one create with no observation', async () => {
    const create = kind === 'image' ? mocks.createImage : mocks.createVideo;
    const get = kind === 'image' ? mocks.getImage : mocks.getVideo;
    create.mockResolvedValue(processing);
    await (await command()).parseAsync(['a landscape', '--no-wait', '--json'], { from: 'user' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    expect(mocks.printJson).toHaveBeenCalledWith({
      id: 'original-media',
      status: IngredientStatus.PROCESSING,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
