import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pathnameMock = vi.fn();
const enabledCategoriesState = vi.hoisted(() => ({
  enabledCategories: ['image', 'video'],
  isLoading: false,
}));

vi.mock(
  '@hooks/data/organization/use-enabled-categories/use-enabled-categories',
  () => ({
    categoryToParam: (category: string) => category,
    paramToCategory: (value: string | null) => value,
    STUDIO_CATEGORY_CONFIG: [
      { category: 'image', settingKey: 'isGenerateImagesEnabled' },
      { category: 'video', settingKey: 'isGenerateVideosEnabled' },
      { category: 'music', settingKey: 'isGenerateMusicEnabled' },
      { category: 'avatar', settingKey: null },
    ],
    useEnabledCategories: () => ({
      enabledCategories: enabledCategoriesState.enabledCategories,
      isLoading: enabledCategoriesState.isLoading,
    }),
  }),
);

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ type: 'video' }),
  usePathname: () => pathnameMock(),
}));

describe('StudioSidebarContent', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/studio/video');
    enabledCategoriesState.enabledCategories = ['image', 'video'];
    enabledCategoriesState.isLoading = false;
  });

  it('renders Editor as a separated tools item at the bottom of Studio', async () => {
    const { StudioSidebarContent } = await import(
      '@pages/studio/sidebar/StudioSidebarContent'
    );

    render(<StudioSidebarContent />);

    const editorLink = screen.getByRole('link', { name: 'Editor' });

    expect(editorLink).toHaveAttribute('href', '/editor');
    expect(screen.getByTestId('studio-tools-divider')).toBeInTheDocument();
  });

  it('marks Editor active on studio editor routes', async () => {
    const { StudioSidebarContent } = await import(
      '@pages/studio/sidebar/StudioSidebarContent'
    );

    pathnameMock.mockReturnValue('/editor/project-123');

    render(<StudioSidebarContent />);

    expect(screen.getByRole('link', { name: 'Editor' })).toHaveClass(
      'bg-white/10',
    );
  });

  it('does not render gated categories while organization settings are still loading', async () => {
    const { StudioSidebarContent } = await import(
      '@pages/studio/sidebar/StudioSidebarContent'
    );

    enabledCategoriesState.enabledCategories = [
      'image',
      'video',
      'music',
      'avatar',
    ];
    enabledCategoriesState.isLoading = true;

    render(<StudioSidebarContent />);

    expect(
      screen.queryByRole('link', { name: 'Music' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Images' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Videos' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Avatars' })).toBeInTheDocument();
  });

  it('renders music once organization settings have resolved and music is enabled', async () => {
    const { StudioSidebarContent } = await import(
      '@pages/studio/sidebar/StudioSidebarContent'
    );

    enabledCategoriesState.enabledCategories = [
      'image',
      'video',
      'music',
      'avatar',
    ];
    enabledCategoriesState.isLoading = false;

    render(<StudioSidebarContent />);

    expect(screen.getByRole('link', { name: 'Music' })).toHaveAttribute(
      'href',
      '/studio/music',
    );
  });
});
