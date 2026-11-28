import type { ResearchScanLibrary } from '@genfeedai/contracts/interfaces';
import { HttpException, HttpStatus } from '@nestjs/common';

const RESEARCH_SCAN_LIMIT_REACHED = 'research_scan_limit_reached';

/**
 * What the error response carries in `meta`, as primitives the web app's
 * bounded readers accept (`getJsonApiErrorMetaNumber`, `...Boolean`).
 */
export interface ResearchScanLimitMeta {
  /** Whether the organization is on a plan, so the UI knows to offer one. */
  hasPlan: boolean;
  maxScans: number;
  /** Epoch milliseconds the next scan opens. */
  nextAvailableAtMs: number;
  windowMs: number;
}

/**
 * The organization used the scans its plan allows in the window. Raised before
 * any run starts. A scan limit is a rate limit, so it answers 429.
 */
export class ResearchScanLimitReachedException extends HttpException {
  readonly library: ResearchScanLibrary;
  readonly meta: ResearchScanLimitMeta;
  readonly nextAvailableAt: Date;

  constructor(input: {
    hasPlan: boolean;
    library: ResearchScanLibrary;
    limit: { maxScans: number; windowMs: number };
    nextAvailableAt: Date;
  }) {
    super(
      {
        code: RESEARCH_SCAN_LIMIT_REACHED,
        detail: `All ${input.limit.maxScans} ${input.library} scans in this window are used. The next one opens at ${input.nextAvailableAt.toISOString()}.`,
        title: 'Scan limit reached',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.library = input.library;
    this.nextAvailableAt = input.nextAvailableAt;
    this.meta = {
      hasPlan: input.hasPlan,
      maxScans: input.limit.maxScans,
      nextAvailableAtMs: input.nextAvailableAt.getTime(),
      windowMs: input.limit.windowMs,
    };
  }
}
