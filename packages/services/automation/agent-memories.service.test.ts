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

  it('lists personal and brand memories and archives a personal memory', async () => {
    const document = {
      data: [
        {
          attributes: { scope: 'personal', summary: 'Short hooks' },
          id: 'm1',
          type: 'agent-memory',
        },
      ],
    };
    getMock.mockResolvedValue({ data: document });
    postMock.mockResolvedValue({
      data: {
        data: {
          attributes: { isDeleted: true, scope: 'personal' },
          id: 'm1',
          type: 'agent-memory',
        },
      },
    });
    const service = AgentMemoriesService.getInstance('token');
    const controller = new AbortController();

    await expect(service.listPersonal(controller.signal)).resolves.toEqual([
      expect.objectContaining({ id: 'm1', summary: 'Short hooks' }),
    ]);
    expect(getMock).toHaveBeenCalledWith('/personal', {
      signal: controller.signal,
    });

    await service.listForBrand('brand-1');
    expect(getMock).toHaveBeenLastCalledWith('/brands/brand-1', {
      signal: undefined,
    });

    await expect(service.archivePersonal('m1')).resolves.toEqual(
      expect.objectContaining({ id: 'm1', isDeleted: true }),
    );
    expect(postMock).toHaveBeenCalledWith('/personal/m1/archive');
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
