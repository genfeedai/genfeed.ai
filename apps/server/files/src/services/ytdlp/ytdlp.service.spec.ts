import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Mock, Mocked, MockedFunction } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const events: Record<string, (...args: unknown[]) => void> = {};
    return {
      emit: (event: string, ...args: unknown[]) => {
        if (events[event]) {
          events[event](...args);
        }
      },
      on: (event: string, cb: (...args: unknown[]) => void) => {
        events[event] = cb;
      },
      kill: vi.fn(),
    };
  }),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

type ProcessHandler = (...args: unknown[]) => void;

type MockProcess = {
  emit: Mock<(event: string, ...args: unknown[]) => void>;
  kill: Mock<(signal: NodeJS.Signals) => boolean>;
  on: Mock<(event: string, cb: ProcessHandler) => void>;
};

function createMockProcess(): MockProcess {
  const events: Record<string, ProcessHandler> = {};

  return {
    emit: vi.fn((event: string, ...args: unknown[]) => {
      events[event]?.(...args);
    }),
    kill: vi.fn(() => true),
    on: vi.fn((event: string, cb: ProcessHandler) => {
      events[event] = cb;
    }),
  };
}

function useMockProcess(spawnMock: MockedFunction<typeof spawn>): MockProcess {
  const mockProcess = createMockProcess();
  spawnMock.mockReturnValue(mockProcess as unknown as ReturnType<typeof spawn>);
  return mockProcess;
}

function closeProcess(mockProcess: MockProcess, code: number): void {
  const closeHandler = mockProcess.on.mock.calls.find(
    (call) => call[0] === 'close',
  )?.[1];
  closeHandler?.(code);
}

function failProcess(mockProcess: MockProcess, error: Error): void {
  const errorHandler = mockProcess.on.mock.calls.find(
    (call) => call[0] === 'error',
  )?.[1];
  errorHandler?.(error);
}

describe('YtDlpService', () => {
  let service: YtDlpService;
  let loggerMock: Mocked<LoggerService>;
  let spawnMock: MockedFunction<typeof spawn>;
  let fsMock: Mocked<typeof fs>;

  beforeEach(async () => {
    loggerMock = {
      log: vi.fn(),
      warn: vi.fn(),
    };

    spawnMock = spawn as MockedFunction<typeof spawn>;
    fsMock = fs as Mocked<typeof fs>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YtDlpService,
        { provide: LoggerService, useValue: loggerMock },
      ],
    }).compile();

    service = module.get<YtDlpService>(YtDlpService);

    // Reset all mocks
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('downloadAudio', () => {
    it('should download audio successfully', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = useMockProcess(spawnMock);

      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadAudio(url);

      // Simulate successful completion
      closeProcess(mockProcess, 0);

      const result = await promise;

      expect(spawnMock).toHaveBeenCalledWith('yt-dlp', [
        '-x',
        '--audio-format',
        'mp3',
        '-o',
        expect.stringContaining('public/tmp/clips/'),
        url,
      ]);
      expect(result).toMatch(/\.mp3$/);
      expect(loggerMock.log).toHaveBeenCalledWith(
        expect.stringContaining('yt-dlp'),
      );
    });

    it('should create output directory if it does not exist', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = useMockProcess(spawnMock);

      fsMock.existsSync.mockReturnValue(false);

      const promise = service.downloadAudio(url);

      // Simulate successful completion
      closeProcess(mockProcess, 0);

      await promise;

      expect(fsMock.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('public/tmp/clips'),
        { recursive: true },
      );
    });

    it('should handle process errors', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = useMockProcess(spawnMock);

      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadAudio(url);

      // Simulate process error
      const error = new Error('Process failed');
      failProcess(mockProcess, error);

      await expect(promise).rejects.toThrow('Process failed');
    });

    it('should handle non-zero exit code', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = useMockProcess(spawnMock);

      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadAudio(url);

      // Simulate non-zero exit code
      closeProcess(mockProcess, 1);

      await expect(promise).rejects.toThrow('yt-dlp exited with code 1');
    });

    it('should generate unique output filenames with timestamp', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const firstProcess = createMockProcess();
      const secondProcess = createMockProcess();
      const dateNowMock = vi
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1001);

      spawnMock
        .mockReturnValueOnce(
          firstProcess as unknown as ReturnType<typeof spawn>,
        )
        .mockReturnValueOnce(
          secondProcess as unknown as ReturnType<typeof spawn>,
        );
      fsMock.existsSync.mockReturnValue(true);

      const promise1 = service.downloadAudio(url);
      const promise2 = service.downloadAudio(url);

      // Simulate successful completion for both
      closeProcess(firstProcess, 0);
      closeProcess(secondProcess, 0);

      const result1 = await promise1;
      const result2 = await promise2;

      // Results should have different timestamps
      expect(result1).not.toBe(result2);
      expect(result1).toMatch(/\.mp3$/);
      expect(result2).toMatch(/\.mp3$/);
      dateNowMock.mockRestore();
    });

    it('should log the yt-dlp command with correct arguments', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = useMockProcess(spawnMock);

      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadAudio(url);

      // Simulate successful completion
      closeProcess(mockProcess, 0);

      await promise;

      const loggedCommand = loggerMock.log.mock.calls[0]?.[0];
      expect(loggedCommand).toEqual(
        expect.stringContaining('yt-dlp -x --audio-format mp3 -o '),
      );
      expect(loggedCommand).toEqual(
        expect.stringContaining('public/tmp/clips/'),
      );
      expect(loggedCommand).toEqual(expect.stringContaining(` ${url}`));
    });
  });

  describe('downloadVideo', () => {
    it('should download a 720p mp4 video to a custom output path', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const outputPath = '/tmp/genfeed/video.mp4';
      const mockProcess = useMockProcess(spawnMock);
      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadVideo(url, outputPath);

      closeProcess(mockProcess, 0);

      await expect(promise).resolves.toBe(outputPath);
      expect(spawnMock).toHaveBeenCalledWith('yt-dlp', [
        '--no-playlist',
        '--socket-timeout',
        '30',
        '--max-filesize',
        '500M',
        '-f',
        'bestvideo[height<=720]+bestaudio/best[height<=720]',
        '--merge-output-format',
        'mp4',
        '-o',
        outputPath,
        url,
      ]);
    });

    it('kills a timed-out process and removes partial output', async () => {
      vi.useFakeTimers();
      const outputPath = '/tmp/genfeed/video.mp4';
      const mockProcess = useMockProcess(spawnMock);
      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadVideo(
        'https://youtube.com/watch?v=test',
        outputPath,
      );
      const rejection = expect(promise).rejects.toThrow('yt-dlp timed out');
      await vi.advanceTimersByTimeAsync(5 * 60_000);

      await rejection;
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(fsMock.unlinkSync).toHaveBeenCalledWith(outputPath);
      expect(fsMock.unlinkSync).toHaveBeenCalledWith(`${outputPath}.part`);
      vi.useRealTimers();
    });
  });

  describe('downloadAudioLowestQuality', () => {
    it('should download the lowest quality mp3 to the requested output path', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const outputPath = '/tmp/genfeed/audio.mp3';
      const mockProcess = useMockProcess(spawnMock);
      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadAudioLowestQuality(url, outputPath);

      closeProcess(mockProcess, 0);

      await expect(promise).resolves.toBe(outputPath);
      expect(spawnMock).toHaveBeenCalledWith('yt-dlp', [
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '9',
        '-o',
        outputPath,
        url,
      ]);
    });
  });
});
