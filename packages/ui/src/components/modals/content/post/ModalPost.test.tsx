import type { PostModalSchema } from '@genfeedai/client/schemas';
import { ModalEnum } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import {
  closeModal,
  isModalOpen,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalPost from '@ui/modals/content/post/ModalPost';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  generateDraftText: vi.fn(),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-workspace' }),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => mocks,
}));
vi.mock('@genfeedai/hooks/ui/use-crud-modal/use-crud-modal', async () => {
  const { useForm } = await import('react-hook-form');
  const { standardSchemaResolver } = await import(
    '@hookform/resolvers/standard-schema'
  );
  const { postModalSchema } = await import('@genfeedai/client/schemas');
  return {
    useCrudModal: ({
      defaultValues,
      customSubmitHandler,
    }: {
      defaultValues: PostModalSchema;
      customSubmitHandler: (
        service: unknown,
        entity: null,
        data: PostModalSchema,
      ) => Promise<unknown>;
    }) => {
      const form = useForm<PostModalSchema>({
        defaultValues,
        resolver: standardSchemaResolver(postModalSchema),
        mode: 'onChange',
      });
      return {
        form,
        closeModal: vi.fn(),
        isSubmitting: false,
        onSubmit: form.handleSubmit((data) =>
          customSubmitHandler(mocks, null, data),
        ),
      };
    },
  };
});
vi.mock('@ui/editors/LazyRichTextEditor', async () => {
  const { Textarea } = await import('@ui/primitives/textarea');
  return {
    default: ({
      value,
      onChange,
    }: {
      value: string;
      onChange: (value: string) => void;
    }) => (
      <Textarea
        aria-label="Post content"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    ),
  };
});

describe('ModalPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue({ id: 'new-post' });
    mocks.patch.mockResolvedValue({ id: 'existing-post' });
  });
  it('keeps a manually opened composer open when it mounts', () => {
    openModal(ModalEnum.POST_LONG_FORM);
    render(
      <ModalPost
        credentials={[]}
        modalId={ModalEnum.POST_LONG_FORM}
        onConfirm={vi.fn()}
      />,
    );
    expect(isModalOpen(ModalEnum.POST_LONG_FORM)).toBe(true);
    closeModal(ModalEnum.POST_LONG_FORM);
  });
  it('saves a manually written X draft without an account', async () => {
    const user = userEvent.setup();
    render(<ModalPost credentials={[]} modalId={ModalEnum.POST_LONG_FORM} />);
    await user.type(
      screen.getByRole('textbox', { name: 'Post content' }),
      'A manual tweet',
    );
    await user.click(screen.getByRole('button', { name: 'Create Post' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'A manual tweet',
          platform: 'twitter',
          credentialId: undefined,
          targetExecutionState: 'draft',
        }),
      ),
    );
    expect(mocks.patch).not.toHaveBeenCalled();
  });
  it('edits the existing draft instead of creating another post', async () => {
    const user = userEvent.setup();
    render(
      <ModalPost
        credentials={[]}
        modalId={ModalEnum.POST_LONG_FORM}
        post={
          {
            id: 'existing-post',
            description: 'Original',
            platform: 'twitter',
          } as IPost
        }
      />,
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Post content' }),
      ' edited',
    );
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        'existing-post',
        expect.objectContaining({ description: 'Original edited' }),
      ),
    );
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('keeps rich-text formatting when editing a non-Twitter draft', async () => {
    const user = userEvent.setup();
    render(
      <ModalPost
        credentials={[]}
        modalId={ModalEnum.POST_LONG_FORM}
        post={
          {
            id: 'existing-post',
            description: '<p>Original</p>',
            platform: 'instagram',
          } as IPost
        }
      />,
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Post content' }),
      ' edited',
    );
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        'existing-post',
        expect.objectContaining({ description: '<p>Original</p> edited' }),
      ),
    );
  });
});
