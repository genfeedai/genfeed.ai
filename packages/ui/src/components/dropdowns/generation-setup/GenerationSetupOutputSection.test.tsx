import { ModelCategory, RouterPriority } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  GenerationSetup,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type { StudioGenerateCapabilities } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import { render, screen } from '@testing-library/react';
import GenerationSetupOutputSection from '@ui/dropdowns/generation-setup/GenerationSetupOutputSection';
import { Children, isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

/**
 * `SelectTrigger`'s `aria-label` is what makes the real component
 * accessible-by-label — it lives on a nested child, not a prop of `Select`
 * itself, so pull it off the still-unrendered `children` array (plain React
 * element descriptors) before deciding what to render.
 */
function extractAriaLabel(children: ReactNode): string | undefined {
  let label: string | undefined;
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    const props = child.props as Record<string, unknown>;
    if (typeof props['aria-label'] === 'string') {
      label = props['aria-label'];
    }
  });
  return label;
}

// The real primitives render through Radix portals, which JSDOM doesn't need
// for this test — a native `<select>` stand-in is enough to assert on the
// rendered option grid and drive value changes without portal plumbing.
vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <select
      aria-label={extractAriaLabel(children)}
      onChange={(event) => onValueChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

const MUSIC_CAPABILITIES: StudioGenerateCapabilities = {
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
): GenerationSetup {
  return {
    sources: {},
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

function renderSection(
  overrides: {
    capabilities?: Partial<StudioGenerateCapabilities>;
    onResetField?: (key: string) => void;
    onSetField?: (key: string, value: unknown) => void;
    setup?: GenerationSetup;
  } = {},
) {
  const onSetField = overrides.onSetField ?? vi.fn();
  const onResetField = overrides.onResetField ?? vi.fn();
  render(
    <GenerationSetupOutputSection
      capabilities={{ ...MUSIC_CAPABILITIES, ...overrides.capabilities }}
      onResetField={onResetField as never}
      onSetField={onSetField as never}
      reasons={{}}
      setup={overrides.setup ?? buildSetup()}
    />,
  );
  return { onResetField, onSetField };
}

describe('GenerationSetupOutputSection — music controls', () => {
  it('renders Style, Instrumental, and Lyrics for a music-capable setup', () => {
    renderSection();

    expect(screen.getByLabelText('Style')).toBeInTheDocument();
    expect(screen.getByLabelText('Instrumental')).toBeInTheDocument();
    expect(screen.getByLabelText('Lyrics')).toBeInTheDocument();
  });

  it('hides Style, Instrumental, and Lyrics when the type capabilities disable them', () => {
    renderSection({
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
    renderSection({ setup: buildSetup({ instrumental: true }) });

    expect(screen.getByLabelText('Lyrics')).toBeDisabled();
  });

  it("offers only the selected model's own duration grid (Eleven Music: 10-90s)", () => {
    renderSection({
      setup: buildSetup({ modelKey: MODEL_KEYS.FAL_ELEVENLABS_MUSIC }),
    });

    const select = screen.getByLabelText('Duration') as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value);
    expect(values).toEqual(['10', '15', '20', '30', '45', '60', '90']);
  });

  it("narrows to MusicGen's own 5-30s grid instead of the cross-provider superset", () => {
    renderSection({
      setup: buildSetup({
        modelKey: MODEL_KEYS.REPLICATE_META_MUSICGEN,
      }),
    });

    const select = screen.getByLabelText('Duration') as HTMLSelectElement;
    const values = Array.from(select.options).map((option) => option.value);
    expect(values).toEqual(['5', '10', '15', '30']);
  });

  it('hides Duration entirely for a model with no duration parameter (Lyria 3 Pro)', () => {
    renderSection({
      setup: buildSetup({ modelKey: MODEL_KEYS.FAL_LYRIA3_PRO }),
    });

    expect(screen.queryByLabelText('Duration')).not.toBeInTheDocument();
  });

  it('snaps an out-of-range duration to the nearest legal value instead of silently sending it', () => {
    const onSetField = vi.fn();
    renderSection({
      onSetField,
      setup: buildSetup({
        duration: 90,
        modelKey: MODEL_KEYS.REPLICATE_META_MUSICGEN,
      }),
    });

    // MusicGen's grid tops out at 30 — 90 is nearer to 30 than to any other option.
    expect(onSetField).toHaveBeenCalledWith('duration', 30);
  });

  it('does not touch duration when it is already inside the resolved grid', () => {
    const onSetField = vi.fn();
    renderSection({
      onSetField,
      setup: buildSetup({
        duration: 15,
        modelKey: MODEL_KEYS.REPLICATE_META_MUSICGEN,
      }),
    });

    expect(onSetField).not.toHaveBeenCalled();
  });
});

describe('sanity: MusicGen and Eleven Music capability durations used above', () => {
  it('are the ones this suite assumes (guards against silent catalog drift)', async () => {
    const { MODEL_OUTPUT_CAPABILITIES } = await import(
      '@genfeedai/contracts/constants'
    );
    const musicgen =
      MODEL_OUTPUT_CAPABILITIES[MODEL_KEYS.REPLICATE_META_MUSICGEN];
    const elevenMusic =
      MODEL_OUTPUT_CAPABILITIES[MODEL_KEYS.FAL_ELEVENLABS_MUSIC];
    const lyria = MODEL_OUTPUT_CAPABILITIES[MODEL_KEYS.FAL_LYRIA3_PRO];

    expect(musicgen?.category).toBe(ModelCategory.MUSIC);
    expect(elevenMusic?.category).toBe(ModelCategory.MUSIC);
    expect(lyria?.category).toBe(ModelCategory.MUSIC);
  });
});
