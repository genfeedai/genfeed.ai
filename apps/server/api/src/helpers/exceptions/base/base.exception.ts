import { HttpException, HttpStatus } from '@nestjs/common';

export type ExceptionMeta = Record<string, unknown>;

export abstract class BaseException extends HttpException {
  protected constructor(
    title: string,
    detail: string,
    status: HttpStatus,
    code: string,
    meta?: ExceptionMeta,
  ) {
    super(
      {
        code,
        detail,
        status,
        timestamp: new Date().toISOString(),
        title,
        ...(meta && { meta }),
      },
      status,
    );
  }
}
