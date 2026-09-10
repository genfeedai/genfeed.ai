import { WorkflowLifecycle } from '@genfeedai/contracts';
import { useWorkflowStore } from '@genfeedai/workflows/ui/stores';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowApiService } from '../services/workflow-api';
import { useCloudWorkflowStore } from './cloud-workflow-store';

function createService() {
  const create = vi.fn();
  const update = vi.fn();

  return {
    create,
    update,
    service: { create, update } as unknown as WorkflowApiService,
  };
}

describe('useCloudWorkflowStore.saveToCloud', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      edgeStyle: 'default',
      edges: [],
      groups: [],
      isDirty: true,
      isSaving: false,
      nodes: [],
      workflowId: null,
      workflowName: 'Sfsfsd',
    });
    useCloudWorkflowStore.setState({
      cloudError: null,
      inputVariables: [],
      lifecycle: WorkflowLifecycle.DRAFT,
      pendingBrandId: 'brand-shipshit',
      pendingCreateMetadata: null,
      pendingTemplateId: null,
      workflowId: null,
    });
  });

  it('creates with the current brand so the library list can find it', async () => {
    const { create, service } = createService();
    create.mockResolvedValue({
      id: 'wf-created',
      inputVariables: [],
      label: 'Sfsfsd',
    });

    await useCloudWorkflowStore.getState().saveToCloud(service);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-shipshit',
        label: 'Sfsfsd',
      }),
    );
    expect(useWorkflowStore.getState().workflowId).toBe('wf-created');
    expect(useCloudWorkflowStore.getState().workflowId).toBe('wf-created');
    expect(useWorkflowStore.getState().isDirty).toBe(false);
  });

  it('does not mark the canvas saved when create returns no id', async () => {
    const { create, service } = createService();
    create.mockResolvedValue({
      id: '',
      inputVariables: [],
      label: 'Sfsfsd',
    });

    await expect(
      useCloudWorkflowStore.getState().saveToCloud(service),
    ).rejects.toThrow('Workflow save did not return an id');
    expect(useWorkflowStore.getState().isDirty).toBe(true);
    expect(useWorkflowStore.getState().workflowId).toBeNull();
  });
});
