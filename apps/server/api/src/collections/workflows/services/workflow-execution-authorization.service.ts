import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ValidatedAgentScope } from '@genfeedai/interfaces';
import { AgentScopeContextService } from '@genfeedai/server';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface AuthorizeWorkflowExecutionInput {
  readonly expectedContextVersion?: number;
  readonly organizationId: string;
  readonly requestedBrandId?: string;
  readonly threadId?: string;
  readonly userId: string;
  readonly workflowId: string;
}

/**
 * Thin workflow-owned adapter from optional shell context to the canonical
 * server scope validator. It authorizes only; deterministic execution remains
 * owned by WorkflowExecutorService and the workflow engine.
 */
@Injectable()
export class WorkflowExecutionAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentScopeContextService: AgentScopeContextService,
  ) {}

  async authorize(
    input: AuthorizeWorkflowExecutionInput,
  ): Promise<ValidatedAgentScope | undefined> {
    const hasThreadId = Boolean(input.threadId);
    const hasContextVersion = input.expectedContextVersion !== undefined;

    if (!hasThreadId && !hasContextVersion) {
      return undefined;
    }
    if (!input.threadId || input.expectedContextVersion === undefined) {
      throw new BadRequestException(
        'threadId and expectedContextVersion are required together for workflow actions.',
      );
    }

    const prepared = await this.agentScopeContextService.prepareForTurn({
      expectedContextVersion: input.expectedContextVersion,
      organizationId: input.organizationId,
      requestedBrandId: input.requestedBrandId,
      threadId: input.threadId,
      userId: input.userId,
    });
    const scope = prepared.existingScope;
    if (!scope) {
      throw new BadRequestException(
        'A persisted thread context is required for workflow execution.',
      );
    }

    await this.agentScopeContextService.assertConsequentialBoundary(
      scope,
      'workflow',
    );

    const workflow = await this.prisma.workflow.findFirst({
      select: { brandId: true, id: true },
      where: {
        id: input.workflowId,
        isDeleted: false,
        organizationId: input.organizationId,
      },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    this.agentScopeContextService.assertResourceBrand(
      scope,
      workflow.brandId,
      'workflow',
    );

    return scope;
  }
}
