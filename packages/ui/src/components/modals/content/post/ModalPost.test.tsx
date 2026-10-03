import '@testing-library/jest-dom/vitest';
import type { PostModalSchema } from '@genfeedai/client/schemas';
import { ModalEnum } from '@genfeedai/contracts';
import type { ICredential, IPost } from '@genfeedai/contracts/interfaces';
import {
  closeModal,
  isModalOpen,
  openModal,
} from '@genfeedai/helpers/ui/modal/modal.helper';
import { calculateTweetLength } from '@helpers/formatting/tweet-length/tweet-length.helper';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModalPost from '@ui/modals/content/post/ModalPost';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createThread: vi.fn(),
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
    mocks.createThread.mockResolvedValue([{ id: 'thread-root' }]);
  });
  it('keeps a manually opened composer open when it mounts', () => {
    openModal(ModalEnum.POST_COMPOSE);
    render(
      <ModalPost
        credentials={[]}
        modalId={ModalEnum.POST_COMPOSE}
        onConfirm={vi.fn()}
      />,
    );
    expect(isModalOpen(ModalEnum.POST_COMPOSE)).toBe(true);
    closeModal(ModalEnum.POST_COMPOSE);
  });
  it('saves a manually written X draft without an account', async () => {
    const user = userEvent.setup();
    render(<ModalPost credentials={[]} modalId={ModalEnum.POST_COMPOSE} />);
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
        modalId={ModalEnum.POST_COMPOSE}
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
        modalId={ModalEnum.POST_COMPOSE}
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

  describe('destination composer', () => {
    const xAccount = {
      externalHandle: 'acme_x',
      id: 'cred-x',
      label: 'Acme on X',
      platform: 'twitter',
    } as unknown as ICredential;
    const linkedinAccount = {
      id: 'cred-li',
      label: 'Acme on LinkedIn',
      platform: 'linkedin',
    } as unknown as ICredential;

    function renderComposer() {
      return render(
        <ModalPost
          isComposer
          credentials={[xAccount, linkedinAccount]}
          modalId={ModalEnum.POST_COMPOSE}
        />,
      );
    }

    async function writeCaption(
      user: ReturnType<typeof userEvent.setup>,
      text: string,
    ) {
      await user.click(screen.getByRole('textbox', { name: 'Post content' }));
      await user.paste(text);
    }

    it('lists connected accounts and the article and newsletter destinations', () => {
      renderComposer();
      expect(screen.getByRole('button', { name: 'Acme on X' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(
        screen.getByRole('button', { name: 'Acme on LinkedIn' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Article' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Newsletter' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Channel')).not.toBeInTheDocument();
    });

    it('creates one post per selected account', async () => {
      const user = userEvent.setup();
      renderComposer();
      await user.click(screen.getByRole('button', { name: 'Acme on X' }));
      await user.click(
        screen.getByRole('button', { name: 'Acme on LinkedIn' }),
      );
      await writeCaption(user, 'Shipping today');
      await user.click(screen.getByRole('button', { name: 'Create Post' }));

      await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
      expect(mocks.post).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialId: 'cred-x',
          description: 'Shipping today',
          format: 'standard',
          platform: 'twitter',
        }),
      );
      expect(mocks.post).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialId: 'cred-li',
          platform: 'linkedin',
        }),
      );
    });

    it('derives a long post for X from the length of the text', async () => {
      const user = userEvent.setup();
      renderComposer();
      await user.click(screen.getByRole('button', { name: 'Acme on X' }));
      await writeCaption(user, 'a'.repeat(400));
      await user.click(screen.getByRole('button', { name: 'Create Post' }));

      await waitFor(() =>
        expect(mocks.post).toHaveBeenCalledWith(
          expect.objectContaining({
            credentialId: 'cred-x',
            format: 'long-form',
          }),
        ),
      );
      expect(mocks.createThread).not.toHaveBeenCalled();
    });

    it('keeps the 25k limit on X long posts', async () => {
      const user = userEvent.setup();
      renderComposer();
      await user.click(screen.getByRole('button', { name: 'Acme on X' }));
      await writeCaption(user, 'a'.repeat(25_001));

      expect(screen.getByText('25001 / 25000')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Create Post' }),
      ).toBeDisabled();
    });

    it('splits the text into a thread through the existing thread path', async () => {
      const user = userEvent.setup();
      renderComposer();
      await user.click(screen.getByRole('button', { name: 'Acme on X' }));
      await writeCaption(user, `${'word '.repeat(70).trim()}.`);
      await user.click(
        screen.getByRole('switch', { name: 'Split into thread' }),
      );
      await user.click(screen.getByRole('button', { name: 'Create Thread' }));

      await waitFor(() => expect(mocks.createThread).toHaveBeenCalledTimes(1));
      const { posts } = mocks.createThread.mock.calls[0][0] as {
        posts: { credentialId: string; description: string }[];
      };
      expect(posts.length).toBeGreaterThan(1);
      expect(posts.every((item) => item.credentialId === 'cred-x')).toBe(true);
      expect(
        posts.every((item) => calculateTweetLength(item.description) <= 280),
      ).toBe(true);
      expect(mocks.post).not.toHaveBeenCalled();
    });

    it('only offers the thread option when an X account is selected', async () => {
      const user = userEvent.setup();
      renderComposer();
      expect(
        screen.queryByRole('switch', { name: 'Split into thread' }),
      ).not.toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Acme on LinkedIn' }),
      );
      expect(
        screen.queryByRole('switch', { name: 'Split into thread' }),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Acme on X' }));
      expect(
        screen.getByRole('switch', { name: 'Split into thread' }),
      ).toBeInTheDocument();
    });

    it('hands off to the article editor and drops selected accounts', async () => {
      const user = userEvent.setup();
      renderComposer();
      await user.click(screen.getByRole('button', { name: 'Acme on X' }));
      await user.click(screen.getByRole('button', { name: 'Article' }));

      expect(screen.getByRole('button', { name: 'Acme on X' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(
        screen.queryByRole('textbox', { name: 'Post content' }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(isModalOpen(ModalEnum.ARTICLE)).toBe(true);
      expect(mocks.post).not.toHaveBeenCalled();
      closeModal(ModalEnum.ARTICLE);
    });

    it('hands off to the newsletter editor', async () => {
      const user = userEvent.setup();
      renderComposer();
      await user.click(screen.getByRole('button', { name: 'Newsletter' }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      expect(isModalOpen(ModalEnum.NEWSLETTER)).toBe(true);
      closeModal(ModalEnum.NEWSLETTER);
    });

    it('selecting an account clears an article destination', async () => {
      const user = userEvent.setup();
      renderComposer();
      await user.click(screen.getByRole('button', { name: 'Article' }));
      await user.click(screen.getByRole('button', { name: 'Acme on X' }));
      expect(screen.getByRole('button', { name: 'Article' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(
        screen.getByRole('textbox', { name: 'Post content' }),
      ).toBeInTheDocument();
    });
  });
});
