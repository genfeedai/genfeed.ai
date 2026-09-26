import {
  OcrEngineUnavailableError,
  TesseractOcrService,
} from '@files/services/perception/tesseract-ocr.service';
import type { LoggerService } from '@libs/logger/logger.service';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({ execFile: execFileMock }));

function makeService() {
  const logger = { warn: vi.fn() };
  return {
    logger,
    service: new TesseractOcrService(logger as unknown as LoggerService),
  };
}

describe('TesseractOcrService', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('runs tesseract in sparse-text mode and normalizes its output', async () => {
    execFileMock.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (error: null, result: { stdout: string }) => void,
      ) => callback(null, { stdout: '\n  LAUNCH   DAY \n\n\n50% OFF\n\f' }),
    );
    const { service } = makeService();

    await expect(service.recognize('/tmp/frame.jpg')).resolves.toBe(
      'LAUNCH DAY\n50% OFF',
    );
    expect(execFileMock).toHaveBeenCalledWith(
      'tesseract',
      ['/tmp/frame.jpg', 'stdout', '-l', 'eng', '--psm', '11'],
      expect.objectContaining({ timeout: 30_000 }),
      expect.any(Function),
    );
  });

  it('reports a missing binary as an unavailable engine', async () => {
    execFileMock.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (error: NodeJS.ErrnoException) => void,
      ) =>
        callback(
          Object.assign(new Error('spawn tesseract ENOENT'), {
            code: 'ENOENT',
          }),
        ),
    );
    const { service } = makeService();

    await expect(service.recognize('/tmp/frame.jpg')).rejects.toBeInstanceOf(
      OcrEngineUnavailableError,
    );
  });

  it('rethrows other failures after logging them', async () => {
    execFileMock.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (error: Error) => void,
      ) => callback(new Error('bad image')),
    );
    const { logger, service } = makeService();

    await expect(service.recognize('/tmp/frame.jpg')).rejects.toThrow(
      'bad image',
    );
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('caps very long OCR text', () => {
    expect(TesseractOcrService.normalize('x'.repeat(5_000))).toHaveLength(
      2_000,
    );
  });
});
