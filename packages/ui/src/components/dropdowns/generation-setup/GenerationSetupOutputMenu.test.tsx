import '@testing-library/jest-dom/vitest';
import { ModelCategory, RouterPriority } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  GenerationSetup,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type { StudioPlaygroundCapabilities } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import GenerationSetupOutputMenu from '@ui/dropdowns/generation-setup/GenerationSetupOutputMenu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const MUSIC_CAPABILITIES: StudioPlaygroundCapabilities = {
  hasAspectRatio: false,
  hasBrandEnrichment: false,
  hasDuration: true,
  hasIdentity: false,
  hasInstrumentalToggle: true,
  hasLook: false,
  hasLyrics: true,
  hasModelSelection: true,
  hasOutputs: true,
  hasReferences: false,
  hasSpeech: false,
  hasStyle: true,
};

function buildSetup(
  values: Partial<GenerationSetupValues> = {},
  sources: GenerationSetup['sources'] = {},
): GenerationSetup {
  return {
    sources,
    values: {
      aspectRatio: '1:1',
      brandingMode: 'off',
      duration: 30,
      instrumental: false,
      isPromptEnhanceEnabled: true,
      lyrics: '',
      modelKey: MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
      outputs: 1,
      prioritize: RouterPriority.BALANCED,
      style: '',
      type: 'music',
      ...values,
    },
  };
}

function renderMenu(
  overrides: {
    capabilities?: Partial<StudioPlaygroundCapabilities>;
    setup?: GenerationSetup;
  } = {},
) {
  const onSetField = vi.fn();
  const onResetField = vi.fn();
  render(
    <DropdownMenu modal={false} open>
      <DropdownMenuTrigger>open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <GenerationSetupOutputMenu
          capabilities={{ ...MUSIC_CAPABILITIES, ...overrides.capabilities }}
          onResetField={onResetField}
          onSetField={onSetField}
          setup={overrides.setup ?? buildSetup()}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  return { onResetField, onSetField };
}

function openSubmenu(name: RegExp): void {
  fireEvent.keyDown(screen.getByRole('menuitem', { name }), {
    key: 'ArrowRight',
  });
}

function optionLabels(group: string): string[] {
  return Array.from(
    screen
      .getByRole('group', { name: group })
      .querySelectorAll('[role=menuitem]'),
  ).map((item) => item.textContent?.trim() ?? '');
}

describe('GenerationSetupOutputMenu — music controls', () => {
  it('renders Style, Instrumental, and Lyrics for a music-capable setup', () => {
    renderMenu();

    expect(screen.getByLabelText('Style')).toBeInTheDocument();
    expect(screen.getByLabelText('Instrumental')).toBeInTheDocument();
    expect(screen.getByLabelText('Lyrics')).toBeInTheDocument();
  });

  it('hides Style, Instrumental, and Lyrics when the type capabilities disable them', () => {
    renderMenu({
      capabilities: {
        hasInstrumentalToggle: false,
        hasLyrics: false,
        hasStyle: false,
      },
    });

    expect(screen.queryByLabelText('Style')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Instrumental')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Lyrics')).not.toBeInTheDocument();
  });

  it('disables the Lyrics field once Instrumental is on', () => {
    renderMenu({ setup: buildSetup({ instrumental: true }) });

    expect(screen.getByLabelText('Lyrics')).toBeDisabled();
  });

  it("offers only the selected model's own duration grid (Eleven Music: 10-90s)", () => {
    renderMenu({
      setup: buildSetup({ modelKey: MODEL_KEYS.FAL_ELEVENLABS_MUSIC }),
    });
    openSubmenu(/Duration/);

    expect(optionLabels('Duration')).toEqual([
      '10s',
      '15s',
      '20s',
      '30s',
      '45s',
      '60s',
      '90s',
    ]);
  });

  it("narrows to MusicGen's own 5-30s grid instead of the cross-provider superset", () => {
    renderMenu({
      setup: buildSetup({ modelKey: MODEL_KEYS.REPLICATE_META_MUSICGEN }),
    });
    openSubmenu(/Duration/);

    expect(optionLabels('Duration')).toEqual(['5s', '10s', '15s', '30s']);
  });

  it('hides Duration entirely for a model with no duration parameter (Lyria 3 Pro)', () => {
    renderMenu({ setup: buildSetup({ modelKey: MODEL_KEYS.FAL_LYRIA3_PRO }) });

    expect(
      screen.queryByRole('menuitem', { name: /Duration/ }),
    ).not.toBeInTheDocument();
  });

  it('does not rewrite the duration on render', () => {
    const { onSetField } = renderMenu({
      setup: buildSetup({
        duration: 90,
        modelKey: MODEL_KEYS.REPLICATE_META_MUSICGEN,
      }),
    });

    expect(onSetField).not.toHaveBeenCalled();
  });

  it('keeps typing in Style out of the menu typeahead', () => {
    const { onSetField } = renderMenu();
    const style = screen.getByLabelText('Style');

    fireEvent.change(style, { target: { value: 'lofi' } });
    expect(onSetField).toHaveBeenCalledWith('style', 'lofi');
  });
});

describe('GenerationSetupOutputMenu — aspect ratio', () => {
  const imageCapabilities = { hasAspectRatio: true, hasDuration: false };

  it('offers Auto first, with a shape for each ratio', () => {
    renderMenu({
      capabilities: imageCapabilities,
      setup: buildSetup({ type: 'image' }),
    });
    openSubmenu(/Aspect ratio/);

    const labels = optionLabels('Aspect ratio');
    expect(labels[0]).toBe('Auto');
    expect(labels).toContain('16:9');
    expect(
      screen
        .getByRole('group', { name: 'Aspect ratio' })
        .querySelectorAll('svg').length,
    ).toBeGreaterThanOrEqual(labels.length);
  });

  it('hands Auto back to the agent when the model has no auto value', () => {
    const { onResetField, onSetField } = renderMenu({
      capabilities: imageCapabilities,
      setup: buildSetup({ type: 'image' }, { aspectRatio: 'user' }),
    });
    openSubmenu(/Aspect ratio/);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Auto' }));
    expect(onResetField).toHaveBeenCalledWith('aspectRatio');
    expect(onSetField).not.toHaveBeenCalled();
  });

  it('sets a concrete ratio', () => {
    const { onSetField } = renderMenu({
      capabilities: imageCapabilities,
      setup: buildSetup({ type: 'image' }),
    });
    openSubmenu(/Aspect ratio/);

    fireEvent.click(screen.getByRole('menuitem', { name: '16:9' }));
    expect(onSetField).toHaveBeenCalledWith('aspectRatio', '16:9');
  });
});

describe('sanity: music capability models used above', () => {
  it('are music models (guards against silent catalog drift)', async () => {
    const { MODEL_OUTPUT_CAPABILITIES } = await import(
      '@genfeedai/contracts/constants'
    );
    for (const key of [
      MODEL_KEYS.REPLICATE_META_MUSICGEN,
      MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
      MODEL_KEYS.FAL_LYRIA3_PRO,
    ]) {
      expect(MODEL_OUTPUT_CAPABILITIES[key]?.category).toBe(
        ModelCategory.MUSIC,
      );
    }
  });
});
