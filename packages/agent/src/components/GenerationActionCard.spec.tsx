import {
  ModelCategory,
  ModelKey,
  ModelProvider,
  RouterPriority,
} from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/generation-controls.helper', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@helpers/generation-controls.helper')
    >();

  return {
    ...actual,
    resolveGenerationModelControls: (
      model: IModel | null,
      generationType: 'image' | 'video',
    ) => ({
      availableAspectRatios: model?.aspectRatios?.length
        ? [...model.aspectRatios]
        : ['1:1', '16:9', '9:16', '4:3', '3:4'],
      defaultAspectRatio:
        model?.defaultAspectRatio ?? model?.aspectRatios?.[0] ?? '1:1',
      defaultDuration: model?.defaultDuration ?? 5,
      durationOptions:
        generationType === 'video'
          ? model?.durations?.length
            ? [...model.durations]
            : [5, 10]
          : [],
      showDuration: generationType === 'video',
    }),
  };
});

vi.mock('@ui/dropdowns/model-selector/useModelFavorites', () => ({
  useModelFavorites: () => ({
    favoriteModelKeys: [],
    onFavoriteToggle: vi.fn(),
  }),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: function MockButton(props: {
    children?: ReactNode;
    onClick?: () => void;
  }) {
    return (
      <button type="button" onClick={props.onClick}>
        {props.children}
      </button>
    );
  },
}));

const capturedModelSelectorPopoverProps: {
  autoLabel?: string;
  models?: IModel[];
  onChange?: (_name: string, values: string[]) => void;
  onPrioritizeChange?: (prioritize: RouterPriority) => void;
  prioritize?: RouterPriority;
  values?: string[];
} = {};

vi.mock('@ui/dropdowns/model-selector/ModelSelectorPopover', () => ({
  default: (props: {
    autoLabel?: string;
    models: IModel[];
    onChange?: (_name: string, values: string[]) => void;
    onPrioritizeChange?: (prioritize: RouterPriority) => void;
    prioritize?: RouterPriority;
    values: string[];
  }) => {
    capturedModelSelectorPopoverProps.autoLabel = props.autoLabel;
    capturedModelSelectorPopoverProps.models = props.models;
    capturedModelSelectorPopoverProps.onChange = props.onChange;
    capturedModelSelectorPopoverProps.onPrioritizeChange =
      props.onPrioritizeChange;
    capturedModelSelectorPopoverProps.prioritize = props.prioritize;
    capturedModelSelectorPopoverProps.values = props.values;

    return <div data-testid="model-selector-popover">{props.autoLabel}</div>;
  },
}));

