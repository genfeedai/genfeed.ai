import type {
  AgentApiService,
  GenerationModel,
} from '@genfeedai/agent/services/agent-api.service';
import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { agentChatState } = vi.hoisted(() => ({
  agentChatState: {
    activeThreadId: null as string | null,
  },
}));

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: (selector: (state: typeof agentChatState) => unknown) =>
    selector(agentChatState),
}));

const { brandState } = vi.hoisted(() => ({
  brandState: {
    organizationId: undefined as string | undefined,
    settings: { enabledModelIds: undefined as string[] | undefined } as {
      enabledModelIds: string[] | undefined;
    },
    settingsLoading: false,
  },
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandState,
}));

vi.mock('@ui/dropdowns/model-selector/useModelFavorites', () => ({
  useModelFavorites: () => ({
    favoriteModelKeys: [],
    onFavoriteToggle: vi.fn(),
  }),
}));

const { presetsHookMock } = vi.hoisted(() => ({ presetsHookMock: vi.fn() }));

vi.mock('@genfeedai/agent/hooks/use-agent-generation-setup-presets', () => ({
  agentPresetToGenerationSetupValues: vi.fn(() => ({})),
  useAgentGenerationSetupPresets: presetsHookMock,
}));

vi.mock('@hooks/utils/use-debounce/use-debounce', () => ({
  useDebounce: (value: unknown) => value,
}));

const { recommendGenerationSetupMock } = vi.hoisted(() => ({
  recommendGenerationSetupMock: vi.fn(),
}));

vi.mock('@ui/dropdowns/generation-setup/generation-setup.recommend', () => ({
  recommendGenerationSetup: recommendGenerationSetupMock,
}));

const { generationSetupState, setGenerationSetupFieldMock } = vi.hoisted(() => {
  const state = {
    reasonsByScope: {} as Record<string, Record<string, string>>,
    setupByScope: {} as Record<
      string,
      { sources: Record<string, string>; values: Record<string, unknown> }
    >,
  };
  const setField = vi.fn(
    (
      scope: string,
      key: string,
      value: unknown,
      defaults: Record<string, unknown>,
    ) => {
      const existing = state.setupByScope[scope] ?? {
        sources: {},
        values: { ...defaults },
      };
      state.setupByScope[scope] = {
        sources: { ...existing.sources, [key]: 'user' },
        values: { ...existing.values, [key]: value },
      };
    },
  );
  return { generationSetupState: state, setGenerationSetupFieldMock: setField };
});

vi.mock('@ui/dropdowns/generation-setup/generation-setup.store', () => ({
  applyGenerationSetupPreset: vi.fn(),
  applyGenerationSetupRecommendation: vi.fn(),
  buildAgentGenerationSetupScope: (
    threadId: string | null | undefined,
    generationType: string,
  ) => `agent:${threadId?.trim() || '__new__'}:${generationType}`,
  clearGenerationSetupPreset: vi.fn(),
  resetGenerationSetupAll: vi.fn(),
  resetGenerationSetupField: vi.fn(),
  setGenerationSetupField: setGenerationSetupFieldMock,
  useGenerationSetupStore: (
    selector: (state: typeof generationSetupState) => unknown,
  ) => selector(generationSetupState),
}));

vi.mock('@ui/dropdowns/generation-setup/GenerationSetupPopover', () => ({
  default: function MockGenerationSetupPopover(props: {
    models: GenerationModel[];
    onTypeChange: (nextType: string) => void;
    typeOptions: Array<{ label: string; value: string }>;
  }) {
    return (
      <div
        data-model-count={props.models.length}
        data-testid="generation-setup-popover"
      >
        {props.typeOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => props.onTypeChange(option.value)}
            type="button"
          >
            {`Lock ${option.label}`}
          </button>
        ))}
      </div>
    );
  },
}));

import type { AgentChatInputToolbarProps } from '@genfeedai/agent/components/AgentChatInputToolbar';
import { AgentChatInputToolbar } from '@genfeedai/agent/components/AgentChatInputToolbar';

function buildDefaultProps(
  overrides: Partial<AgentChatInputToolbarProps> = {},
): AgentChatInputToolbarProps {
  return {
    canSendMessage: true,
    disabled: false,
    generationMode: 'auto',
    hasEditor: true,
    isListening: false,
    isTranscribing: false,
    isUploading: false,
    onGenerationModeChange: vi.fn(),
    onGenerationSettingsChange: vi.fn(),
    onInsertReference: vi.fn(),
    onSelectAction: vi.fn(),
    onSend: vi.fn(),
    onStartListening: vi.fn(),
    onStop: undefined,
    onStopListening: vi.fn(),
    promptText: '',
    shouldShowSendButton: true,
    shouldShowVoiceInput: false,
    showStop: false,
    ...overrides,
  };
}

