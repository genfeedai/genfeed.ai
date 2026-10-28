import { EventEmitter } from 'node:events';
import {
  distanceToNearest,
  renderClickTrack,
} from '@files/services/ffmpeg/helpers/beat-grid.fixture';
import { FFmpegBeatDetectionService } from '@files/services/ffmpeg/services/ffmpeg-beat-detection.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

vi.mock('@files/helpers/utils/security/security.util', () => ({
  SecurityUtil: {
    validateFileExists: vi.fn().mockResolvedValue(undefined),
    validateFileExtension: vi.fn(),
    validateFilePath: vi.fn((p: string) => p),
  },
}));

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

/** An ffmpeg process that streams `pcm` on stdout, then exits with `code`. */
function decoderProcess(pcm: Buffer, code = 0, stderr = '') {
  const process = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    stdout: EventEmitter;
  };
  process.stdout = new EventEmitter();
  process.stderr = new EventEmitter();
  queueMicrotask(() => {
    // Split mid-sample so chunk boundaries are exercised.
    const middle = Math.floor(pcm.length / 2) + 1;
    process.stdout.emit('data', pcm.subarray(0, middle));
    process.stdout.emit('data', pcm.subarray(middle));
    if (stderr) process.stderr.emit('data', Buffer.from(stderr));
    process.emit('close', code);
  });
  return process;
}

function toPcm(samples: Float32Array): Buffer {
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
}

describe('FFmpegBeatDetectionService', () => {
  let service: FFmpegBeatDetectionService;
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegBeatDetectionService,
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();
    service = module.get(FFmpegBeatDetectionService);
  });

  it('decodes to mono PCM and returns the beat grid of the audio', async () => {
    const { beats, samples } = renderClickTrack({
      offsetSeconds: 0.2,
      seconds: 30,
      tempo: 120,
    });
    spawnMock.mockReturnValue(decoderProcess(toPcm(samples)));

    const result = await service.analyzeBeat('/tmp/music.mp3');

    const [command, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(command).toBe('ffmpeg');
    expect(args).toEqual(
      expect.arrayContaining(['-ac', '1', '-ar', '22050', '-f', 'f32le']),
    );
    expect(args).toContain('/tmp/music.mp3');
    expect(result?.tempo).toBeCloseTo(120, 0);
    expect(result?.beatCount).toBe(result?.beatTimestamps.length);
    for (const beat of result?.beatTimestamps ?? []) {
      expect(distanceToNearest(beat, beats)).toBeLessThan(0.035);
    }
  });

  it('returns null for audio without a pulse', async () => {
    spawnMock.mockReturnValue(
      decoderProcess(toPcm(new Float32Array(22_050 * 5))),
    );
    await expect(service.analyzeBeat('/tmp/silence.mp3')).resolves.toBeNull();
  });

  it('fails with the decoder output when ffmpeg cannot read the file', async () => {
    spawnMock.mockReturnValue(
      decoderProcess(Buffer.alloc(0), 1, 'Invalid data found'),
    );
    await expect(service.analyzeBeat('/tmp/broken.mp3')).rejects.toThrow(
      'Invalid data found',
    );
  });

  it('propagates path validation errors before spawning any process', async () => {
    const { SecurityUtil } = await import(
      '@files/helpers/utils/security/security.util'
    );
    (
      SecurityUtil.validateFileExists as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error('file missing'));

    await expect(service.analyzeBeat('/tmp/missing.mp3')).rejects.toThrow(
      'file missing',
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
