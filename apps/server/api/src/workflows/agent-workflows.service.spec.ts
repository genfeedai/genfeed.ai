import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentWorkflowsService } from '@api/workflows/agent-workflows.service';
import type { PatchAgentWorkflowDto } from '@api/workflows/dto/patch-agent-workflow.dto';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('AgentWorkflowsService.applyEvent', () => {
  const organizationId = testId('organization');
  const workflowId = testId('workflow');
  const workflow = { id: workflowId } as never;
  let service: AgentWorkflowsService;

  beforeEach(() => {
    service = new AgentWorkflowsService(
      {} as PrismaService,
      {} as LoggerService,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches a normal advance as an agent transition with state', async () => {
    const dto = {
      event: 'advance',
      questions: [],
    } as PatchAgentWorkflowDto;
    const transition = vi
      .spyOn(service, 'transition')
      .mockResolvedValue(workflow);

    await expect(
      service.applyEvent(workflowId, organizationId, dto),
    ).resolves.toBe(workflow);
    expect(transition).toHaveBeenCalledWith(
      workflowId,
      organizationId,
      'agent',
      { questions: [] },
    );
  });

  it('dispatches a forced advance without a state mutation', async () => {
    const forceAdvance = vi
      .spyOn(service, 'forceAdvance')
      .mockResolvedValue(workflow);
    const transition = vi.spyOn(service, 'transition');

    await expect(
      service.applyEvent(workflowId, organizationId, {
        event: 'advance',
        force: true,
      }),
    ).resolves.toBe(workflow);
    expect(forceAdvance).toHaveBeenCalledWith(workflowId, organizationId);
    expect(transition).not.toHaveBeenCalled();
  });

  it('dispatches approval with its state snapshot', async () => {
    const dto = {
      approaches: [],
      event: 'approve',
    } as PatchAgentWorkflowDto;
    const approve = vi.spyOn(service, 'approve').mockResolvedValue(workflow);

    await expect(
      service.applyEvent(workflowId, organizationId, dto),
    ).resolves.toBe(workflow);
    expect(approve).toHaveBeenCalledWith(workflowId, organizationId, {
      approaches: [],
    });
  });

  it('dispatches rollback to its required target phase', async () => {
    const rollback = vi.spyOn(service, 'rollback').mockResolvedValue(workflow);

    await expect(
      service.applyEvent(workflowId, organizationId, {
        event: 'rollback',
        targetPhase: 'exploring',
      }),
    ).resolves.toBe(workflow);
    expect(rollback).toHaveBeenCalledWith(
      workflowId,
      organizationId,
      'exploring',
    );
  });

  it('rejects ambiguous payloads before calling a mutation method', async () => {
    const transition = vi.spyOn(service, 'transition');
    const forceAdvance = vi.spyOn(service, 'forceAdvance');
    const approve = vi.spyOn(service, 'approve');
    const rollback = vi.spyOn(service, 'rollback');

    await expect(
      service.applyEvent(workflowId, organizationId, {
        event: 'advance',
        force: true,
        questions: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transition).not.toHaveBeenCalled();
    expect(forceAdvance).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });
});
