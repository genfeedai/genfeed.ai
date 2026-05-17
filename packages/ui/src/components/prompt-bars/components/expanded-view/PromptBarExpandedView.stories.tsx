import type { PromptBarInternalContextValue } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import { PromptBarInternalContext } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarExpandedView from '@ui/prompt-bars/components/expanded-view/PromptBarExpandedView';
import { useForm } from 'react-hook-form';

function createMockContext(
  overrides: Partial<PromptBarInternalContextValue> = {},
): PromptBarInternalContextValue {
  const mockForm = useForm();
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
    enhancePrompt: async () => {},
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
    getDefaultVideoResolution: () => undefined,
    getMinFromAllModels: () => 0,
    getModelDefaultDuration: () => undefined,
    getModelMaxOutputs: () => 1,
    handleCopy: async () => {},
    handleSubmitForm: () => {},
    handleTextareaChange: () => {},
    handleUndo: () => {},
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
    openGallery: () => {},
    openUpload: () => {},
    pathname: '/studio/image',
    previousPrompt: null,
    profiles: [],
    promptBarHeight: 0,
    referenceSource: '',
    references: [],
    refocusTextarea: () => {},
    requiresReferences: false,
    selectedModelCost: 0,
    selectedModels: [],
    selectedPreset: '',
    selectedProfile: '',
    setEndFrame: () => {},
    setIsAutoMode: () => {},
    setIsCollapsed: () => {},
    setReferenceSource: () => {},
    setReferences: () => {},
    setSelectedPreset: () => {},
    setSelectedProfile: () => {},
    setTextValue: () => {},
    features: { collapsible: true, dragDrop: true },
    showSuggestionsWhenEmpty: true,
    subscriptionTier: undefined,
    supportsInterpolation: false,
    supportsMultipleReferences: false,
    textareaRef: { current: null },
    textareaRegister: { name: 'text', ref: () => {} } as never,
    toggleVoice: () => {},
    trainingIds: new Set(),
    trainings: [],
    triggerConfigChange: () => {},
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

const meta: Meta<typeof PromptBarExpandedView> = {
  component: PromptBarExpandedView,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  title: 'Components/PromptBars/ExpandedView',
};

export default meta;
type Story = StoryObj<typeof PromptBarExpandedView>;

export const Collapsible: Story = {
  render: () => {
    const ctx = createMockContext({
      features: { collapsible: true, dragDrop: true },
    });
    return (
      <PromptBarInternalContext.Provider value={ctx}>
        <PromptBarExpandedView />
      </PromptBarInternalContext.Provider>
    );
  },
};

export const Unified: Story = {
  render: () => {
    const ctx = createMockContext({
      features: { collapsible: false, dragDrop: false },
    });
    return (
      <PromptBarInternalContext.Provider value={ctx}>
        <PromptBarExpandedView />
      </PromptBarInternalContext.Provider>
    );
  },
};
