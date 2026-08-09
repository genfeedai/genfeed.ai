import { PassThrough, Readable } from 'node:stream';
import { FFmpegStreamService } from '@files/services/ffmpeg/stream/ffmpeg-stream.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';

const childProcessMock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => childProcessMock);
vi.mock('child_process', () => childProcessMock);

vi.mock('ffmpeg-static', () => ({ default: '/usr/local/bin/ffmpeg' }));

const fsPromisesMock = vi.hoisted(() => ({
  unlink: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('fs', () => ({
  default: { promises: fsPromisesMock },
  promises: fsPromisesMock,
}));
vi.mock('node:fs', () => ({
  default: { promises: fsPromisesMock },
  promises: fsPromisesMock,
}));

import { spawn } from 'node:child_process';
import fs from 'node:fs';

type Handler = (...args: unknown[]) => void;

function createMockChildProcess() {
  const handlers: Record<string, Handler[]> = {};
  const on = (event: string, cb: Handler) => {
    if (!handlers[event]) {
      handlers[event] = [];
    }
    handlers[event].push(cb);
  };

  const proc = {
    kill: vi.fn(),
    on: vi.fn(on),
    stderr: {
      on: vi.fn((event: string, cb: Handler) => on(`stderr:${event}`, cb)),
    },
    stdin: new PassThrough(),
    stdout: new PassThrough(),
  };

  return {
    emit(event: string, ...args: unknown[]) {
      handlers[event]?.forEach((cb) => {
        cb(...args);
      });
    },
    emitStderrData(chunk: string) {
      handlers['stderr:data']?.forEach((cb) => {
        cb(Buffer.from(chunk));
      });
    },
    proc,
  };
}

describe('FFmpegStreamService', () => {
  let service: FFmpegStreamService;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegStreamService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<FFmpegStreamService>(FFmpegStreamService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processVideoStream', () => {
    it('resolves when ffmpeg exits successfully', async () => {
      const { proc, emit } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);

      const promise = service.processVideoStream('/in.mp4', '/out.mp4');
      emit('close', 0);
      emit('exit');

      await expect(promise).resolves.toBeUndefined();
      expect(mockLoggerService.log).toHaveBeenCalled();
    });

    it('rejects when ffmpeg exits with a non-zero code', async () => {
      const { proc, emit, emitStderrData } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);

      const promise = service.processVideoStream('/in.mp4', '/out.mp4');
      emitStderrData('boom');
      emit('close', 1);
      emit('exit');

      await expect(promise).rejects.toThrow(
        'FFmpeg process exited with code 1',
      );
      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('rejects when the spawned process errors', async () => {
      const { proc, emit } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);

      const promise = service.processVideoStream('/in.mp4', '/out.mp4');
      emit('error', new Error('spawn failed'));
      emit('exit');

      await expect(promise).rejects.toThrow('spawn failed');
    });

    it('adds a scale/pad filter when resize is requested', async () => {
      const { proc, emit } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);

      const promise = service.processVideoStream('/in.mp4', '/out.mp4', {
        resize: { height: 1080, width: 1920 },
      });
      emit('close', 0);
      emit('exit');
      await promise;

      const args = (spawn as Mock).mock.calls[0][1] as string[];
      const filterArg = args.find((a) => a.includes('scale=1920:1080')) ?? '';
      expect(filterArg).toContain('scale=1920:1080');
    });

    it('appends additionalArgs and a custom format', async () => {
      const { proc, emit } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);

      const promise = service.processVideoStream('/in.mp4', '/out.mp4', {
        additionalArgs: ['-extra', 'flag'],
        format: 'mov',
      });
      emit('close', 0);
      emit('exit');
      await promise;

      const args = (spawn as Mock).mock.calls[0][1] as string[];
      expect(args).toEqual(expect.arrayContaining(['-extra', 'flag']));
      expect(args).toEqual(expect.arrayContaining(['-f', 'mov']));
    });
  });

  describe('createVideoProcessingStream', () => {
    it('spawns ffmpeg reading from stdin and returns a piped output stream', () => {
      const { proc } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);

      const inputStream = Readable.from([Buffer.from('video-bytes')]);
      const { ffmpegProcess, outputStream } =
        service.createVideoProcessingStream(inputStream);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/ffmpeg',
        expect.arrayContaining(['-i', 'pipe:0', 'pipe:1']),
      );
      expect(ffmpegProcess).toBe(proc);
      expect(outputStream).toBeInstanceOf(PassThrough);
    });

    it('applies a resize filter when requested', () => {
      const { proc } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);

      const inputStream = Readable.from([Buffer.from('data')]);
      service.createVideoProcessingStream(inputStream, {
        resize: { height: 720, width: 1280 },
      });

      const args = (spawn as Mock).mock.calls[0][1] as string[];
      expect(args).toEqual(expect.arrayContaining(['-vf', 'scale=1280:720']));
    });

    it('logs an error when stderr contains an error message', () => {
      const { proc, emitStderrData } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);

      const inputStream = Readable.from([Buffer.from('data')]);
      service.createVideoProcessingStream(inputStream);
      emitStderrData('Error: something broke');

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'FFmpeg stream error',
        expect.objectContaining({ message: expect.stringContaining('Error') }),
      );
    });

    it('destroys the output stream when the ffmpeg process errors', () => {
      const { proc, emit } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);

      const inputStream = Readable.from([Buffer.from('data')]);
      const { outputStream } = service.createVideoProcessingStream(inputStream);
      // Swallow the re-emitted 'error' from destroy() so it doesn't surface
      // as an unhandled exception in this test.
      outputStream.on('error', () => {
        /* expected */
      });
      const destroySpy = vi.spyOn(outputStream, 'destroy');

      const error = new Error('pipe failed');
      emit('error', error);

      expect(destroySpy).toHaveBeenCalledWith(error);
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'FFmpeg process error',
        error,
      );
    });
  });

  describe('cleanup', () => {
    it('kills every tracked active process', async () => {
      const first = createMockChildProcess();
      const second = createMockChildProcess();
      (spawn as Mock)
        .mockReturnValueOnce(first.proc)
        .mockReturnValueOnce(second.proc);

      const firstPromise = service.processVideoStream('/a.mp4', '/a-out.mp4');
      service.processVideoStream('/b.mp4', '/b-out.mp4');

      service.cleanup();

      expect(first.proc.kill).toHaveBeenCalledWith('SIGTERM');
      expect(second.proc.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        'Cleaning up active FFmpeg process',
        expect.any(Object),
      );

      // Resolve the still-pending promise so it doesn't leak into other tests.
      first.emit('close', 0);
      first.emit('exit');
      await firstPromise;
    });
  });

  describe('mergeVideosStream', () => {
    it('writes a concat file, runs the stream merge, then removes the concat file', async () => {
      const { proc, emit } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);

      const promise = service.mergeVideosStream(
        ['/a.mp4', '/b.mp4'],
        '/out/merged.mp4',
      );
      // mergeVideosStream awaits writeFile before spawning ffmpeg, so wait
      // for the spawn call to land before driving the mock process events.
      await vi.waitFor(() => {
        expect(spawn).toHaveBeenCalled();
      });
      emit('close', 0);
      emit('exit');
      await promise;

      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('concat.txt'),
        expect.stringContaining("file '/a.mp4'"),
      );
      expect(fs.promises.unlink).toHaveBeenCalledWith(
        expect.stringContaining('concat.txt'),
      );
    });

    it('logs a warning when cleanup of the concat file fails', async () => {
      const { proc, emit } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);
      (fs.promises.unlink as Mock).mockRejectedValueOnce(
        new Error('unlink failed'),
      );

      const promise = service.mergeVideosStream(['/a.mp4'], '/out/merged.mp4');
      await vi.waitFor(() => {
        expect(spawn).toHaveBeenCalled();
      });
      emit('close', 0);
      emit('exit');
      await promise;

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        'Failed to delete concat file',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });

    it('still cleans up the concat file when the merge fails', async () => {
      const { proc, emit } = createMockChildProcess();
      (spawn as Mock).mockReturnValue(proc);

      const promise = service.mergeVideosStream(['/a.mp4'], '/out/merged.mp4');
      await vi.waitFor(() => {
        expect(spawn).toHaveBeenCalled();
      });
      emit('close', 1);
      emit('exit');

      await expect(promise).rejects.toThrow();
      expect(fs.promises.unlink).toHaveBeenCalled();
    });
  });
});
