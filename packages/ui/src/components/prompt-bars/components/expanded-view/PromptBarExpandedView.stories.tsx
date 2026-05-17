import type { PromptBarInternalContextValue } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import { PromptBarInternalContext } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarExpandedView from '@ui/prompt-bars/components/expanded-view/PromptBarExpandedView';
import type { ReactElement } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { useForm } from 'react-hook-form';

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

function PromptBarExpandedViewStory({
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

const meta: Meta<typeof PromptBarExpandedView> = {
  component: PromptBarExpandedView,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  title: 'Components/PromptBars/ExpandedView',
};

export default meta;
type Story = StoryObj<typeof PromptBarExpandedView>;

export const Collapsible: Story = {
  render: () => (
    <PromptBarExpandedViewStory
      overrides={{ features: { collapsible: true, dragDrop: true } }}
    />
  ),
};

export const Unified: Story = {
  render: () => (
    <PromptBarExpandedViewStory
      overrides={{ features: { collapsible: false, dragDrop: false } }}
    />
  ),
};
