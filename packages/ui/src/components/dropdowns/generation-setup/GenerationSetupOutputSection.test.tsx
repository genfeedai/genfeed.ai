import { ModelCategory, RouterPriority } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { CrunInputControls } from '@genfeedai/contracts/interfaces';
import type {
  GenerationSetup,
  GenerationSetupValues,
} from '@genfeedai/contracts/interfaces/studio/generation-setup.interface';
import type { StudioGenerateCapabilities } from '@genfeedai/contracts/interfaces/studio/studio-generate.interface';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GenerationSetupOutputSection from '@ui/dropdowns/generation-setup/GenerationSetupOutputSection';
import { useGenerationSetupStore } from '@ui/dropdowns/generation-setup/generation-setup.store';
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

  it('does not reconcile store state from an Output-only effect', () => {
    const onSetField = vi.fn();
    renderSection({
      onSetField,
      setup: buildSetup({
        duration: 90,
        modelKey: MODEL_KEYS.REPLICATE_META_MUSICGEN,
      }),
    });

    // MusicGen's grid tops out at 30 — 90 is nearer to 30 than to any other option.
    expect(onSetField).not.toHaveBeenCalled();
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

function StoredMusicOutput() {
  const setup = useGenerationSetupStore(
    (state) => state.setupByScope['test:music'],
  );
  return (
    <GenerationSetupOutputSection
      capabilities={MUSIC_CAPABILITIES}
      onResetField={() => {}}
      onSetField={(key, value) =>
        useGenerationSetupStore
          .getState()
          .setField('test:music', key, value, buildSetup().values)
      }
      reasons={{}}
      setup={setup}
    />
  );
}

describe('controlled lyrics editing', () => {
  it.each([
    MODEL_KEYS.FAL_ELEVENLABS_MUSIC,
    MODEL_KEYS.FAL_LYRIA3_PRO,
    MODEL_KEYS.MUREKA_V9,
  ])(
    'preserves spaces and Enter through store normalization for %s',
    async (modelKey) => {
      useGenerationSetupStore.setState({
        setupByScope: { 'test:music': buildSetup({ modelKey }) },
      });
      render(<StoredMusicOutput />);
      const user = userEvent.setup();
      const lyrics = screen.getByLabelText('Lyrics');
      await user.type(lyrics, 'Verse ');
      expect(lyrics).toHaveValue('Verse ');
      await user.type(lyrics, 'one{Enter}');
      expect(lyrics).toHaveValue('Verse one\n');
      await user.type(lyrics, 'Chorus');
      expect(
        useGenerationSetupStore.getState().setupByScope['test:music'].values
          .lyrics,
      ).toBe('Verse one\nChorus');
    },
  );
});

describe('reviewed Crun output choices', () => {
  it('narrows ratios and counts and excludes auto without a reference', () => {
    render(
      <GenerationSetupOutputSection
        capabilities={{ ...MUSIC_CAPABILITIES, hasAspectRatio: true }}
        setup={buildSetup({ type: 'image' })}
        reasons={{}}
        onResetField={vi.fn()}
        onSetField={vi.fn()}
        referenceCount={0}
        inputControls={{
          version: 'reviewed',
          endpoint: 'google/nano-banana-pro',
          mediaKind: 'image',
          maxOutputs: 4,
          isBatchSupported: false,
          referenceRoles: {},
          isAutoAspectReferenceRequired: true,
          fields: {
            aspect_ratio: {
              type: 'string',
              isRequired: false,
              enum: ['1:1', 'auto'],
            },
          },
        }}
      />,
    );
    expect(screen.getByLabelText('Aspect ratio')).toHaveTextContent('1:1');
    expect(screen.getByLabelText('Aspect ratio')).not.toHaveTextContent('auto');
    expect(screen.getByLabelText('Outputs')).not.toHaveTextContent('8');
  });
});

function controlsFor(endpoint = 'kling/v2-5-turbo-pro'): CrunInputControls {
  const kling = endpoint === 'kling/v2-5-turbo-pro';
  return {
    endpoint,
    version: 'reviewed-video-v1',
    mediaKind: 'video',
    maxOutputs: 4,
    isBatchSupported: false,
    isAutoAspectReferenceRequired: false,
    referenceRoles: kling ? { img_urls: 'image' } : {},
    videoRules: {
      referenceMode: kling ? 'start-end' : 'none',
      omitAspectRatioWithReferences: kling,
      availableDurations: kling ? [5, 10] : [8],
    },
    fields: {
      prompt: {
        type: 'string',
        isRequired: true,
        minLength: 1,
        maxLength: kling ? 2500 : 5000,
      },
      duration: {
        type: 'integer',
        isRequired: false,
        enum: kling ? [5, 10] : [4, 6, 8],
        default: kling ? 5 : 8,
      },
      aspect_ratio: {
        type: 'string',
        isRequired: false,
        enum: kling ? ['1:1', '16:9', '9:16'] : ['16:9', '9:16'],
        default: '16:9',
      },
      ...(kling
        ? {
            negative_prompt: {
              type: 'string' as const,
              isRequired: false,
              maxLength: 2000,
            },
            cfg_scale: {
              type: 'number' as const,
              isRequired: false,
              minimum: 0,
              maximum: 1,
              default: 0.5,
            },
            img_urls: {
              type: 'array' as const,
              isRequired: false,
              format: 'uri' as const,
              minItems: 1,
              maxItems: 2,
            },
          }
        : {
            resolution: {
              type: 'string' as const,
              isRequired: false,
              enum: ['720p', '1080p', '4k'],
              default: '720p',
            },
            translate_prompt: {
              type: 'boolean' as const,
              isRequired: false,
              default: true,
            },
          }),
    },
  };
}

describe('Crun video duplicate scalar suppression', () => {
  it('keeps group count while leaving video aspect and duration to the shared component', () => {
    render(
      <GenerationSetupOutputSection
        capabilities={{
          ...MUSIC_CAPABILITIES,
          hasAspectRatio: true,
          hasDuration: true,
          hasOutputs: true,
        }}
        setup={buildSetup({ type: 'video', outputs: 4 })}
        inputControls={controlsFor()}
        reasons={{}}
        onResetField={vi.fn()}
        onSetField={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText('Aspect ratio')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Duration')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Outputs')).toBeInTheDocument();
  });
});
