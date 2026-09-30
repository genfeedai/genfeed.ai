import { ActivitiesService } from '@services/social/activities.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    service = new ActivitiesService(mockToken);
  });

  it('initializes correctly', () => {
    expect(service).toBeInstanceOf(ActivitiesService);
  });

  it('has CRUD methods', () => {
    expect(service.findAll).toBeDefined();
    expect(service.findOne).toBeDefined();
    expect(service.post).toBeDefined();
    expect(service.patch).toBeDefined();
    expect(service.delete).toBeDefined();
  });
});
