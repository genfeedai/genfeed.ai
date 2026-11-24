import type { IPost } from '@genfeedai/contracts/interfaces';
import { calculateTweetLength } from '@helpers/formatting/tweet-length/tweet-length.helper';
import { stripHtmlToPlainText } from '@helpers/security/strip-html.helper';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PostDetailCardBody, {
  type PostDetailCardBodyProps,
} from '@/features/posts/detail/components/PostDetailCardBody';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({ tweetFieldLabel: 'Post' })[key] ?? key,
}));

vi.mock('@/components/editors/LazyRichTextEditor', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <div
      data-testid="rich-text-editor"
      data-value={value}
      onClick={() => onChange('<p>edited</p>')}
    />
  ),
}));

const storedHtml = '<p>First paragraph.</p><p>Second paragraph.</p>';

function buildProps(
  overrides: Partial<PostDetailCardBodyProps> = {},
): PostDetailCardBodyProps {
  return {
    currentDescriptionsRef: { current: new Map<string, string>() },
    currentLabelsRef: { current: new Map<string, string>() },
    descriptionValue: storedHtml,
    focusedPostId: null,
    hasAnalytics: false,
    index: 0,
    isEditable: true,
    isParent: true,
    isTwitter: true,
    localIngredients: [],
    onDescriptionChange: vi.fn(),
    placeholder: 'Write something',
    post: {
      description: storedHtml,
      id: 'post-1',
      isDeleted: false,
    } as unknown as IPost,
    ...overrides,
  };
}

describe('PostDetailCardBody', () => {
  it('edits X posts in the rich text editor instead of exposing raw HTML', () => {
    const props = buildProps();
    render(<PostDetailCardBody {...props} />);

    expect(screen.getByTestId('rich-text-editor')).toHaveAttribute(
      'data-value',
      storedHtml,
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(props.onDescriptionChange).not.toHaveBeenCalled();
  });

  it('counts X characters from the plain text, not the markup', () => {
    const plainLength = calculateTweetLength(stripHtmlToPlainText(storedHtml));
    render(<PostDetailCardBody {...buildProps()} />);

    expect(plainLength).toBeLessThan(storedHtml.length);
    expect(screen.getByText(`${plainLength} / 280`)).toBeInTheDocument();
  });

  it('records editor changes for autosave', () => {
    const props = buildProps();
    render(<PostDetailCardBody {...props} />);

    fireEvent.click(screen.getByTestId('rich-text-editor'));

    expect(props.onDescriptionChange).toHaveBeenCalledWith('<p>edited</p>');
    expect(props.currentDescriptionsRef.current.get('post-1')).toBe(
      '<p>edited</p>',
    );
  });

  it('shows a generated plain-text draft as one paragraph per block', () => {
    const generated = 'A.\n\nB.\n\nC.';
    render(
      <PostDetailCardBody
        {...buildProps({
          descriptionValue: generated,
          post: {
            description: generated,
            id: 'post-1',
            isDeleted: false,
          } as unknown as IPost,
        })}
      />,
    );

    const editorHtml =
      screen.getByTestId('rich-text-editor').getAttribute('data-value') ?? '';
    expect(editorHtml).toBe('<p>A.</p><p>B.</p><p>C.</p>');
    expect(stripHtmlToPlainText(editorHtml)).toBe(generated);
  });

  it('shows a plain-text draft as paragraphs in the read-only view', () => {
    const generated = 'A.\n\nB.\n\nC.';
    const { container } = render(
      <PostDetailCardBody
        {...buildProps({
          descriptionValue: generated,
          isEditable: false,
          post: {
            description: generated,
            id: 'post-1',
            isDeleted: false,
          } as unknown as IPost,
        })}
      />,
    );

    expect(container.querySelectorAll('p')).toHaveLength(3);
  });
});
