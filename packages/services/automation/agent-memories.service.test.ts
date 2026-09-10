import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentMemoriesService } from './agent-memories.service';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    instance = { get: getMock, post: postMock };

    constructor(_baseUrl?: string, _token?: string) {}

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: unknown[]) => T,
      ...args: unknown[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.example' },
}));

describe('AgentMemoriesService', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('lists organization memories and posts archive, promote, and reject', async () => {
    getMock.mockResolvedValue({ data: [{ id: 'm1' }] });
    postMock.mockResolvedValue({ data: { id: 'm1', promotedSkillId: 's1' } });
    const service = AgentMemoriesService.getInstance('token');

    await expect(service.listOrganization()).resolves.toEqual([{ id: 'm1' }]);
    expect(getMock).toHaveBeenCalledWith('/organization');

    await service.archive('m1');
    expect(postMock).toHaveBeenCalledWith('/m1/archive');
    await service.promote('m1');
    expect(postMock).toHaveBeenCalledWith('/m1/promote');
    await service.reject('m1');
    expect(postMock).toHaveBeenCalledWith('/m1/reject');
  });
});
