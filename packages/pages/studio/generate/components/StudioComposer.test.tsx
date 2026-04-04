import { IngredientCategory } from '@genfeedai/enums';
import { StudioComposer } from '@pages/studio/generate/components/StudioComposer';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';

const promptBarSpy = vi.fn();
const promptBarSurfaceSpy = vi.fn();
const lowCreditsBannerSpy = vi.fn();

vi.mock('@ui/banners/low-credits/LowCreditsBanner', () => ({
  default: () => {
    lowCreditsBannerSpy();
    return <div data-testid="low-credits-banner" />;
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
    return <div data-testid="studio-composer-prompt-bar" />;
  },
}));

describe('StudioComposer', () => {
  const baseProps = {
    categoryType: IngredientCategory.VIDEO,
    generateLabel: 'Generate',
    isGenerating: false,
    models: [],
    onConfigChange: vi.fn(),
    onIngredientCategoryChange: vi.fn(),
    onSubmit: vi.fn(),
    onTextChange: vi.fn(),
    presets: [],
    promptConfig: { isValid: true },
    promptText: '',
    trainings: [],
  };

  it('renders the same docked prompt bar in empty state', () => {
    render(<StudioComposer {...baseProps} isEmptyState={true} />);

    expect(
      screen.getByTestId('studio-composer-prompt-bar'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('low-credits-banner')).toBeInTheDocument();
    expect(promptBarSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        shellMode: 'studio-unified',
      }),
    );
    expect(promptBarSurfaceSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        surface: expect.objectContaining({
          container: expect.objectContaining({
            layoutMode: 'surface-fixed',
          }),
        }),
      }),
    );
  });

  it('renders empty-state suggestions above the docked composer', () => {
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
    expect(
      screen.queryByText(
        'Create a short product teaser with smooth camera moves',
      ),
    ).not.toBeInTheDocument();
  });
});
