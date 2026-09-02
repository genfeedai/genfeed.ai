import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import { YT_DLP_PROCESS_TIMEOUT_MS } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
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
    readdirSync: vi.fn(() => []),
    unlinkSync: vi.fn(),
  },
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
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

      expect(spawnMock).toHaveBeenCalledWith(
        'yt-dlp',
        [
          '-x',
          '--audio-format',
          'mp3',
          '-o',
          expect.stringContaining('public/tmp/clips/'),
          url,
        ],
        {
          detached: process.platform !== 'win32',
        },
      );
      expect(result).toMatch(/\.mp3$/);
      expect(loggerMock.log).toHaveBeenCalledWith(
        expect.stringContaining('yt-dlp'),
        { operation: 'audio' },
      );
    });

    it('should create output directory if it does not exist', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = useMockProcess(spawnMock);

      // First call checks the output directory (missing), second call
      // checks the produced output file (present) once yt-dlp exits.
      fsMock.existsSync.mockReturnValueOnce(false).mockReturnValue(true);

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

    it('should log acquisition without exposing the source URL', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = useMockProcess(spawnMock);

      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadAudio(url);

      // Simulate successful completion
      closeProcess(mockProcess, 0);

      await promise;

      expect(loggerMock.log).toHaveBeenCalledWith(
        'yt-dlp media acquisition started',
        { operation: 'audio' },
      );
      expect(JSON.stringify(loggerMock.log.mock.calls)).not.toContain(url);
    });

    it('removes %(ext)s intermediate siblings after a failed download', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const mockProcess = useMockProcess(spawnMock);
      const dateNowMock = vi
        .spyOn(Date, 'now')
        .mockReturnValue(1_700_000_000_000);
      const stem = '1700000000000';
      const clipsDir = path.join(FILES_TMP_ROOT, 'clips');

      fsMock.existsSync.mockReturnValue(true);
      fsMock.readdirSync.mockReturnValue([
        `${stem}.webm`,
        `${stem}.webm.part`,
        `${stem}.mp3.part`,
        'other-file.mp3',
      ] as unknown as ReturnType<typeof fs.readdirSync>);

      const promise = service.downloadAudio(url);
      closeProcess(mockProcess, 1);

      await expect(promise).rejects.toThrow('yt-dlp exited with code 1');
      expect(fsMock.unlinkSync).toHaveBeenCalledWith(
        path.join(clipsDir, `${stem}.mp3`),
      );
      expect(fsMock.unlinkSync).toHaveBeenCalledWith(
        path.join(clipsDir, `${stem}.webm`),
      );
      expect(fsMock.unlinkSync).toHaveBeenCalledWith(
        path.join(clipsDir, `${stem}.webm.part`),
      );
      expect(fsMock.unlinkSync).toHaveBeenCalledWith(
        path.join(clipsDir, `${stem}.mp3.part`),
      );
      expect(fsMock.unlinkSync).not.toHaveBeenCalledWith(
        path.join(clipsDir, 'other-file.mp3'),
      );
      dateNowMock.mockRestore();
    });
  });

  describe('downloadVideo', () => {
    it('should download a 720p mp4 video to a custom output path', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const outputPath = path.join(FILES_TMP_ROOT, 'nested', 'video.mp4');
      const mockProcess = useMockProcess(spawnMock);
      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadVideo(url, outputPath);

      closeProcess(mockProcess, 0);

      await expect(promise).resolves.toBe(outputPath);
      expect(spawnMock).toHaveBeenCalledWith(
        'yt-dlp',
        [
          '--no-playlist',
          '--socket-timeout',
          '30',
          '--max-filesize',
          '10G',
          '-f',
          'bestvideo[height<=720]+bestaudio/best[height<=720]',
          '--merge-output-format',
          'mp4',
          '-o',
          outputPath,
          url,
        ],
        {
          detached: process.platform !== 'win32',
        },
      );
    });

    it('rejects an output path outside the files temp root before spawning', () => {
      // downloadVideo validates the containment path synchronously before
      // returning a promise, so the guard surfaces as a thrown error rather
      // than a promise rejection.
      expect(() =>
        service.downloadVideo(
          'https://youtube.com/watch?v=test',
          '/etc/escaped.mp4',
        ),
      ).toThrow(BadRequestException);

      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('kills a timed-out process and removes partial output after close', async () => {
      vi.useFakeTimers();
      const outputPath = path.join(FILES_TMP_ROOT, 'genfeed', 'video.mp4');
      const mockProcess = useMockProcess(spawnMock);
      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadVideo(
        'https://youtube.com/watch?v=test',
        outputPath,
      );
      const settled = vi.fn();
      void promise.then(settled, settled);
      const rejection = expect(promise).rejects.toThrow('yt-dlp timed out');
      await vi.advanceTimersByTimeAsync(YT_DLP_PROCESS_TIMEOUT_MS);

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(settled).not.toHaveBeenCalled();
      expect(fsMock.unlinkSync).not.toHaveBeenCalled();

      closeProcess(mockProcess, 137);

      await rejection;
      expect(settled).toHaveBeenCalledOnce();
      expect(fsMock.unlinkSync).toHaveBeenCalledWith(outputPath);
      expect(fsMock.unlinkSync).toHaveBeenCalledWith(`${outputPath}.part`);
      vi.useRealTimers();
    });

    it('removes partial output after a non-zero exit', async () => {
      const outputPath = path.join(FILES_TMP_ROOT, 'genfeed', 'video.mp4');
      const mockProcess = useMockProcess(spawnMock);
      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadVideo(
        'https://youtube.com/watch?v=test',
        outputPath,
      );
      closeProcess(mockProcess, 1);

      await expect(promise).rejects.toThrow('yt-dlp exited with code 1');
      expect(fsMock.unlinkSync).toHaveBeenCalledWith(outputPath);
      expect(fsMock.unlinkSync).toHaveBeenCalledWith(`${outputPath}.part`);
    });

    it('rejects a successful process that did not create an output file', async () => {
      const outputPath = path.join(FILES_TMP_ROOT, 'genfeed', 'video.mp4');
      const mockProcess = useMockProcess(spawnMock);
      fsMock.existsSync
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValue(false);

      const promise = service.downloadVideo(
        'https://youtube.com/watch?v=test',
        outputPath,
      );
      closeProcess(mockProcess, 0);

      await expect(promise).rejects.toThrow('without creating an output file');
    });
  });

  describe('downloadAudioLowestQuality', () => {
    it('should download the lowest quality mp3 to the requested output path', async () => {
      const url = 'https://youtube.com/watch?v=test';
      const outputPath = path.join(FILES_TMP_ROOT, 'nested', 'audio.mp3');
      const mockProcess = useMockProcess(spawnMock);
      fsMock.existsSync.mockReturnValue(true);

      const promise = service.downloadAudioLowestQuality(url, outputPath);

      closeProcess(mockProcess, 0);

      await expect(promise).resolves.toBe(outputPath);
      expect(spawnMock).toHaveBeenCalledWith(
        'yt-dlp',
        [
          '-x',
          '--audio-format',
          'mp3',
          '--audio-quality',
          '9',
          '-o',
          outputPath,
          url,
        ],
        {
          detached: process.platform !== 'win32',
        },
      );
    });
  });
});
