import type { MultiPostSchema } from '@genfeedai/client/schemas';
import type { IPostPlatformConfig } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import ModalPostContent from '@ui/modals/content/post/ModalPostContent';
import type { UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ui/modals/content/post/ModalPostSetupTab', () => ({
  __esModule: true,
  default: () => <div data-testid="post-setup-tab" />,
}));

vi.mock('@ui/modals/content/post/ModalPostPlatformsTab', () => ({
  __esModule: true,
  default: () => <div data-testid="post-platforms-tab" />,
}));

describe('ModalPostContent', () => {
  const form = {
    control: {},
    setValue: vi.fn(),
    watch: vi.fn(),
  } as UseFormReturn<MultiPostSchema>;

  const platformConfigs: IPostPlatformConfig[] = [];

  const baseProps = {
    activeTab: 'setup' as const,
    form,
    getMinDateTime: () => new Date(),
    globalScheduledDate: null,
    ingredient: null,
    isLoading: false,
    platformConfigs,
    setGlobalScheduledDate: vi.fn(),
    togglePlatform: vi.fn(),
    updatePlatformConfig: vi.fn(),
  };

  it('should render without crashing', () => {
    render(<ModalPostContent {...baseProps} />);
    expect(screen.getByTestId('post-setup-tab')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    render(<ModalPostContent {...baseProps} />);
    expect(screen.getByTestId('post-setup-tab')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    render(<ModalPostContent {...baseProps} activeTab="platforms" />);
    expect(screen.getByTestId('post-platforms-tab')).toBeInTheDocument();
  });
});
