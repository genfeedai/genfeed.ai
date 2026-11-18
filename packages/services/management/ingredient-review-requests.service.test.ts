import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
} from '@services/__mocks__/http.mock';
import { IngredientReviewRequestsService } from '@services/management/ingredient-review-requests.service';
import { Task } from '@services/management/tasks.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('IngredientReviewRequestsService', () => {
  let service: IngredientReviewRequestsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IngredientReviewRequestsService('review-token');
    http = installMockHttp(service);
  });

  it('lists the review requests on an asset as tasks', async () => {
    http.get.mockResolvedValue(
      axiosResponse(
        collectionDocument([
          { id: 'task_1', reviewState: 'pending_approval', title: 'Review' },
        ]),
      ),
    );

    const requests = await service.listForIngredient('ing_1');

    expect(http.get).toHaveBeenCalledWith('/ing_1/review-requests', {
      signal: undefined,
    });
    expect(requests[0]).toBeInstanceOf(Task);
    expect(requests[0]?.reviewState).toBe('pending_approval');
  });

  it('reads the reviewer candidates as plain user ids', async () => {
    http.get.mockResolvedValue(
      axiosResponse({ reviewerUserIds: ['user_2', 'user_3'] }),
    );

    await expect(service.listCandidates('ing_1')).resolves.toEqual([
      'user_2',
      'user_3',
    ]);
    expect(http.get).toHaveBeenCalledWith('/ing_1/review-requests/candidates', {
      signal: undefined,
    });
  });

  it('asks the reviewers with the note and returns one task each', async () => {
    http.post.mockResolvedValue(
      axiosResponse(
        collectionDocument([
          { id: 'task_1', title: 'Review' },
          { id: 'task_2', title: 'Review' },
        ]),
      ),
    );

    const tasks = await service.request('ing_1', {
      note: 'Check the claim.',
      reviewerUserIds: ['user_2', 'user_3'],
    });

    expect(http.post).toHaveBeenCalledWith('/ing_1/review-requests', {
      note: 'Check the claim.',
      reviewerUserIds: ['user_2', 'user_3'],
    });
    expect(tasks).toHaveLength(2);
  });
});
