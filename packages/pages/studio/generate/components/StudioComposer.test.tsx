import { IngredientCategory, ModelProvider } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { StudioComposer } from '@pages/studio/generate/components/StudioComposer';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const promptBarSpy = vi.fn();
const promptBarSurfaceSpy = vi.fn();
const lowCreditsBannerSpy = vi.fn();
const mockUseSubscription = vi.fn();

vi.mock('@genfeedai/config/license', () => ({
  isEEEnabled: () => false,
}));

vi.mock(
  '@genfeedai/hooks/data/subscription/use-subscription/use-subscription',
  () => ({
    useSubscription: () => mockUseSubscription(),
  }),
);

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    orgHref: (path: string) => `/test-org/~${path}`,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ui/banners/low-credits/LowCreditsBanner', () => ({
  default: () => {
    lowCreditsBannerSpy();
    return <div data-testid="low-credits-banner" role="alert" />;
  },
}));

vi.mock('@ui/prompt-bars/surface/PromptBarSurfaceRenderer', () => ({
  default: (props: Record<string, unknown>) => {
    promptBarSurfaceSpy(props);
    return (
      <div data-testid="studio-composer-container">
        {props.topContent}
        {props.children}
      </div>
    );
  },
}));

vi.mock('@ui/prompt-bars/base/PromptBar', () => ({
  default: (props: Record<string, unknown>) => {
    promptBarSpy(props);
    return (
      <button
        data-testid="studio-composer-prompt-bar"
        disabled={Boolean(props.isGenerateDisabled)}
        onClick={() => (props.onSubmit as () => void)()}
        type="button"
      >
        {props.generateLabel as string}
      </button>
    );
  },
}));

