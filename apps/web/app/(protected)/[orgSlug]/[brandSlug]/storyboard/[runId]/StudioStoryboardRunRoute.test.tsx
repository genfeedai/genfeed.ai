import StudioStoryboardRunRoute from '@app/(protected)/[orgSlug]/[brandSlug]/storyboard/[runId]/StudioStoryboardRunRoute';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/hooks/navigation/use-route-params', () => ({
  useRouteParams: () => ({ runId: undefined }),
}));
vi.mock('@/features/studio/storyboard/StoryboardRunPage', () => ({
  default: ({ runId }: { runId: string }) => <h1>Storyboard {runId}</h1>,
}));

describe('storyboard request-time route params', () => {
  it('waits for real params even while the cached client route is unresolved', async () => {
    const params = Promise.withResolvers<{ runId: string }>();
    const settled = vi.fn();
    const pending = Promise.resolve(
      StudioStoryboardRunRoute({ params: params.promise }),
    ).then((element) => {
      settled();
      return element;
    });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    params.resolve({ runId: 'new-storyboard' });
    render(await pending);
    expect(
      screen.getByRole('heading', { name: 'Storyboard new-storyboard' }),
    ).toBeInTheDocument();
  });

  it('propagates failed params instead of leaving an empty canvas', async () => {
    const failure = new Error('route params failed');
    await expect(
      StudioStoryboardRunRoute({ params: Promise.reject(failure) }),
    ).rejects.toBe(failure);
  });
});
