import { WorkflowsService } from '@services/automation/workflows.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('WorkflowsService', () => {
  let service: WorkflowsService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WorkflowsService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(WorkflowsService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });
});
