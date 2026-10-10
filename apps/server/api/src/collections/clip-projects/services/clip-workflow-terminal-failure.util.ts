import type { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { SystemWorkflowTerminalFailureRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { readRecord } from '@genfeedai/utils/data/extract.util';

/**
 * Last resort for the Clips analysis and factory workflows (#6655). Reads only
 * the project, tenant and attempt identifiers from the queued job, so it still
 * works when the job payload is what failed validation.
 */
export async function settleClipWorkflowFailure(
  clipProjects: ClipProjectsService,
  request: SystemWorkflowTerminalFailureRequest,
): Promise<void> {
  const job = readRecord(request.inputValues.job);
  const projectId = job.projectId;
  if (
    typeof projectId !== 'string' ||
    !projectId ||
    job.orgId !== request.organizationId
  ) {
    throw new Error(
      'Clip workflow terminal failure has no project for its tenant',
    );
  }
  const source = readRecord(job.source);
  const attempt =
    typeof source.fingerprint === 'string' &&
    typeof source.retryCount === 'number'
      ? { fingerprint: source.fingerprint, retryCount: source.retryCount }
      : undefined;
  await clipProjects.settleInFlightFailure(
    projectId,
    request.organizationId,
    attempt,
  );
}
