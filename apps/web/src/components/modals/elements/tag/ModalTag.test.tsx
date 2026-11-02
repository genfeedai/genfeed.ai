import { TagCategory, TagScope } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModalTag from '@/components/modals/elements/tag/ModalTag';

const fixture = vi.hoisted(() => ({
  posted: [] as unknown[],
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    post: async (body: unknown) => {
      fixture.posted.push(body);
      return { id: 'tag-1' };
    },
  }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    post: async (body: unknown) => {
      fixture.posted.push(body);
      return { id: 'tag-1' };
    },
  }),
}));
vi.mock('@helpers/ui/modal/modal.helper', () => ({
  closeModal: vi.fn(),
  openModal: vi.fn(),
}));
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: import('react').PropsWithChildren) => (
    <div>{children}</div>
  ),
}));

describe('ModalTag', () => {
  beforeEach(() => {
    fixture.posted = [];
  });

  it('creates an organization-wide tag from the form without an entity id', async () => {
    const onConfirm = vi.fn();
    render(<ModalTag onConfirm={onConfirm} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
      target: { value: 'Launch week' },
    });
    // Save stays disabled until the schema validation of the new label settles.
    const save = screen.getByRole('button', { name: 'Save' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(true));
    expect(fixture.posted).toEqual([
      expect.objectContaining({
        category: TagCategory.INGREDIENT,
        label: 'Launch week',
        scope: TagScope.ORGANIZATION,
      }),
    ]);
  });
});
