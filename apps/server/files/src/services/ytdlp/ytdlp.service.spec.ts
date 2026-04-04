import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Mocked, MockedFunction } from 'vitest';

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
    };
  }),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe('YtDlpService', () => {
  let service: YtDlpService;
  let loggerMock: Mocked<LoggerService>;
  let spawnMock: MockedFunction<typeof spawn>;
  let fsMock: Mocked<typeof fs>;

  beforeEach(async () => {
    loggerMock = {
      log: vi.fn(),
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
      const mockProcess = {
        emit: vi.fn(),
        on: vi.fn(),
      };

      spawnMock.mockReturnValue(mockProcess);
      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadAudio(url);

      // Simulate successful completion
      const closeHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      closeHandler?.(0);

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
      const mockProcess = {
        emit: vi.fn(),
        on: vi.fn(),
      };

      spawnMock.mockReturnValue(mockProcess);
      fsMock.existsSync.mockReturnValue(false);

      const promise = service.downloadAudio(url);

      // Simulate successful completion
      const closeHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      closeHandler?.(0);

      await promise;

      expect(fsMock.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('public/tmp/clips'),
        { recursive: true },
      );
    });

    it('should handle process errors', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = {
        emit: vi.fn(),
        on: vi.fn(),
      };

      spawnMock.mockReturnValue(mockProcess);
      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadAudio(url);

      // Simulate process error
      const errorHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'error',
      )?.[1];
      const error = new Error('Process failed');
      errorHandler?.(error);

      await expect(promise).rejects.toThrow('Process failed');
    });

    it('should handle non-zero exit code', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = {
        emit: vi.fn(),
        on: vi.fn(),
      };

      spawnMock.mockReturnValue(mockProcess);
      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadAudio(url);

      // Simulate non-zero exit code
      const closeHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      closeHandler?.(1);

      await expect(promise).rejects.toThrow('yt-dlp exited with code 1');
    });

    it('should generate unique output filenames with timestamp', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = {
        emit: vi.fn(),
        on: vi.fn(),
      };

      spawnMock.mockReturnValue(mockProcess);
      fsMock.existsSync.mockReturnValue(true);

      const promise1 = service.downloadAudio(url);
      const promise2 = service.downloadAudio(url);

      // Simulate successful completion for both
      const closeHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      closeHandler?.(0);

      const result1 = await promise1;
      const result2 = await promise2;

      // Results should have different timestamps
      expect(result1).not.toBe(result2);
      expect(result1).toMatch(/\.mp3$/);
      expect(result2).toMatch(/\.mp3$/);
    });

    it('should log the yt-dlp command with correct arguments', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = {
        emit: vi.fn(),
        on: vi.fn(),
      };

      spawnMock.mockReturnValue(mockProcess);
      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadAudio(url);

      // Simulate successful completion
      const closeHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];
      closeHandler?.(0);

      await promise;

      expect(loggerMock.log).toHaveBeenCalledWith(
        'yt-dlp -x --audio-format mp3 -o ' +
          expect.stringContaining('public/tmp/clips/') +
          ' ' +
          url,
      );
    });
  });
});
