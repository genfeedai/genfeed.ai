import { AgentRunCancelController } from '@api/collections/workflow-executions/controllers/agent-run-cancel.controller';
import { buildCancellableAgentRunWhere } from '@api/collections/workflow-executions/services/workflow-execution-query.util';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { ORGANIZATION_MODULE_KEY } from '@api/common/organization-modules/organization-module.decorator';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

describe('AgentRunCancelController', () => {
  const user = {
    id: 'user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as never;
  const dto = { status: WorkflowExecutionStatus.CANCELLED } as const;
  const findOneSelect = vi.fn();
  const cancelExecution = vi.fn();
  let controller: AgentRunCancelController;

  beforeEach(() => {
    findOneSelect.mockReset();
    cancelExecution.mockReset();
    controller = new AgentRunCancelController({
      cancelExecution,
      findOneSelect,
    } as unknown as WorkflowExecutionsService);
  });

  it('is not behind the automation module switch', () => {
    expect(
      Reflect.getMetadata(ORGANIZATION_MODULE_KEY, AgentRunCancelController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        ORGANIZATION_MODULE_KEY,
        AgentRunCancelController.prototype.cancel,
      ),
    ).toBeUndefined();
  });

  it('cancels the caller’s own agent run and returns it', async () => {
    findOneSelect.mockResolvedValue({ id: 'run-1' });
    cancelExecution.mockResolvedValue({ id: 'run-1', status: 'cancelled' });

    const result = await controller.cancel({} as never, user, 'run-1', dto);

    expect(result).toEqual({ id: 'run-1', status: 'cancelled' });
    expect(cancelExecution).toHaveBeenCalledWith('run-1', 'org-1');
  });

  it('answers 404 and cancels nothing for a run the caller does not own', async () => {
    findOneSelect.mockResolvedValue(null);

    await expect(
      controller.cancel({} as never, user, 'run-2', dto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(cancelExecution).not.toHaveBeenCalled();
  });

  it('looks the run up scoped to the organization, the caller and agent threads', async () => {
    findOneSelect.mockResolvedValue(null);

    await controller.cancel({} as never, user, 'run-3', dto).catch(() => {});

    expect(findOneSelect.mock.calls[0]?.[0]).toMatchObject({
      id: 'run-3',
      isDeleted: false,
      organizationId: 'org-1',
      threadId: { not: null },
      userId: 'user-1',
    });
    expect(findOneSelect.mock.calls[0]?.[0]).toEqual(
      buildCancellableAgentRunWhere('org-1', 'user-1', 'run-3'),
    );
  });
});
