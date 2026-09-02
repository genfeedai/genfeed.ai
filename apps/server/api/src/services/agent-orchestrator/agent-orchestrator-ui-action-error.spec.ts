import {
  rethrowUiActionError,
  throwFailedUiActionResult,
} from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-error';
import { ErrorCode } from '@genfeedai/contracts';
import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';

describe('throwFailedUiActionResult validation mapping', () => {
  it('maps a 400 validation failure to the standard validation 4xx', () => {
    expect(() =>
      throwFailedUiActionResult(
        'Request failed with status code 400: first_frame_image is required',
        'Failed to generate video.',
      ),
    ).toThrow(HttpException);

    try {
      throwFailedUiActionResult(
        'Request failed with status code 400: first_frame_image is required',
        'Failed to generate video.',
      );
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(httpError.getResponse()).toEqual(
        expect.objectContaining({
          code: ErrorCode.VALIDATION_FAILED,
          detail: 'first_frame_image is required',
          status: HttpStatus.BAD_REQUEST,
          title: 'Validation failed',
        }),
      );
    }
  });

  it('does not return provider JSON payloads on a 400', () => {
    try {
      throwFailedUiActionResult(
        'Request failed with status code 400: {"prediction":{"id":"abc"},"error":"input invalid"}',
        'Failed to generate video.',
      );
    } catch (error: unknown) {
      const serialized = JSON.stringify((error as HttpException).getResponse());
      expect(serialized).not.toContain('prediction');
      expect(serialized).not.toContain('"id":"abc"');
    }
  });
});

describe('throwFailedUiActionResult image result mapping', () => {
  const safeResultError = 'Image generation finished without a usable CDN URL.';

  it('maps a known unusable image result to a structured upstream failure', () => {
    try {
      throwFailedUiActionResult(safeResultError, 'Failed to generate image.');
      throw new Error('expected image result error');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      expect(error).not.toBeInstanceOf(InternalServerErrorException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(httpError.getResponse()).toEqual(
        expect.objectContaining({
          code: ErrorCode.SERVICE_UNAVAILABLE,
          detail: safeResultError,
          status: HttpStatus.BAD_GATEWAY,
          title: 'Generation result unavailable',
        }),
      );
    }
  });

  it('recovers the known image result category from an existing generic 500', () => {
    try {
      rethrowUiActionError(
        new InternalServerErrorException(
          `Failed to respond to UI action: 500 - ${safeResultError}`,
        ),
      );
      throw new Error('expected image result error');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      expect(error).not.toBeInstanceOf(InternalServerErrorException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      expect(httpError.getResponse()).toEqual(
        expect.objectContaining({ detail: safeResultError }),
      );
    }
  });
});

describe('rethrowUiActionError validation mapping', () => {
  it('preserves an existing 400 HttpException', () => {
    const validationError = new HttpException(
      {
        detail: 'first_frame_image is required',
        title: 'Validation failed',
      },
      HttpStatus.BAD_REQUEST,
    );

    try {
      rethrowUiActionError(validationError);
      throw new Error('expected validation error');
    } catch (error: unknown) {
      expect(error).toBe(validationError);
    }
  });

  it('maps a wrapped 400 Error onto the standard validation 4xx', () => {
    try {
      rethrowUiActionError(
        new Error(
          'Request failed with status code 400: first_frame_image is required',
        ),
      );
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      expect(error).not.toBeInstanceOf(InternalServerErrorException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(httpError.getResponse()).toEqual(
        expect.objectContaining({
          detail: 'first_frame_image is required',
          title: 'Validation failed',
        }),
      );
    }
  });
});
