import { WORKFLOW_MISSING_INPUT_CODE } from '@genfeedai/contracts/constants';
import type { WorkflowMissingInput } from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';

/**
 * A workflow run was started without values for required inputs. It is raised
 * before the run is created, so no execution, credit hold or provider call
 * exists yet. `HttpExceptionFilter` answers 400 with the stable
 * `WORKFLOW_MISSING_INPUT` code and every missing input in
 * `meta.missingInputs`, so the client can ask for those values and send the
 * same request again.
 */
export class WorkflowMissingInputException extends BadRequestException {
  public readonly missingInputs: readonly WorkflowMissingInput[];

  constructor(missingInputs: readonly WorkflowMissingInput[]) {
    const names = missingInputs.map((input) => input.name).join(', ');
    const detail = `Missing required workflow input${
      missingInputs.length === 1 ? '' : 's'
    }: ${names}`;

    super({
      code: WORKFLOW_MISSING_INPUT_CODE,
      detail,
      message: detail,
      title: 'Missing required workflow input',
    });

    this.name = 'WorkflowMissingInputException';
    this.missingInputs = Object.freeze(
      missingInputs.map((input) => ({ ...input })),
    );
  }
}
