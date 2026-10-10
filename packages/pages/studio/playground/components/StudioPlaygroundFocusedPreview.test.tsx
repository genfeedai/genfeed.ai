import { IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundJob } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudioPlaygroundFocusedPreview from './StudioPlaygroundFocusedPreview';

const state = vi.hoisted(() => ({
  brandId: 'brand-1',
  orgId: 'org-1',
  pending: false,
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: state.brandId }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ orgId: state.orgId }),
}));
vi.mock('@hooks/media/use-authorized-media-preview', () => ({
  useAuthorizedMediaPreview: (ingredient: IIngredient | null) =>
    ingredient
      ? {
          id: ingredient.id,
          url: state.pending ? null : `/authorized/${ingredient.id}`,
          state: state.pending ? 'PENDING' : 'READY',
        }
      : null,
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img alt={alt} src={src} />
  ),
}));

function job(id: string, runId?: string): StudioPlaygroundJob {
  return {
    id,
    ingredientId: id,
    createdAt: 1,
    prompt: `Asset ${id}`,
    status: IngredientStatus.GENERATED,
    type: 'image',
    runId,
    ingredient: {
      id,
      brandId: 'brand-1',
      organizationId: 'org-1',
      isDeleted: false,
      thumbnailUrl: `/stale/${id}`,
    } as IIngredient,
  };
}
const jobs = [job('a', 'run-1'), job('b', 'run-1'), job('c')];
function renderPreview(selected = jobs[0]) {
  const onClose = vi.fn();
  const onSelect = vi.fn();
  const view = render(
    <StudioPlaygroundFocusedPreview
      job={selected}
      jobs={jobs}
      onClose={onClose}
      onSelect={onSelect}
    >
      <div>Existing inspector</div>
    </StudioPlaygroundFocusedPreview>,
  );
  return { ...view, onClose, onSelect };
}
describe('focused Playground iteration', () => {
  beforeEach(() => {
    state.brandId = 'brand-1';
    state.orgId = 'org-1';
    state.pending = false;
  });
  it('separates persisted relationships from recent fallback and selects without mutating a draft', async () => {
    const { onSelect } = renderPreview();
    expect(
      within(screen.getByRole('group', { name: 'Related assets' })).getByRole(
        'button',
        { name: 'Asset b' },
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole('group', { name: 'Recent assets' })).queryByRole(
        'button',
        { name: 'Asset b' },
      ),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Asset b' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(jobs[1]);
    expect(screen.getByText('Existing inspector')).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('uses stable gallery ordering for previous and next even on a recent asset', async () => {
    const { onSelect } = renderPreview(jobs[2]);
    expect(screen.getByRole('button', { name: 'Next asset' })).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Previous asset' }),
    );
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(jobs[1]);
  });
  it('focuses the close control and closes on keyboard Escape', async () => {
    const { onClose } = renderPreview();
    expect(
      screen.getByRole('button', { name: 'Back to gallery' }),
    ).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('leaves Escape to a text editor or active dialog and never closes through it', () => {
    const onClose = vi.fn();
    render(
      <StudioPlaygroundFocusedPreview
        job={jobs[0]}
        jobs={jobs}
        onClose={onClose}
        onSelect={vi.fn()}
      >
        <div>
          <textarea aria-label="Describe edits" />
          <div role="dialog" aria-label="Confirm">
            <button type="button">Cancel</button>
          </div>
        </div>
      </StudioPlaygroundFocusedPreview>,
    );
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), {
      key: 'Escape',
    });
    expect(onClose).not.toHaveBeenCalled();
  });
  it('never substitutes stale thumbnail URLs while authorization is pending', () => {
    state.pending = true;
    const { container } = renderPreview();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Asset b' })).toBeEnabled();
  });
  it.each(['brand', 'organization'])(
    'removes focused media and related controls after %s scope changes',
    (scope) => {
      const { rerender } = renderPreview();
      if (scope === 'brand') state.brandId = 'brand-2';
      else state.orgId = 'org-2';
      rerender(
        <StudioPlaygroundFocusedPreview
          job={jobs[0]}
          jobs={jobs}
          onClose={vi.fn()}
          onSelect={vi.fn()}
        >
          <div>Existing inspector</div>
        </StudioPlaygroundFocusedPreview>,
      );
      expect(screen.queryByText('Existing inspector')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Asset b' }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        'no longer available',
      );
    },
  );
});
