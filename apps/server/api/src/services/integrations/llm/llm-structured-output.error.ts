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
    super(
      `Model output did not match schema "${schemaName}" after one repair attempt: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`,
    );
    this.name = 'LlmStructuredOutputError';
  }
}