vi.mock('@ui/dropdowns/aspect-ratio/AspectRatioDropdown', () => ({
  default: ({ placeholder }: { placeholder?: string }) => (
    <div data-testid="button-dropdown">{placeholder}</div>
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

const storeState = {
  activeThreadId: 'thread-1',
  setThreadUiBusy: vi.fn(),
};

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}));

import { GenerationActionCard } from './GenerationActionCard';

function createModel(
  overrides: Partial<IModel> & Pick<IModel, 'key' | 'label'>,
): IModel {
  return {
    category: ModelCategory.IMAGE,
    cost: 1,
    createdAt: '2026-01-01',
    id: overrides.key,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: overrides.key,
    label: overrides.label,
    provider: ModelProvider.REPLICATE,
    updatedAt: '2026-01-01',
    ...overrides,
  } as IModel;
}

describe('GenerationActionCard', () => {
  beforeEach(() => {
    storeState.activeThreadId = 'thread-1';
    storeState.setThreadUiBusy.mockReset();
    capturedModelSelectorPopoverProps.autoLabel = undefined;
    capturedModelSelectorPopoverProps.models = undefined;
    capturedModelSelectorPopoverProps.onChange = undefined;
    capturedModelSelectorPopoverProps.onPrioritizeChange = undefined;
    capturedModelSelectorPopoverProps.prioritize = undefined;
    capturedModelSelectorPopoverProps.values = undefined;
  });

  it('formats structured prompts with readable section breaks', async () => {
    render(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt:
              'SCENE: Professional boxing ring. SUBJECT: Athletic boxer in black gear. BACKGROUND: Blurred arena crowd. LIGHTING: Dramatic overhead spotlights. STYLE: Photorealistic sports photography. NEGATIVE: No text or watermarks.',
          },
          generationType: 'image',
          id: 'action-1',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={{
          baseUrl: 'http://local.genfeed.ai:3001',
          createPrompt: vi.fn(),
          generateIngredient: vi.fn(),
          getModels: vi.fn().mockResolvedValue([]),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue(
        [
          'SCENE: Professional boxing ring.',
          'SUBJECT: Athletic boxer in black gear.',
          'BACKGROUND: Blurred arena crowd.',
          'LIGHTING: Dramatic overhead spotlights.',
          'STYLE: Photorealistic sports photography.',
          'NEGATIVE: No text or watermarks.',
        ].join('\n'),
      );
    });
  });

  it('converts escaped newlines in generated prompts into real line breaks', async () => {
    render(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt:
              'SCENE: Professional boxing ring.\\n\\nSUBJECT: Athletic boxer in black gear.',
          },
          generationType: 'image',
          id: 'action-2',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={{
          baseUrl: 'http://local.genfeed.ai:3001',
          createPrompt: vi.fn(),
          generateIngredient: vi.fn(),
          getModels: vi.fn().mockResolvedValue([]),
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue(
        'SCENE: Professional boxing ring.\nSUBJECT: Athletic boxer in black gear.',
      );
    });
  });

  it('passes Genfeed image models into the shared model selector', async () => {
    const imageModel = createModel({
      key: ModelKey.REPLICATE_GOOGLE_NANO_BANANA,
      label: 'Nano Banana',
    });
    const videoModel = createModel({
      category: ModelCategory.VIDEO,
      key: ModelKey.REPLICATE_GOOGLE_VEO_3,
      label: 'Veo 3',
    });

    render(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'SCENE: Professional boxing ring.',
          },
          generationType: 'image',
          id: 'action-3',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={{
          baseUrl: 'http://local.genfeed.ai:3001',
          createPrompt: vi.fn(),
          generateIngredient: vi.fn(),
          getModels: vi.fn().mockResolvedValue([imageModel, videoModel]),
        }}
      />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.models).toEqual([imageModel]);
    });

    expect(screen.getByTestId('model-selector-popover')).toHaveTextContent(
      'Auto · Best Quality',
    );
    expect(capturedModelSelectorPopoverProps.values).toEqual([
      '__auto_model__',
    ]);
    expect(capturedModelSelectorPopoverProps.prioritize).toBe(
      RouterPriority.QUALITY,
    );
  });

  it('maps auto priority state into the shared selector label', async () => {
    render(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'SCENE: Professional boxing ring.',
          },
          generationType: 'image',
          id: 'action-4',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={{
          baseUrl: 'http://local.genfeed.ai:3001',
          createPrompt: vi.fn(),
          generateIngredient: vi.fn(),
          getModels: vi.fn().mockResolvedValue([]),
        }}
      />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.onPrioritizeChange).toBeTypeOf(
        'function',
      );
    });

    capturedModelSelectorPopoverProps.onPrioritizeChange?.(
      RouterPriority.SPEED,
    );

    await waitFor(() => {
      expect(screen.getByTestId('model-selector-popover')).toHaveTextContent(
        'Auto · Fastest',
      );
    });
  });

  it('allows leaving auto mode without forcing auto back on', async () => {
    render(
      <GenerationActionCard
        action={{
          generationParams: {
            prompt: 'SCENE: Professional boxing ring.',
          },
          generationType: 'image',
          id: 'action-5',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={{
          baseUrl: 'http://local.genfeed.ai:3001',
          createPrompt: vi.fn(),
          generateIngredient: vi.fn(),
          getModels: vi.fn().mockResolvedValue([]),
        }}
      />,
    );

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.values).toEqual([
        '__auto_model__',
      ]);
    });

    capturedModelSelectorPopoverProps.onChange?.('models', []);

    await waitFor(() => {
      expect(capturedModelSelectorPopoverProps.values).toEqual([]);
    });
  });

  it('retries generation with current state and marks the active thread as locally busy', async () => {
    const createPrompt = vi.fn().mockResolvedValue({ id: 'prompt-1' });
    const generateIngredient = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          '500 - Request to https://api.replicate.com/v1/predictions failed with status 422 Unprocessable Entity: {"title":"Invalid version or not permitted","detail":"The specified version does not exist"}',
        ),
      )
      .mockResolvedValueOnce({
        id: 'image-1',
        url: 'https://cdn.test/image.png',
      });

    render(
      <GenerationActionCard
        action={{
          generationParams: {
            model: ModelKey.GENFEED_AI_Z_IMAGE_TURBO,
            prompt: 'SCENE: Professional boxing ring.',
          },
          generationType: 'image',
          id: 'action-6',
          title: 'Generate Image',
          type: 'generation_action_card',
        }}
        apiService={{
          baseUrl: 'http://local.genfeed.ai:3001',
          createPrompt,
          generateIngredient,
          getModels: vi.fn().mockResolvedValue([
            createModel({
              key: ModelKey.GENFEED_AI_Z_IMAGE_TURBO,
              label: 'Z-Image Turbo',
            }),
          ]),
        }}
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /generate image/i }),
    );

    expect(
      await screen.findByText(
        /selected model is misconfigured or unavailable/i,
      ),
    ).toBeInTheDocument();
    expect(storeState.setThreadUiBusy).toHaveBeenCalledWith('thread-1', true);
    expect(storeState.setThreadUiBusy).toHaveBeenCalledWith('thread-1', false);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(generateIngredient).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('Open in Library')).toBeInTheDocument();
  });
});
