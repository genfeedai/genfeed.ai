import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  SignupPrefillService,
  type SignupPrefillState,
} from '@api/services/signup-prefill/signup-prefill.service';
import {
  buildSignupPrefillWorkflowDefinition,
  SIGNUP_PREFILL_ACTION_IDS,
} from '@api/services/signup-prefill/signup-prefill-workflow-definition';
import type { SignupPrefillWorkflowInput } from '@genfeedai/contracts/interfaces';
import { Injectable, type OnModuleInit } from '@nestjs/common';

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
    this.runner.registerAction(SIGNUP_PREFILL_ACTION_IDS.PREPARE, ({ input }) =>
      this.prefill.preparePrefill(input.request as SignupPrefillWorkflowInput),
    );
    this.runner.registerAction(SIGNUP_PREFILL_ACTION_IDS.SCRAPE, ({ input }) =>
      this.prefill.scrapePrefill(input.state as SignupPrefillState),
    );
    this.runner.registerAction(SIGNUP_PREFILL_ACTION_IDS.ANALYZE, ({ input }) =>
      this.prefill.analyzePrefill(input.state as SignupPrefillState),
    );
    this.runner.registerAction(
      SIGNUP_PREFILL_ACTION_IDS.DEFAULTS,
      ({ input }) =>
        this.prefill.applyPrefillDefaults(input.state as SignupPrefillState),
    );
    this.runner.registerAction(SIGNUP_PREFILL_ACTION_IDS.PROMPT, ({ input }) =>
      this.prefill.applyPrefillPrompt(input.state as SignupPrefillState),
    );
    this.runner.registerAction(SIGNUP_PREFILL_ACTION_IDS.HARNESS, ({ input }) =>
      this.prefill.applyPrefillHarness(input.state as SignupPrefillState),
    );
    this.runner.registerAction(
      SIGNUP_PREFILL_ACTION_IDS.FINALIZE,
      ({ input }) =>
        this.prefill.finalizePrefill(input.state as SignupPrefillState),
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
    await this.queue.queueSystemWorkflow(
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
