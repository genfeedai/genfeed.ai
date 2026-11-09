import { describe, expect, it } from 'vitest';
import { ContentRunStatus } from '../../enums/content-skill.enum';
import { BRAND_REMIX_PHASE_RUN_STATUS } from './brand-remix-run.contract';

describe('BRAND_REMIX_PHASE_RUN_STATUS', () => {
  it.each([
    ['prefilled', ContentRunStatus.RUNNING],
    ['generating', ContentRunStatus.RUNNING],
    ['partially_ready', ContentRunStatus.RUNNING],
    ['ready_for_review', ContentRunStatus.COMPLETED],
    ['in_review', ContentRunStatus.COMPLETED],
    ['approved', ContentRunStatus.COMPLETED],
    ['paid_draft_creating', ContentRunStatus.RUNNING],
    ['paid_draft_ready', ContentRunStatus.COMPLETED],
    ['failed', ContentRunStatus.FAILED],
  ] as const)('phase %s shows as %s', (phase, expected) => {
    expect(BRAND_REMIX_PHASE_RUN_STATUS[phase]).toBe(expected);
  });
});
