import { RouterPriority } from '@genfeedai/enums';
import StudioGenerateComposer from '@pages/studio/generate/components/StudioGenerateComposer';
import { StudioRemixRunScope } from '@pages/studio/generate/StudioRemixRunScope';
import { getDefaultStudioGenerateSettings } from '@pages/studio/generate/utils/studio-generate-settings';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@pages/studio/generate/components/StudioGenerateTypeSelector', () => ({
  default: () => <div>Generic asset type selector</div>,
}));

vi.mock(
  '@pages/studio/generate/components/StudioGenerateSettingsPopover',
  () => ({
    default: () => <div>Generation settings</div>,
  }),
);

vi.mock('@ui/dropdowns/model-selector/ModelSelectorPopover', () => ({
  default: () => <div>Generic model selector</div>,
}));

vi.mock('@ui/dropdowns/model-selector/useModelFavorites', () => ({
  useModelFavorites: () => ({
    favoriteModelKeys: [],
    onFavoriteToggle: vi.fn(),
  }),
}));

vi.mock('@ui/prompt-bars/components/shell/PromptBarShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PROMPT_BAR_SURFACE_CLASS: 'prompt-bar-surface',
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

const baseProps = {
  isGenerating: false,
  isLoadingModels: false,
  models: [],
  onPromptChange: vi.fn(),
  onResetSettings: vi.fn(),
  onSettingsChange: vi.fn(),
  onSubmit: vi.fn(),
  onTypeChange: vi.fn(),
  prompt: 'Turn the proof-led hook into a product reveal.',
  settings: {
    ...getDefaultStudioGenerateSettings('image'),
    prioritize: RouterPriority.BALANCED,
  },
  type: 'image' as const,
};

describe('StudioGenerateComposer remix scope', () => {
  it('keeps the generic type and model controls outside durable remix runs', () => {
    render(
      <StudioRemixRunScope isActive={false}>
        <StudioGenerateComposer {...baseProps} />
      </StudioRemixRunScope>,
    );

    expect(screen.getByText('Generic asset type selector')).toBeVisible();
    expect(screen.getByText('Generic model selector')).toBeVisible();
  });

  it('offers only canonical remix output types and ignores generic model loading', () => {
    render(
      <StudioRemixRunScope canSelectAvatar isActive>
        <StudioGenerateComposer {...baseProps} isLoadingModels />
      </StudioRemixRunScope>,
    );

    expect(
      screen.queryByText('Generic asset type selector'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Generic model selector'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();

    fireEvent.click(screen.getByRole('combobox', { name: 'Output type' }));

    expect(screen.getByRole('option', { name: 'Image' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Video' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Avatar' })).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'Music' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Voice' }),
    ).not.toBeInTheDocument();
  });

  it('does not offer an unrepairable avatar transition without canonical identity', () => {
    render(
      <StudioRemixRunScope isActive>
        <StudioGenerateComposer {...baseProps} />
      </StudioRemixRunScope>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Output type' }));

    expect(screen.getByRole('option', { name: 'Image' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Video' })).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'Avatar' }),
    ).not.toBeInTheDocument();
  });
});
