import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('../../../primitives/button', () => ({
  Button: ({
    children,
    onClick,
    ariaLabel,
    className,
  }: {
    children: ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  ),
}));

vi.mock('../../../primitives/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <div data-testid="separator" />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@genfeedai/enums', () => ({
  ButtonSize: { SM: 'sm' },
  ButtonVariant: { GHOST: 'ghost', UNSTYLED: 'unstyled' },
  GenerationType: {
    BLOG: 'blog',
    CLIP: 'clip',
    IMAGE: 'image',
    NEWSLETTER: 'newsletter',
    PODCAST: 'podcast',
    POST: 'post',
    THREAD: 'thread',
    VIDEO: 'video',
  },
}));

vi.mock('@genfeedai/helpers/formatting/cn/cn.util', () => ({
  cn: (...classes: (string | false | null | undefined)[]) =>
    classes.filter(Boolean).join(' '),
}));

const { MergedSwitcher } = await import('./MergedSwitcher');

describe('MergedSwitcher', () => {
  it('shows media creation modes separately from writing', () => {
    render(
      <MergedSwitcher
        orgSlug="acme"
        brandSlug="brand"
        currentApp="workspace"
      />,
    );

    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getByText('Image')).toBeInTheDocument();
    expect(screen.getByText('Audio')).toBeInTheDocument();
    expect(screen.getByText('Write')).toBeInTheDocument();
    expect(screen.queryByText('Text')).not.toBeInTheDocument();
    expect(screen.queryByText('Newsletter')).not.toBeInTheDocument();
  });

  it('emits generation type changes from the creation grid', () => {
    const onGenerationTypeChange = vi.fn();

    render(
      <MergedSwitcher
        orgSlug="acme"
        brandSlug="brand"
        currentApp="workspace"
        onGenerationTypeChange={onGenerationTypeChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Video' }));

    expect(onGenerationTypeChange).toHaveBeenCalledWith('video');
  });

  it('shows active generation and navigation state', () => {
    render(
      <MergedSwitcher
        orgSlug="acme"
        brandSlug="brand"
        currentApp="analytics"
        currentGenerationType="video"
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Switch view' }),
    ).toHaveTextContent('Video');
    expect(screen.getByText('Now')).toBeInTheDocument();
  });

  it('links navigation surfaces to brand scoped routes with preserved search', () => {
    render(
      <MergedSwitcher
        orgSlug="acme"
        brandSlug="brand"
        currentApp="analytics"
        preservedSearch="taskId=task-1"
      />,
    );

    expect(screen.getByRole('link', { name: /Overview/ })).toHaveAttribute(
      'href',
      '/acme/brand/workspace?taskId=task-1',
    );
    expect(screen.getByRole('link', { name: /^WriteDrafts/ })).toHaveAttribute(
      'href',
      '/acme/brand/compose/post?taskId=task-1',
    );
    expect(screen.getByRole('link', { name: /Analytics/ })).toHaveAttribute(
      'href',
      '/acme/brand/analytics/overview?taskId=task-1',
    );
  });

  it('links navigation surfaces to org scoped fallbacks without a brand', () => {
    render(<MergedSwitcher orgSlug="acme" currentApp="workspace" />);

    expect(screen.getByRole('link', { name: /Overview/ })).toHaveAttribute(
      'href',
      '/acme/~/overview',
    );
    expect(screen.getByRole('link', { name: /^WriteDrafts/ })).toHaveAttribute(
      'href',
      '/acme/~/overview',
    );
    expect(screen.getByRole('link', { name: /Analytics/ })).toHaveAttribute(
      'href',
      '/acme/~/analytics/overview',
    );
  });

  it('accepts a prefixed preserved search string and closes when a nav item is selected', () => {
    render(
      <MergedSwitcher
        orgSlug="acme"
        brandSlug="brand"
        currentApp="workspace"
        preservedSearch="?taskId=task-1"
      />,
    );

    const workflowsLink = screen.getByRole('link', { name: /Workflows/ });

    expect(workflowsLink).toHaveAttribute(
      'href',
      '/acme/brand/workflows?taskId=task-1',
    );

    fireEvent.click(workflowsLink);
  });
});
