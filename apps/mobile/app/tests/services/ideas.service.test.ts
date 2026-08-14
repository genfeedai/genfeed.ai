import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock('@/services/api/base-http.service', () => ({
  apiRequest,
}));

import { ideasService } from '@/services/api/ideas.service';

describe('ideasService', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ data: { id: 'idea-1' } });
  });

  it('lists ideas with pagination params', async () => {
    await ideasService.findAll('token', { page: 2, pageSize: 10 });

    expect(apiRequest).toHaveBeenCalledWith('token', 'ideas', {
      params: { page: 2, pageSize: 10 },
    });
  });

  it('creates, updates, and deletes through the ideas collection', async () => {
    await ideasService.create('token', { tags: ['launch'], text: 'Ship it' });
    await ideasService.update('token', 'idea-1', { text: 'Shipped' });
    await ideasService.delete('token', 'idea-1');
    await ideasService.findOne('token', 'idea-1');

    expect(apiRequest).toHaveBeenNthCalledWith(1, 'token', 'ideas', {
      body: { tags: ['launch'], text: 'Ship it' },
      method: 'POST',
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, 'token', 'ideas/idea-1', {
      body: { text: 'Shipped' },
      method: 'PATCH',
    });
    expect(apiRequest).toHaveBeenNthCalledWith(3, 'token', 'ideas/idea-1', {
      method: 'DELETE',
    });
    expect(apiRequest).toHaveBeenNthCalledWith(4, 'token', 'ideas/idea-1');
  });
});
