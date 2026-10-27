import { PagesService } from '@services/content/pages.service';
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
    getMock.mockResolvedValue({
      data: { docs: [{ id: 'm1' }], page: 2, totalDocs: 31, totalPages: 3 },
    });
    postMock.mockResolvedValue({ data: { id: 'm1', promotedSkillId: 's1' } });
    const service = AgentMemoriesService.getInstance('token');
    const controller = new AbortController();

    await expect(
      service.listOrganization({ limit: 15, page: 2 }, controller.signal),
    ).resolves.toEqual([{ id: 'm1' }]);
    expect(getMock).toHaveBeenCalledWith('/organization', {
      params: { limit: 15, page: 2 },
      signal: controller.signal,
    });
    expect(PagesService.getCurrentPage()).toBe(2);
    expect(PagesService.getTotalPages()).toBe(3);
    expect(PagesService.getTotalDocs()).toBe(31);

    await service.archive('m1');
    expect(postMock).toHaveBeenCalledWith('/m1/archive');
    await service.promote('m1');
    expect(postMock).toHaveBeenCalledWith('/m1/promote');
    await service.reject('m1');
    expect(postMock).toHaveBeenCalledWith('/m1/reject');
  });

  it('corrects a memory and pages its revisions with the cursor from the response meta', async () => {
    postMock.mockResolvedValue({
      data: {
        data: {
          attributes: { content: 'Corrected', isCurrent: true, revision: 2 },
          id: 'revision-2',
          type: 'agent-memory-revision',
        },
      },
    });
    getMock.mockResolvedValue({
      data: {
        data: [
          {
            attributes: { content: 'Corrected', revision: 2 },
            id: 'revision-2',
            type: 'agent-memory-revision',
          },
        ],
        meta: { nextCursor: 'cursor-1' },
      },
    });
    const service = AgentMemoriesService.getInstance('token');
    const input = {
      content: 'Corrected',
      expectedRevisionId: 'revision-1',
      reason: 'It changed',
      requestId: 'request-1',
    };

    const revision = await service.correct('memory-1', input);
    const page = await service.listRevisions('memory-1', { limit: 1 });

    expect(postMock).toHaveBeenCalledWith('/memory-1/revisions', input);
    expect(revision).toMatchObject({ content: 'Corrected', id: 'revision-2' });
    expect(getMock).toHaveBeenCalledWith('/memory-1/revisions', {
      params: { limit: 1 },
      signal: undefined,
    });
    expect(page.nextCursor).toBe('cursor-1');
    expect(page.items).toHaveLength(1);
  });
});