describe('StudioComposer', () => {
  const baseProps = {
    categoryType: IngredientCategory.VIDEO,
    generateLabel: 'Generate',
    isAvailabilityLoading: false,
    isGenerating: false,
    models: [
      {
        key: 'video-model',
        provider: ModelProvider.REPLICATE,
      } as IModel,
    ],
    onConfigChange: vi.fn(),
    onIngredientCategoryChange: vi.fn(),
    onSubmit: vi.fn(),
    onTextChange: vi.fn(),
    presets: [],
    promptConfig: { isValid: true },
    promptText: '',
    trainings: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 100 },
    });
  });

  it('renders the empty prompt bar in the compact inflow surface', () => {
    render(<StudioComposer {...baseProps} isEmptyState={true} />);

    expect(
      screen.getByTestId('studio-composer-prompt-bar'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('low-credits-banner')).toBeInTheDocument();
    expect(promptBarSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        features: { collapsible: false, dragDrop: false },
      }),
    );
    expect(promptBarSurfaceSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        surface: expect.objectContaining({
          container: expect.objectContaining({
            layoutMode: 'inflow',
            maxWidth: '4xl',
          }),
        }),
      }),
    );
  });

  it('renders empty-state suggestions with the compact composer', () => {
    const onTextChange = vi.fn();

    render(
      <StudioComposer
        {...baseProps}
        isEmptyState={true}
        onTextChange={onTextChange}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Create a short product teaser with smooth camera moves',
      }),
    );

    expect(onTextChange).toHaveBeenCalledWith(
      'Create a short product teaser with smooth camera moves',
    );
  });

  it('keeps the same prompt bar mounted in populated state', () => {
    render(<StudioComposer {...baseProps} isEmptyState={false} />);

    expect(
      screen.getByTestId('studio-composer-prompt-bar'),
    ).toBeInTheDocument();
    expect(promptBarSurfaceSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        surface: expect.objectContaining({
          container: expect.objectContaining({
            layoutMode: 'surface-fixed',
          }),
        }),
      }),
    );
    expect(
      screen.queryByText(
        'Create a short product teaser with smooth camera moves',
      ),
    ).not.toBeInTheDocument();
  });

  it('blocks generation without a compatible model and hides the ETA', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <StudioComposer
        {...baseProps}
        generateLabel="Generate Video (~11-21s)"
        isEmptyState={false}
        models={[]}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No compatible model configured',
    );
    expect(
      screen.getByRole('link', { name: 'Configure models' }),
    ).toHaveAttribute('href', '/test-org/~/settings/models');

    const generateButton = screen.getByRole('button', {
      name: 'Configure a model',
    });
    expect(generateButton).toBeDisabled();
    expect(screen.queryByText(/11-21s/)).not.toBeInTheDocument();

    await user.click(generateButton);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks generation at zero credits and keeps the credits action visible', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 0 },
    });

    render(
      <StudioComposer
        {...baseProps}
        generateLabel="Generate Video (~11-21s)"
        isEmptyState={false}
        models={[
          {
            key: 'managed-video-model',
            provider: ModelProvider.GENFEED_AI,
          } as IModel,
        ]}
        promptConfig={{
          ...baseProps.promptConfig,
          models: ['managed-video-model'],
        }}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No credits available');
    expect(
      screen.getByRole('link', { name: 'Review credits' }),
    ).toHaveAttribute('href', '/test-org/~/settings/credits');

    const generateButton = screen.getByRole('button', {
      name: 'Add credits',
    });
    expect(generateButton).toBeDisabled();
    expect(screen.queryByText(/11-21s/)).not.toBeInTheDocument();

    await user.click(generateButton);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps BYOK generation available at zero managed credits', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 0 },
    });

    render(
      <StudioComposer
        {...baseProps}
        generateLabel="Generate Video (~11-21s)"
        isEmptyState={false}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByText('No credits available')).not.toBeInTheDocument();

    const generateButton = screen.getByRole('button', {
      name: 'Generate Video (~11-21s)',
    });
    expect(generateButton).toBeEnabled();

    await user.click(generateButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('blocks zero-credit auto-selection when every compatible model is managed', () => {
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 0 },
    });

    render(
      <StudioComposer
        {...baseProps}
        generateLabel="Generate Video (~11-21s)"
        isEmptyState={false}
        models={[
          {
            key: 'managed-video-model',
            provider: ModelProvider.GENFEED_AI,
          } as IModel,
        ]}
        promptConfig={{
          ...baseProps.promptConfig,
          autoSelectModel: true,
        }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No credits available');
    expect(screen.getByRole('button', { name: 'Add credits' })).toBeDisabled();
  });

  it('shows only the higher-priority model gate when credits are also zero', () => {
    mockUseSubscription.mockReturnValue({
      creditsBreakdown: { total: 0 },
    });

    render(
      <StudioComposer
        {...baseProps}
        generateLabel="Generate Video (~11-21s)"
        isEmptyState={false}
        models={[]}
      />,
    );

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByTestId('low-credits-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No compatible model configured',
    );
    expect(screen.queryByText('No credits available')).not.toBeInTheDocument();
  });

  it('waits for availability data before showing a configuration gate', () => {
    render(
      <StudioComposer
        {...baseProps}
        generateLabel="Generate Video (~11-21s)"
        isAvailabilityLoading={true}
        isEmptyState={false}
        models={[]}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Loading options' }),
    ).toBeDisabled();
    expect(screen.queryByText(/11-21s/)).not.toBeInTheDocument();
  });

  it('explains missing Avatar resources without requiring a model', () => {
    render(
      <StudioComposer
        {...baseProps}
        avatars={[]}
        categoryType={IngredientCategory.AVATAR}
        generateLabel="Generate Avatar (~11-21s)"
        isEmptyState={false}
        models={[]}
        voices={[]}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Avatar setup incomplete',
    );
    expect(screen.getByRole('link', { name: 'avatars' })).toHaveAttribute(
      'href',
      '/test-org/~/library/avatars',
    );
    expect(screen.getByRole('link', { name: 'voices' })).toHaveAttribute(
      'href',
      '/test-org/~/library/voices',
    );
    expect(promptBarSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requiresModelSelection: false,
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Set up an avatar' }),
    ).toBeDisabled();
  });

  it('keeps a configured Avatar path available without a model', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <StudioComposer
        {...baseProps}
        avatars={[
          {
            badge: 'HeyGen',
            description: 'Avatar',
            key: 'avatar-1',
            label: 'Avatar 1',
          },
        ]}
        categoryType={IngredientCategory.AVATAR}
        generateLabel="Generate Avatar (~11-21s)"
        isEmptyState={false}
        models={[]}
        onSubmit={onSubmit}
        voices={[
          {
            badge: 'ElevenLabs',
            description: 'Voice',
            key: 'voice-1',
            label: 'Voice 1',
          },
        ]}
      />,
    );

    expect(
      screen.queryByText('Avatar setup incomplete'),
    ).not.toBeInTheDocument();

    const generateButton = screen.getByRole('button', {
      name: 'Generate Avatar (~11-21s)',
    });
    expect(generateButton).toBeEnabled();
    expect(promptBarSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requiresModelSelection: false,
      }),
    );

    await user.click(generateButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('preserves the healthy generation label and submission path', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <StudioComposer
        {...baseProps}
        generateLabel="Generate Video (~11-21s)"
        isEmptyState={false}
        onSubmit={onSubmit}
      />,
    );

    const generateButton = screen.getByRole('button', {
      name: 'Generate Video (~11-21s)',
    });
    expect(generateButton).toBeEnabled();

    await user.click(generateButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('forwards the compatible model list and selection contract to the composer', () => {
    render(<StudioComposer {...baseProps} isEmptyState={false} />);

    expect(promptBarSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        categoryType: IngredientCategory.VIDEO,
        models: baseProps.models,
        requiresModelSelection: true,
      }),
    );
  });
});