function buildModel(overrides: Partial<GenerationModel> = {}): GenerationModel {
  return {
    category: ModelCategory.IMAGE,
    cost: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'model-1',
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: 'provider/model-1',
    label: 'Model One',
    provider: ModelProvider.REPLICATE,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AgentChatInputToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentChatState.activeThreadId = null;
    brandState.organizationId = undefined;
    brandState.settings = { enabledModelIds: undefined };
    brandState.settingsLoading = false;
    generationSetupState.setupByScope = {};
    generationSetupState.reasonsByScope = {};
    presetsHookMock.mockReturnValue({
      deletePreset: vi.fn(),
      isPresetsLoading: false,
      loadPresets: vi.fn(),
      presets: [],
      savePreset: vi.fn(),
    });
    recommendGenerationSetupMock.mockReturnValue({ values: { type: 'image' } });
  });

  it('renders the setup chip with no models when apiService is not supplied', () => {
    render(<AgentChatInputToolbar {...buildDefaultProps()} />);

    expect(screen.getByTestId('generation-setup-popover')).toHaveAttribute(
      'data-model-count',
      '0',
    );
  });

  it('reports the image default generation settings to the composer on mount', () => {
    const onGenerationSettingsChange = vi.fn();
    render(
      <AgentChatInputToolbar
        {...buildDefaultProps({ onGenerationSettingsChange })}
      />,
    );

    expect(onGenerationSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ aspectRatio: '1:1', outputs: 1 }),
    );
  });

  it('locks the generation type through the popover and reports it to the composer', async () => {
    const onGenerationModeChange = vi.fn();
    render(
      <AgentChatInputToolbar
        {...buildDefaultProps({ onGenerationModeChange })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lock Video' }));

    expect(setGenerationSetupFieldMock).toHaveBeenCalledWith(
      'agent:__new__:video',
      'type',
      'video',
      expect.objectContaining({ type: 'video' }),
    );

    await waitFor(() => {
      expect(onGenerationModeChange).toHaveBeenLastCalledWith('video');
    });
  });

  it('commits image mode when the operator selected an image model', async () => {
    generationSetupState.setupByScope['agent:__new__:image'] = {
      sources: { modelKey: 'user' },
      values: {
        aspectRatio: '1:1',
        brandingMode: 'brand',
        isPromptEnhanceEnabled: true,
        modelKey: 'black-forest-labs/flux-schnell',
        outputs: 1,
        prioritize: 'balanced',
        type: 'image',
      },
    };
    const onGenerationModeChange = vi.fn();

    render(
      <AgentChatInputToolbar
        {...buildDefaultProps({ onGenerationModeChange })}
      />,
    );

    await waitFor(() => {
      expect(onGenerationModeChange).toHaveBeenLastCalledWith('image');
    });
  });

  it('scopes the locked type to the active thread', () => {
    agentChatState.activeThreadId = 'thread-42';
    render(<AgentChatInputToolbar {...buildDefaultProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Lock Video' }));

    expect(setGenerationSetupFieldMock).toHaveBeenCalledWith(
      'agent:thread-42:video',
      'type',
      'video',
      expect.anything(),
    );
  });

  it('fetches the model catalogue and filters it to the active generation category', async () => {
    const imageModel = buildModel({
      category: ModelCategory.IMAGE,
      id: 'model-image',
    });
    const videoModel = buildModel({
      category: ModelCategory.VIDEO,
      id: 'model-video',
    });
    const apiService = {
      getModelsEffect: vi.fn(() =>
        Effect.promise(() => Promise.resolve([imageModel, videoModel])),
      ),
    } as unknown as AgentApiService;

    render(<AgentChatInputToolbar {...buildDefaultProps({ apiService })} />);

    await waitFor(() => {
      expect(screen.getByTestId('generation-setup-popover')).toHaveAttribute(
        'data-model-count',
        '1',
      );
    });
  });

  it('drops the whole catalogue when the model fetch fails', async () => {
    const apiService = {
      getModelsEffect: vi.fn(() =>
        Effect.promise(() => Promise.reject(new Error('network error'))),
      ),
    } as unknown as AgentApiService;

    render(<AgentChatInputToolbar {...buildDefaultProps({ apiService })} />);

    await waitFor(() => {
      expect(screen.getByTestId('generation-setup-popover')).toHaveAttribute(
        'data-model-count',
        '0',
      );
    });
  });
});
