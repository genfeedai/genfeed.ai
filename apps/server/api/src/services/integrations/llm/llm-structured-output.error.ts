import type { ILlmStructuredOutputIssue } from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';

/**
 * A model failed to produce output matching its schema, twice — once on the
 * first attempt and once after the repair prompt.
 *
 * Distinct from a plain BadRequestException on purpose: it carries the zod
 * issues so the caller (and the HTTP response) can say which fields were
 * wrong instead of "the AI failed". Never caught to substitute a template —
 * callers decide what an unusable model answer means for their surface.
 */
export class LlmStructuredOutputError extends BadRequestException {
  constructor(
    public readonly schemaName: string,
    public readonly issues: ILlmStructuredOutputIssue[],
  ) {
    // `HttpExceptionFilter` forwards `source` verbatim, so the issues reach the
    // HTTP caller as data rather than only as prose inside `detail`. Carrying
    // them nowhere would leave an API consumer with "the AI failed" again,
    // which is the whole failure mode this error exists to end.
    const title = 'Structured Output Error';
    const detail = `Model output did not match schema "${schemaName}" after one repair attempt: ${issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ')}`;

    // `detail` is what the filter puts on the response; `message` is what
    // `HttpException` exposes as `error.message`, which the services that
    // catch this error log. Without it Nest derives the message from the
    // class name and the failing fields never reach the logs.
    super({ detail, message: detail, source: { issues, schemaName }, title });
    this.name = 'LlmStructuredOutputError';
  }
}
