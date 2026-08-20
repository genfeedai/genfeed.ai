import StudioGenerateSettingsPopover from '@pages/studio/generate/components/StudioGenerateSettingsPopover';
import { StudioRemixRunScope } from '@pages/studio/generate/StudioRemixRunScope';
import { getDefaultStudioGenerateSettings } from '@pages/studio/generate/utils/studio-generate-settings';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  identityHook: vi.fn(),
  useElements: vi.fn(),
}));

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: (...args: unknown[]) => mocks.useElements(...args),
}));

vi.mock('@pages/studio/generate/hooks/useStudioGenerateIdentities', () => ({
  useStudioGenerateIdentities: (...args: unknown[]) =>
    mocks.identityHook(...args),
}));

vi.mock('@ui/primitives/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverPanelContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const settings = {
  ...getDefaultStudioGenerateSettings('video'),
  aspectRatio: '9:16',
  duration: 8,
  folder: 'Campaigns',
  outputs: 3,
  promptTemplate: 'product-demo',
};

describe('StudioGenerateSettingsPopover remix scope', () => {
  it('shows only output fields persisted by the canonical remix edit contract', () => {
    render(
      <StudioRemixRunScope isActive>
        <StudioGenerateSettingsPopover
          onChange={vi.fn()}
          onReset={vi.fn()}
          settings={settings}
          type="video"
        />
      </StudioRemixRunScope>,
    );

    expect(screen.getByText('Output')).toBeVisible();
    expect(screen.getByLabelText('Aspect ratio')).toBeVisible();
    expect(screen.getByLabelText('Duration')).toBeVisible();
    expect(screen.getByLabelText('Number of outputs')).toBeVisible();

    expect(screen.queryByText('Look')).not.toBeInTheDocument();
    expect(screen.queryByText('Identity')).not.toBeInTheDocument();
    expect(screen.queryByText('Brand')).not.toBeInTheDocument();
    expect(screen.queryByText('Routing')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Resolution')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Destination folder'),
    ).not.toBeInTheDocument();
    expect(mocks.useElements).not.toHaveBeenCalled();
    expect(mocks.identityHook).not.toHaveBeenCalled();
  });

  it('retains the full generation settings outside durable remix runs', () => {
    mocks.useElements.mockReturnValue({
      cameraMovements: [],
      cameras: [],
      lenses: [],
      lightings: [],
      moods: [],
      presets: [],
      scenes: [],
      styles: [],
    });
    mocks.identityHook.mockReturnValue({
      avatarOptions: [],
      isLoadingIdentities: false,
      voiceOptions: [],
    });

    render(
      <StudioRemixRunScope isActive={false}>
        <StudioGenerateSettingsPopover
          onChange={vi.fn()}
          onReset={vi.fn()}
          settings={settings}
          type="video"
        />
      </StudioRemixRunScope>,
    );

    expect(screen.getByText('Look')).toBeVisible();
    expect(screen.getByText('Brand')).toBeVisible();
    expect(screen.getByLabelText('Resolution')).toBeVisible();
    expect(screen.getByLabelText('Destination folder')).toBeVisible();
    expect(mocks.useElements).toHaveBeenCalled();
    expect(mocks.identityHook).toHaveBeenCalled();
  });
});
