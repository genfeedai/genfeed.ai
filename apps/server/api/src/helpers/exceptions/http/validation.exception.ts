import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  constructor(message: string, field?: string, value?: unknown) {
    super(
      {
        detail: message,
        title: 'Validation Error',
        ...(field && {
          source: {
            pointer: `/data/attributes/${field}`,
            ...(value !== undefined && { parameter: value }),
          },
        }),
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
