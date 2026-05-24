import type { PromptBarInternalContextValue } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import { PromptBarInternalContext } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import PromptBarExpandedView from '@ui/prompt-bars/components/expanded-view/PromptBarExpandedView';
import type { ReactElement } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-hook-form', () => ({
  useForm: vi.fn(() => ({
    formState: { errors: {}, isValid: true },
    getValues: vi.fn(() => ''),
    register: vi.fn(() => ({ name: 'text', ref: vi.fn() })),
    setValue: vi.fn(),
    watch: vi.fn(),
  })),
  useWatch: vi.fn(),
}));

function createMockContext(
  mockForm: UseFormReturn<FieldValues>,
  overrides: Partial<PromptBarInternalContextValue> = {},
): PromptBarInternalContextValue {
  return {
    activeGenerations: [],
    attachedPromptAssets: [],
    avatars: [],
    categoryType: undefined,
    controlClass: '',
    currentConfig: { buttons: {}, placeholder: 'Test' } as never,
    currentModelCategory: null,
    dragError: null,
    endFrame: null,
    enhancePrompt: vi.fn(),
    filteredCameraMovements: [],
    filteredCameras: [],
    filteredFontFamilies: [],
    filteredLenses: [],
    filteredLightings: [],
    filteredMoods: [],
    filteredPresets: [],
    filteredScenes: [],
    filteredStyles: [],
    folders: [],
    form: mockForm as never,
    formatIcon: null,
    generateLabel: 'Generate',
    getDefaultVideoResolution: vi.fn(),
    getMinFromAllModels: vi.fn(() => 0),
    getModelDefaultDuration: vi.fn(),
    getModelMaxOutputs: vi.fn(() => 1),
    handleCopy: vi.fn(),
    handleSubmitForm: vi.fn(),
    handleTextareaChange: vi.fn(),
    handleUndo: vi.fn(),
    hasAnyImagenModelValue: false,
    hasAnyResolutionOptionsValue: false,
    hasAudioToggleValue: false,
    hasEndFrameValue: false,
    hasModelWithoutDurationEditingValue: false,
    hasSpeechValue: false,
    iconButtonClass: '',
    isAdvancedControlsEnabled: false,
    isAdvancedMode: false,
    isAutoMode: false,
    isCollapsed: false,
    isDisabledState: false,
    isDragActive: false,
    isEnhancing: false,
    isGenerateBlocked: false,
    isGenerateDisabled: false,
    isGenerating: false,
    isModelNotSet: false,
    isOnlyImagenModelsValue: false,
    isProcessing: false,
    isRecording: false,
    isSupported: false,
    maxReferenceCount: 1,
    maxSuggestions: 3,
    modelDropdownRef: { current: null },
    models: [],
    normalizedWatchedModels: [],
    openGallery: vi.fn(),
    openUpload: vi.fn(),
    pathname: '/studio/image',
    previousPrompt: null,
    profiles: [],
    promptBarHeight: 0,
    referenceSource: '',
    references: [],
    refocusTextarea: vi.fn(),
    requiresReferences: false,
    selectedModelCost: 0,
    selectedModels: [],
    selectedPreset: '',
    selectedProfile: '',
    setEndFrame: vi.fn(),
    setIsAutoMode: vi.fn(),
    setIsCollapsed: vi.fn(),
    setReferenceSource: vi.fn(),
    setReferences: vi.fn(),
    setSelectedPreset: vi.fn(),
    setSelectedProfile: vi.fn(),
    setTextValue: vi.fn(),
    features: { collapsible: true, dragDrop: true },
    showSuggestionsWhenEmpty: true,
    subscriptionTier: undefined,
    supportsInterpolation: false,
    supportsMultipleReferences: false,
    textareaRef: { current: null },
    textareaRegister: { name: 'text', ref: vi.fn() } as never,
    toggleVoice: vi.fn(),
    trainingIds: new Set(),
    trainings: [],
    triggerConfigChange: vi.fn(),
    videoDurations: [],
    voices: [],
    watchedDuration: undefined,
    watchedFormat: 'portrait' as never,
    watchedModel: '',
    watchedModels: [],
    watchedQuality: undefined,
    watchedSpeech: undefined,
    watchedWidth: undefined,
    watchedHeight: undefined,
    ...overrides,
  };
}

function PromptBarExpandedViewTestProvider({
  overrides,
}: {
  overrides: Partial<PromptBarInternalContextValue>;
}): ReactElement {
  const mockForm = useForm();
  const ctx = createMockContext(mockForm, overrides);

  return (
    <PromptBarInternalContext.Provider value={ctx}>
      <PromptBarExpandedView />
    </PromptBarInternalContext.Provider>
  );
}

function renderWithContext(
  overrides: Partial<PromptBarInternalContextValue> = {},
) {
  return render(<PromptBarExpandedViewTestProvider overrides={overrides} />);
}

describe('PromptBarExpandedView', () => {
  it('should render without crashing', () => {
    const { container } = renderWithContext();
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render drag zone when dragDrop is enabled', () => {
    const { container } = renderWithContext({
      features: { collapsible: true, dragDrop: true },
    });
    expect(
      container.querySelector('[data-testid="promptbar-dropzone"]'),
    ).toBeInTheDocument();
  });

  it('should not render drag zone when dragDrop is disabled', () => {
    const { container } = renderWithContext({
      features: { collapsible: false, dragDrop: false },
    });
    expect(
      container.querySelector('[data-testid="promptbar-dropzone"]'),
    ).not.toBeInTheDocument();
  });
});
