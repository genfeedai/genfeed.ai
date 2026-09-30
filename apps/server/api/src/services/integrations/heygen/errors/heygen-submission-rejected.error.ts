import { HttpException, HttpStatus } from '@nestjs/common';

/** A payment rejection returned by the submission endpoint, never a transport error. */
export class HeyGenSubmissionRejectedError extends HttpException {
  constructor() {
    super(
      'HeyGen rejected the submission due to insufficient credit.',
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
