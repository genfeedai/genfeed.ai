import { TurboProjectStatus } from '@genfeedai/contracts';
import type { ThreadListStatus } from '@genfeedai/props/ui/lists/thread-list.props';

/** Reviewing and failed projects wait on the creator; finished ones are done. */
export function turboProjectListStatus(
  status: TurboProjectStatus | string,
): ThreadListStatus {
  switch (String(status).toUpperCase()) {
    case TurboProjectStatus.REVIEWING:
    case TurboProjectStatus.PARTIAL_FAILURE:
      return 'attention';
    case TurboProjectStatus.COMPLETED:
    case TurboProjectStatus.SCHEDULED:
      return 'done';
    default:
      return 'idle';
  }
}
