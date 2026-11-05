import { TurboProjectStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { turboProjectListStatus } from './turbo-project-list-status';

describe('turboProjectListStatus', () => {
  it.each([
    [TurboProjectStatus.DRAFT, 'idle'],
    [TurboProjectStatus.GENERATING, 'idle'],
    [TurboProjectStatus.CANCELLED, 'idle'],
    [TurboProjectStatus.REVIEWING, 'attention'],
    [TurboProjectStatus.PARTIAL_FAILURE, 'attention'],
    [TurboProjectStatus.COMPLETED, 'done'],
    [TurboProjectStatus.SCHEDULED, 'done'],
    ['reviewing', 'attention'],
  ])('shows %s as %s', (status, indicator) => {
    expect(turboProjectListStatus(status)).toBe(indicator);
  });
});
