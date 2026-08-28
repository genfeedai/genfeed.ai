import {
  buildSignupPrefillWorkflowDefinition,
  SIGNUP_PREFILL_ACTION_IDS,
} from '@api/services/signup-prefill/signup-prefill-workflow-definition';
import type { SignupPrefillWorkflowInput } from '@genfeedai/interfaces';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import { SignupPrefillService } from '@server/services/signup-prefill/signup-prefill.service';

export function signupPrefillJobId(userId: string): string {
  return `signup-prefill-${userId}`;
}

@Injectable()
export class SignupPrefillWorkflowService implements OnModuleInit {
  constructor(
    private readonly prefill: SignupPrefillService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(SIGNUP_PREFILL_ACTION_IDS.EXECUTE, ({ input }) =>
      this.prefill.prefillBrand(input.request as SignupPrefillWorkflowInput),
    );
    this.runner.registerAction(
      SIGNUP_PREFILL_ACTION_IDS.FAIL,
      async ({ input }) => {
        const request = input.request as SignupPrefillWorkflowInput;
        await this.prefill.markPrefillFailed(
          request.brandId,
          request.organizationId,
        );
        return { brandId: request.brandId, status: 'failed' };
      },
    );
    this.runner.registerWorkflow(buildSignupPrefillWorkflowDefinition());
  }

  async enqueuePrefill(request: SignupPrefillWorkflowInput): Promise<void> {
    const definition = buildSignupPrefillWorkflowDefinition();
    await this.queue.queueSystemWorkflowDefinition(
      definition,
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'signup',
        userId: request.userId,
      },
      signupPrefillJobId(request.userId),
      { attempts: 3, replaceTerminalJob: true },
    );
  }
}
