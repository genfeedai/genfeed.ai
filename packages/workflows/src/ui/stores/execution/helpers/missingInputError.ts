import { isRecord } from '@genfeedai/contracts/constants/type-guards.constant';
import { WORKFLOW_MISSING_INPUT_CODE } from '@genfeedai/contracts/constants/workflow-missing-input.constant';
import type { WorkflowMissingInput } from '@genfeedai/contracts/interfaces';

const MAX_MISSING_INPUTS = 50;

function readMissingInput(value: unknown): WorkflowMissingInput | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name) {
    return null;
  }

  return {
    ...(typeof value.description === 'string' && value.description
      ? { description: value.description }
      : {}),
    label:
      typeof value.label === 'string' && value.label ? value.label : value.name,
    name: value.name,
    type: typeof value.type === 'string' && value.type ? value.type : 'text',
    ...(isRecord(value.validation) ? { validation: value.validation } : {}),
  };
}

/**
 * The JSON:API error document behind a failed request. The fetch client keeps
 * it on `error.data`; the axios services reject with the document itself
 * (`errors` member) or carry it on `error.response.data`.
 */
function readErrorBody(error: unknown): unknown {
  if (!isRecord(error)) {
    return undefined;
  }
  if (Array.isArray(error.errors)) {
    return error;
  }
  if (isRecord(error.data)) {
    return error.data;
  }

  return isRecord(error.response) ? error.response.data : undefined;
}

/**
 * The inputs a rejected run reports missing, or `null` when the failure is any
 * other error. The API answers 400 with the stable `WORKFLOW_MISSING_INPUT`
 * code and lists every missing input in the first JSON:API error's
 * `meta.missingInputs`; the HTTP client keeps that body on `error.data`.
 */
export function readMissingWorkflowInputs(
  error: unknown,
): WorkflowMissingInput[] | null {
  const body = readErrorBody(error);
  const members =
    isRecord(body) && Array.isArray(body.errors) ? body.errors : [];
  const member = members.find(
    (candidate) =>
      isRecord(candidate) && candidate.code === WORKFLOW_MISSING_INPUT_CODE,
  );
  const listed =
    isRecord(member) && isRecord(member.meta) ? member.meta.missingInputs : [];
  if (!Array.isArray(listed)) {
    return null;
  }

  const missingInputs = listed
    .slice(0, MAX_MISSING_INPUTS)
    .map(readMissingInput)
    .filter((input): input is WorkflowMissingInput => input !== null);

  return missingInputs.length > 0 ? missingInputs : null;
}
