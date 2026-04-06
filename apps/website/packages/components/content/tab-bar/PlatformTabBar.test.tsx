import { PostStatus } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import PlatformTabBar from '@website/packages/components/content/tab-bar/PlatformTabBar';
import { describe, expect, it, vi } from 'vitest';

const mockPosts: Partial<IPost>[] = [
  {
    id: 'post-1',
    platform: 'youtube',
    status: PostStatus.PUBLIC,
  },
  {
    id: 'post-2',
    platform: 'instagram',
    status: PostStatus.SCHEDULED,
  },
];

describe('PlatformTabBar', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <PlatformTabBar
        posts={mockPosts}
        activePlatform="youtube"
        onPlatformChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const onPlatformChange = vi.fn();
    const onAddPlatform = vi.fn();

    render(
      <PlatformTabBar
        posts={mockPosts}
        activePlatform="youtube"
        onPlatformChange={onPlatformChange}
        onAddPlatform={onAddPlatform}
      />,
    );

    const addButton = screen.getByLabelText('Add platform variant');
    fireEvent.click(addButton);
    expect(onAddPlatform).toHaveBeenCalledTimes(1);
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <PlatformTabBar
        posts={mockPosts}
        activePlatform="youtube"
        onPlatformChange={vi.fn()}
        className="custom-class"
      />,
    );
    const rootElement = container.firstChild as HTMLElement;

    expect(rootElement).toHaveClass('flex');
    expect(rootElement).toHaveClass('items-center');
    expect(rootElement).toHaveClass('gap-3');
    expect(rootElement).toHaveClass('custom-class');
  });
});
