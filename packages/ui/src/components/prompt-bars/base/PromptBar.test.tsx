import { PromptBarInternalContext } from '@genfeedai/contexts/ui/prompt-bar-internal-context';
import { IngredientCategory, IngredientFormat } from '@genfeedai/contracts';
import {
  getDefaultVideoResolution,
  hasResolutionOptions,
} from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';
import type { PromptBarProps } from '@genfeedai/props/studio/prompt-bar.props';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import PromptBar from '@ui/prompt-bars/base/PromptBar';
import { RectangleHorizontal, Square } from 'lucide-react';
import type { ReactElement } from 'react';
import { use } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ResizeObserver globally
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

const mockPush = vi.fn();
const mockUsePromptBarFilters = vi.fn();
const mockUsePromptBarModels = vi.fn();
const mockUsePromptBarPricing = vi.fn();
const mockUsePromptBarReferences = vi.fn();
const mockUsePromptBarSync = vi.fn();
const mockUseSpeechRecording = vi.fn();
const mockUseWatch = vi.fn();
const mockSetTextValue = vi.fn();
const mockFlushConfigChange = vi.fn();
const mockHandleTextChange = vi.fn();
const mockTriggerConfigChange = vi.fn();
const mockHandleTextareaChange = vi.fn();
const mockEnhancePrompt = vi.fn();
const mockHandleCopy = vi.fn();
const mockHandleUndo = vi.fn();
const mockOpenGallery = vi.fn();
const mockOpenUpload = vi.fn();
const mockNotifications = {
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
};
const mockClipboard = { copy: vi.fn() };
let collapsedViewProps: Record<string, unknown> | undefined;
let expandedViewProps: Record<string, unknown> | undefined;
interface SpeechTranscriptionResult {
  creditsUsed?: number;
  text?: string;
}

interface SpeechRecordingOptions {
  onTranscription?: (result: SpeechTranscriptionResult) => void;
}

let speechHandlers: SpeechRecordingOptions = {};

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/studio/storyboard',
  useParams: () => ({
    brandSlug: 'test-brand',
    orgSlug: 'test-org',
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock all context providers
vi.mock('@genfeedai/contexts/ui/asset-selection-context', () => ({
  useAssetSelection: () => ({
    activeGenerations: [],
  }),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'test-brand-id',
    organizationId: 'test-org-id',
    selectedBrand: null,
    settings: { isVoiceControlEnabled: true },
  }),
}));

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: { settings: { isAdvancedMode: true } },
  }),
}));

// Mock providers
vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useGalleryModal: () => ({
      openGallery: mockOpenGallery,
    }),
    useUploadModal: () => ({
      openUpload: mockOpenUpload,
    }),
  }),
);

// Mock hooks
vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock(
  '@genfeedai/hooks/media/use-speech-recording/use-speech-recording',
  () => ({
    useSpeechRecording: (options?: SpeechRecordingOptions) =>
      mockUseSpeechRecording(options),
  }),
);
vi.mock(
  '@genfeedai/hooks/prompt-bar/use-prompt-bar-enhancement/use-prompt-bar-enhancement',
  () => ({
    usePromptBarEnhancement: () => ({
      enhancePrompt: mockEnhancePrompt,
      handleCopy: mockHandleCopy,
      handleUndo: mockHandleUndo,
      isEnhancing: false,
      previousPrompt: '',
    }),
  }),
);

vi.mock(
  '@genfeedai/hooks/prompt-bar/use-prompt-bar-filters/use-prompt-bar-filters',
  () => ({
    usePromptBarFilters: (...args: unknown[]) =>
      mockUsePromptBarFilters(...args),
  }),
);

const mockForm = {
  control: {},
  formState: { isValid: true },
  getValues: vi.fn(),
  register: vi.fn().mockReturnValue({}),
  setValue: vi.fn(),
  watch: vi.fn().mockReturnValue(1),
};

vi.mock(
  '@genfeedai/hooks/prompt-bar/use-prompt-bar-form/use-prompt-bar-form',
  () => ({
    usePromptBarForm: () => ({
      currentFormat: IngredientFormat.PORTRAIT,
      form: mockForm,
    }),
  }),
);

vi.mock(
  '@genfeedai/hooks/prompt-bar/use-prompt-bar-models/use-prompt-bar-models',
  () => ({
    usePromptBarModels: (...args: unknown[]) => mockUsePromptBarModels(...args),
  }),
);

vi.mock(
  '@genfeedai/hooks/prompt-bar/use-prompt-bar-pricing/use-prompt-bar-pricing',
  () => ({
    usePromptBarPricing: (...args: unknown[]) =>
      mockUsePromptBarPricing(...args),
  }),
);

vi.mock(
  '@genfeedai/hooks/prompt-bar/use-prompt-bar-references/use-prompt-bar-references',
  () => ({
    usePromptBarReferences: (...args: unknown[]) =>
      mockUsePromptBarReferences(...args),
  }),
);

vi.mock(
  '@genfeedai/hooks/prompt-bar/use-prompt-bar-sync/use-prompt-bar-sync',
  () => ({
    usePromptBarSync: (...args: unknown[]) => mockUsePromptBarSync(...args),
  }),
);

vi.mock('@genfeedai/hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    subscribe: vi.fn(),
  }),
}));

// Mock services
vi.mock('@genfeedai/services/content/prompts.service', () => ({
  PromptsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => mockClipboard,
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => mockNotifications,
  },
}));

// Mock constants
vi.mock('@ui-constants/media.constant', () => ({
  getConfigForCategoryType: () => ({
    buttons: { model: true, reference: true },
    defaultModel: 'test-model',
    placeholder: 'Enter your prompt…',
  }),
  getConfigForRoute: () => ({
    buttons: { model: true, reference: true },
    defaultModel: 'test-model',
    placeholder: 'Enter your prompt…',
  }),
}));

vi.mock('@genfeedai/contracts/constants', async (importOriginal) => ({
  // Keep the real (pure) route helpers — createBrandAppRoute /
  // createOrganizationAppRoute are used via useOrgUrl to build the exact
  // brand-scoped routes these tests assert. Only the model-metadata lookups
  // are overridden with deterministic test values.
  ...(await importOriginal<typeof import('@genfeedai/contracts/constants')>()),
  getModelDefaultDuration: vi.fn().mockReturnValue(5),
  getModelDurations: vi.fn().mockReturnValue([5, 10]),
  getModelMaxOutputs: vi.fn().mockReturnValue(4),
}));

vi.mock(
  '@genfeedai/helpers/media/video-resolution/video-resolution.helper',
  () => ({
    getDefaultVideoResolution: vi.fn().mockReturnValue('720p'),
    getVideoResolutionsByModel: vi.fn().mockReturnValue([]),
    hasResolutionOptions: vi.fn().mockReturnValue(false),
  }),
);

// Mock react-hook-form useWatch
vi.mock('react-hook-form', () => ({
  useWatch: (...args: unknown[]) => mockUseWatch(...args),
}));

// Mock child components to simplify testing
vi.mock(
  '@ui/prompt-bars/components/collapsed-view/PromptBarCollapsedView',
  () => ({
    default: (props: { extraExtensions?: unknown; onExpand: () => void }) => {
      collapsedViewProps = props;
      return (
        <div data-testid="collapsed-view">
          <button
            type="button"
            onClick={props.onExpand}
            data-testid="expand-button"
          >
            Expand
          </button>
        </div>
      );
    },
  }),
);

vi.mock(
  '@ui/prompt-bars/components/expanded-view/PromptBarExpandedView',
  () => ({
    default: function MockExpandedView() {
      const ctx = use(PromptBarInternalContext);
      expandedViewProps = ctx as unknown as Record<string, unknown>;
      return (
        <div data-testid="expanded-view">
          <textarea data-testid="textarea" ref={ctx?.textareaRef} />
          <button
            type="button"
            onClick={ctx?.handleSubmitForm}
            data-testid="submit-button"
          >
            Generate
          </button>
        </div>
      );
    },
  }),
);

describe('PromptBar', () => {
  const defaultProps = {
    avatars: [],
    blacklists: [],
    cameraMovements: [],
    cameras: [],
    categoryType: IngredientCategory.IMAGE,
    folders: [],
    fontFamilies: [],
    generateLabel: 'Generate',
    isGenerateDisabled: false,
    isGenerating: false,
    lenses: [],
    lightings: [],
    models: [{ category: 'image', key: 'test-model', label: 'Test Model' }],
    moods: [],
    onSubmit: vi.fn(),
    presets: [],
    profiles: [],
    scenes: [],
    sounds: [],
    styles: [],
    trainings: [],
    voices: [],
  } as unknown as PromptBarProps;

  beforeEach(() => {
    vi.clearAllMocks();
    collapsedViewProps = undefined;
    expandedViewProps = undefined;
    speechHandlers = {};

    mockUsePromptBarFilters.mockReturnValue({
      filteredBlacklists: [],
      filteredCameraMovements: [],
      filteredCameras: [],
      filteredFontFamilies: [],
      filteredLenses: [],
      filteredLightings: [],
      filteredMoods: [],
      filteredPresets: [],
      filteredScenes: [],
      filteredSounds: [],
      filteredStyles: [],
    });

    mockUsePromptBarModels.mockReturnValue({
      getMinFromAllModels: vi.fn().mockReturnValue(4),
      getUnionFromAllModels: vi.fn().mockReturnValue([]),
      hasAnyImagenModel: false,
      hasAnyResolutionOptions: false,
      hasAudioToggle: false,
      hasEndFrame: false,
      hasModelWithoutDurationEditing: false,
      hasSpeech: false,
      isOnlyImagenModels: false,
      maxReferenceCount: 1,
      requiresReferences: false,
      selectedModels: [],
      supportsInterpolation: false,
      supportsMultipleReferences: false,
      trainingIds: [],
    });

    mockUsePromptBarPricing.mockReturnValue({
      calculateModelCost: vi.fn().mockReturnValue(10),
      selectedModelCost: 10,
    });

    mockUsePromptBarReferences.mockReturnValue({
      endFrame: null,
      handleReferenceSelect: vi.fn(),
      handleSelectAccountReference: vi.fn(),
      hasInitializedReferencesRef: { current: false },
      isUserSelectingReferencesRef: { current: false },
      referenceSource: '',
      references: [],
      setEndFrame: vi.fn(),
      setReferenceSource: vi.fn(),
      setReferences: vi.fn(),
    });

    mockUsePromptBarSync.mockReturnValue({
      flushConfigChange: mockFlushConfigChange,
      handleTextareaChange: mockHandleTextareaChange,
      handleTextChange: mockHandleTextChange,
      setTextValue: mockSetTextValue,
      triggerConfigChange: mockTriggerConfigChange,
    });

    mockUseSpeechRecording.mockImplementation((options) => {
      speechHandlers = options ?? {};
      return {
        error: null,
        isProcessing: false,
        isRecording: false,
        isSupported: false,
        toggle: vi.fn(),
      };
    });

    mockUseWatch.mockImplementation(({ name }) => {
      switch (name) {
        case 'models':
          return [];
        case 'format':
          return IngredientFormat.PORTRAIT;
        case 'speech':
          return null;
        case 'width':
          return null;
        case 'height':
          return null;
        case 'duration':
          return null;
        case 'outputs':
          return 1;
        case 'quality':
          return 'premium';
        default:
          return undefined;
      }
    });

    mockForm.getValues.mockImplementation((field) => {
      if (field === 'blacklist' || field === 'sounds') {
        return [];
      }
      if (field === 'text') {
        return '';
      }
      if (field === 'resolution') {
        return '';
      }
      return '';
    });
  });

  it('should render without crashing', () => {
    const { container } = render(<PromptBar {...defaultProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should render in collapsed view initially', async () => {
    render(<PromptBar {...defaultProps} />);
    // Component starts collapsed but may auto-expand - check for either view
    const collapsed = screen.queryByTestId('collapsed-view');
    const expanded = screen.queryByTestId('expanded-view');
    expect(collapsed || expanded).toBeTruthy();
  });

  it('should expand when clicking expand button', async () => {
    render(<PromptBar {...defaultProps} />);
    const expandButton = screen.queryByTestId('expand-button');
    if (expandButton) {
      fireEvent.click(expandButton);
      // After clicking, it should show expanded view
      expect(screen.getByTestId('expanded-view')).toBeInTheDocument();
    } else {
      // Already expanded
      expect(screen.getByTestId('expanded-view')).toBeInTheDocument();
    }
  });

  it('should render expanded view without collapsed shell in studio-unified mode', () => {
    render(
      <PromptBar
        {...defaultProps}
        features={{ collapsible: false, dragDrop: false }}
      />,
    );

    expect(screen.queryByTestId('collapsed-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('expanded-view')).toBeInTheDocument();
  });

  it('passes extraExtensions to collapsed and expanded prompt editors', () => {
    const extraExtensions = [{ name: 'characterMention' }];
    render(
      <PromptBar
        {...defaultProps}
        extraExtensions={extraExtensions as never}
        features={{ collapsible: true, dragDrop: false }}
      />,
    );

    if (collapsedViewProps) {
      expect(collapsedViewProps.extraExtensions).toBe(extraExtensions);
    }

    render(
      <PromptBar
        {...defaultProps}
        extraExtensions={extraExtensions as never}
        features={{ collapsible: false, dragDrop: false }}
      />,
    );
    expect(expandedViewProps?.extraExtensions).toBe(extraExtensions);
  });

  it('merges prepared character references on submit', () => {
    mockForm.getValues.mockImplementation((name: string) =>
      name === 'references' ? ['img-0'] : 'walking',
    );
    mockUseWatch.mockImplementation(({ name }) => {
      if (name === 'models') {
        return ['test-model'];
      }
      if (name === 'format') {
        return IngredientFormat.PORTRAIT;
      }
      if (name === 'outputs') {
        return 1;
      }
      return null;
    });
    const onPrepareSubmit = vi.fn(() => ({
      notices: ['Ghost has no canonical reference image'],
      references: ['img-0', 'img-anna'],
      text: 'Anna walking',
    }));
    const mockOnSubmit = vi.fn();

    render(
      <PromptBar
        {...defaultProps}
        features={{ collapsible: false, dragDrop: false }}
        onPrepareSubmit={onPrepareSubmit}
        onSubmit={mockOnSubmit}
      />,
    );

    fireEvent.click(screen.getByTestId('submit-button'));

    expect(onPrepareSubmit).toHaveBeenCalledWith({
      document: null,
      references: ['img-0'],
      text: 'walking',
    });
    expect(mockForm.setValue).toHaveBeenCalledWith('text', 'Anna walking', {
      shouldValidate: true,
    });
    expect(mockForm.setValue).toHaveBeenCalledWith(
      'references',
      ['img-0', 'img-anna'],
      { shouldValidate: true },
    );
    expect(mockNotifications.warning).toHaveBeenCalledWith(
      'Ghost has no canonical reference image',
    );
    expect(mockOnSubmit).toHaveBeenCalled();
  });

  it('should handle submit correctly', () => {
    const mockOnSubmit = vi.fn();
    mockUseWatch.mockImplementation(({ name }) => {
      if (name === 'models') {
        return ['test-model'];
      }
      if (name === 'format') {
        return IngredientFormat.PORTRAIT;
      }
      if (name === 'outputs') {
        return 1;
      }
      return null;
    });

    render(<PromptBar {...defaultProps} onSubmit={mockOnSubmit} />);
    const submitButton = screen.queryByTestId('submit-button');
    if (submitButton) {
      fireEvent.click(submitButton);
      expect(mockOnSubmit).toHaveBeenCalled();
    }
  });

  describe('effects and handlers', () => {
    it('passes attached prompt assets to the expanded view', async () => {
      mockUsePromptBarReferences.mockReturnValue({
        endFrame: { id: 'end-1' },
        handleReferenceSelect: vi.fn(),
        handleSelectAccountReference: vi.fn(),
        hasInitializedReferencesRef: { current: false },
        isUserSelectingReferencesRef: { current: false },
        referenceSource: 'ingredient',
        references: [
          { id: 'ref-1', ingredientUrl: 'https://example.com/1.jpg' },
        ],
        setEndFrame: vi.fn(),
        setReferenceSource: vi.fn(),
        setReferences: vi.fn(),
      });

      render(<PromptBar {...defaultProps} />);

      const expandButton = screen.queryByTestId('expand-button');
      if (expandButton) {
        fireEvent.click(expandButton);
      }

      await waitFor(() => {
        expect(expandedViewProps).toBeDefined();
      });

      expect(
        (
          expandedViewProps?.attachedPromptAssets as Array<{
            id: string;
            role: string;
          }>
        )?.map((asset) => ({ id: asset.id, role: asset.role })),
      ).toEqual([
        { id: 'ref-1', role: 'reference' },
        { id: 'end-1', role: 'endFrame' },
      ]);
    });

    it('opens the upload modal with dropped image files', async () => {
      render(<PromptBar {...defaultProps} />);

      const expandButton = screen.queryByTestId('expand-button');
      if (expandButton) {
        fireEvent.click(expandButton);
      }

      await waitFor(() => {
        expect(expandedViewProps).toBeDefined();
      });

      const imageFile = new File(['img'], 'reference.png', {
        type: 'image/png',
      });

      await act(async () => {
        await (
          expandedViewProps as {
            onDropFiles: (event: {
              dataTransfer: { files: File[] };
              preventDefault: () => void;
              stopPropagation: () => void;
            }) => Promise<void>;
          }
        ).onDropFiles({
          dataTransfer: { files: [imageFile] },
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        });
      });

      expect(mockOpenUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          autoSubmit: true,
          category: IngredientCategory.IMAGE,
          initialFiles: [imageFile],
        }),
      );
    });

    it('rejects incompatible dropped files with a drag error', async () => {
      render(<PromptBar {...defaultProps} />);

      const expandButton = screen.queryByTestId('expand-button');
      if (expandButton) {
        fireEvent.click(expandButton);
      }

      await waitFor(() => {
        expect(expandedViewProps).toBeDefined();
      });

      const invalidFile = new File(['text'], 'notes.txt', {
        type: 'text/plain',
      });

      await act(async () => {
        await (
          expandedViewProps as {
            onDropFiles: (event: {
              dataTransfer: { files: File[] };
              preventDefault: () => void;
              stopPropagation: () => void;
            }) => Promise<void>;
          }
        ).onDropFiles({
          dataTransfer: { files: [invalidFile] },
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        });
      });

      await waitFor(() => {
        expect(
          (expandedViewProps as { dragError?: string }).dragError,
        ).toContain('Only image files');
      });
      expect(mockOpenUpload).not.toHaveBeenCalled();
    });

    it('removes attached references from prompt state', async () => {
      const setReferences = vi.fn();
      const setReferenceSource = vi.fn();

      mockUsePromptBarReferences.mockReturnValue({
        endFrame: null,
        handleReferenceSelect: vi.fn(),
        handleSelectAccountReference: vi.fn(),
        hasInitializedReferencesRef: { current: false },
        isUserSelectingReferencesRef: { current: false },
        referenceSource: 'ingredient',
        references: [
          { id: 'ref-1', ingredientUrl: 'https://example.com/1.jpg' },
          { id: 'ref-2', ingredientUrl: 'https://example.com/2.jpg' },
        ],
        setEndFrame: vi.fn(),
        setReferenceSource,
        setReferences,
      });

      render(<PromptBar {...defaultProps} />);

      const expandButton = screen.queryByTestId('expand-button');
      if (expandButton) {
        fireEvent.click(expandButton);
      }

      await waitFor(() => {
        expect(expandedViewProps).toBeDefined();
      });

      act(() => {
        (
          expandedViewProps as {
            onRemoveAttachedAsset: (assetId: string) => void;
          }
        ).onRemoveAttachedAsset('ref-1');
      });

      expect(setReferences).toHaveBeenCalledWith([
        { id: 'ref-2', ingredientUrl: 'https://example.com/2.jpg' },
      ]);
      expect(mockForm.setValue).toHaveBeenCalledWith('references', ['ref-2'], {
        shouldValidate: true,
      });
    });

    it('does not force-select a model when none is selected', async () => {
      render(<PromptBar {...defaultProps} />);

      await waitFor(() => {
        expect(mockForm.setValue).not.toHaveBeenCalledWith(
          'models',
          ['test-model'],
          { shouldValidate: true },
        );
      });
    });

    it('sets a default duration when the model changes', async () => {
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'models') {
          return ['model-1'];
        }
        if (name === 'duration') {
          return null;
        }
        if (name === 'format') {
          return IngredientFormat.PORTRAIT;
        }
        if (name === 'outputs') {
          return 1;
        }
        return null;
      });

      render(<PromptBar {...defaultProps} />);

      await waitFor(() => {
        expect(mockForm.setValue).toHaveBeenCalledWith('duration', 5, {
          shouldValidate: true,
        });
      });
    });

    it('sets a default resolution when the model supports it', async () => {
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'models') {
          return ['model-1'];
        }
        if (name === 'format') {
          return IngredientFormat.PORTRAIT;
        }
        if (name === 'outputs') {
          return 1;
        }
        return null;
      });

      vi.mocked(hasResolutionOptions).mockReturnValue(true);
      vi.mocked(getDefaultVideoResolution).mockReturnValue('1080p');

      render(<PromptBar {...defaultProps} />);

      await waitFor(() => {
        expect(mockForm.setValue).toHaveBeenCalledWith('resolution', '1080p', {
          shouldValidate: true,
        });
      });
    });

    it('applies default blacklists and sounds', async () => {
      mockUsePromptBarFilters.mockReturnValue({
        filteredBlacklists: [
          { isDefault: true, key: 'blacklist-1', label: 'Blacklist 1' },
        ],
        filteredCameraMovements: [],
        filteredCameras: [],
        filteredFontFamilies: [],
        filteredLenses: [],
        filteredLightings: [],
        filteredMoods: [],
        filteredPresets: [],
        filteredScenes: [],
        filteredSounds: [{ isDefault: true, key: 'sound-1', label: 'Sound 1' }],
        filteredStyles: [],
      });

      render(<PromptBar {...defaultProps} />);

      await waitFor(() => {
        expect(mockForm.setValue).toHaveBeenCalledWith(
          'blacklist',
          ['blacklist-1'],
          { shouldValidate: true },
        );
        expect(mockForm.setValue).toHaveBeenCalledWith('sounds', ['sound-1'], {
          shouldValidate: true,
        });
      });
    });

    it('auto-expands once data is ready', () => {
      vi.useFakeTimers();
      render(<PromptBar {...defaultProps} />);

      expect(screen.getByTestId('collapsed-view')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(120);
      });

      expect(screen.getByTestId('expanded-view')).toBeInTheDocument();
      vi.useRealTimers();
    });

    it('applies format changes in place instead of navigating', () => {
      render(<PromptBar {...defaultProps} />);

      const props = collapsedViewProps as {
        onFormatChange?: (format: IngredientFormat) => void;
      };
      expect(props?.onFormatChange).toBeDefined();

      act(() => {
        props.onFormatChange?.(IngredientFormat.LANDSCAPE);
      });

      expect(mockForm.setValue).toHaveBeenCalledWith(
        'format',
        IngredientFormat.LANDSCAPE,
        { shouldValidate: true },
      );
      // The standalone studio tabs are retired — nothing to navigate to.
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('applies video format changes in place too', () => {
      render(
        <PromptBar {...defaultProps} categoryType={IngredientCategory.VIDEO} />,
      );

      const props = collapsedViewProps as {
        onFormatChange?: (format: IngredientFormat) => void;
      };
      expect(props?.onFormatChange).toBeDefined();

      act(() => {
        props.onFormatChange?.(IngredientFormat.SQUARE);
      });

      expect(mockForm.setValue).toHaveBeenCalledWith(
        'format',
        IngredientFormat.SQUARE,
        { shouldValidate: true },
      );
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('updates outputs through the collapsed view handler', () => {
      render(<PromptBar {...defaultProps} />);

      const props = collapsedViewProps as {
        onOutputsChange?: (count: number) => void;
      };
      expect(props?.onOutputsChange).toBeDefined();

      act(() => {
        props.onOutputsChange?.(3);
      });

      expect(mockForm.setValue).toHaveBeenCalledWith('outputs', 3, {
        shouldValidate: true,
      });
      expect(mockTriggerConfigChange).toHaveBeenCalled();
    });

    it('uses the landscape format icon', () => {
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'format') {
          return IngredientFormat.LANDSCAPE;
        }
        if (name === 'outputs') {
          return 1;
        }
        return null;
      });

      render(<PromptBar {...defaultProps} />);

      const props = collapsedViewProps as { formatIcon?: ReactElement };
      expect(props?.formatIcon?.type).toBe(RectangleHorizontal);
    });

    it('uses the square format icon', () => {
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'format') {
          return IngredientFormat.SQUARE;
        }
        if (name === 'outputs') {
          return 1;
        }
        return null;
      });

      render(<PromptBar {...defaultProps} />);

      const props = collapsedViewProps as { formatIcon?: ReactElement };
      expect(props?.formatIcon?.type).toBe(Square);
    });

    it('passes watched quality from the form to the expanded view in studio-unified mode', () => {
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'quality') {
          return 'standard';
        }
        if (name === 'format') {
          return IngredientFormat.PORTRAIT;
        }
        if (name === 'outputs') {
          return 1;
        }
        return [];
      });

      render(
        <PromptBar
          {...defaultProps}
          features={{ collapsible: false, dragDrop: false }}
        />,
      );

      const ctx = expandedViewProps as { watchedQuality?: string };
      expect(ctx?.watchedQuality).toBe('standard');
    });

    it('passes ultra quality from the form to the expanded view', async () => {
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'quality') {
          return 'ultra';
        }
        if (name === 'models') {
          return [];
        }
        if (name === 'format') {
          return IngredientFormat.PORTRAIT;
        }
        if (name === 'outputs') {
          return 1;
        }
        return null;
      });

      render(<PromptBar {...defaultProps} />);

      const expandButton = screen.queryByTestId('expand-button');
      if (expandButton) {
        fireEvent.click(expandButton);
      }

      await waitFor(() => {
        expect(expandedViewProps).toBeDefined();
      });

      const props = expandedViewProps as { watchedQuality?: string };
      expect(props?.watchedQuality).toBe('ultra');
    });

    it('skips submit when generate is disabled', () => {
      const mockOnSubmit = vi.fn();
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'models') {
          return ['test-model'];
        }
        if (name === 'format') {
          return IngredientFormat.PORTRAIT;
        }
        if (name === 'outputs') {
          return 1;
        }
        return null;
      });

      render(
        <PromptBar
          {...defaultProps}
          onSubmit={mockOnSubmit}
          isGenerateDisabled={true}
        />,
      );

      const submitButton = screen.queryByTestId('submit-button');
      if (submitButton) {
        fireEvent.click(submitButton);
      }

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('permits submit without a model when model selection is not required', () => {
      const mockOnSubmit = vi.fn();
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'models') {
          return [];
        }
        if (name === 'autoSelectModel') {
          return false;
        }
        return null;
      });

      const { container } = render(
        <PromptBar
          {...defaultProps}
          onSubmit={mockOnSubmit}
          requiresModelSelection={false}
        />,
      );

      fireEvent.submit(container.querySelector('form') as HTMLFormElement);

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });

    it('skips submit when the prompt bar is disabled', () => {
      const mockOnSubmit = vi.fn();
      mockUseWatch.mockImplementation(({ name }) => {
        if (name === 'models') {
          return ['test-model'];
        }
        if (name === 'format') {
          return IngredientFormat.PORTRAIT;
        }
        if (name === 'outputs') {
          return 1;
        }
        return null;
      });

      render(
        <PromptBar
          {...defaultProps}
          isDisabled={true}
          onSubmit={mockOnSubmit}
        />,
      );

      const submitButton = screen.queryByTestId('submit-button');
      if (submitButton) {
        fireEvent.click(submitButton);
      }

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('skips submit when model selection is required but unset', () => {
      const mockOnSubmit = vi.fn();

      render(<PromptBar {...defaultProps} onSubmit={mockOnSubmit} />);

      const submitButton = screen.queryByTestId('submit-button');
      if (submitButton) {
        fireEvent.click(submitButton);
      }

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('transcribes voice input and updates text', async () => {
      mockForm.getValues.mockImplementation((field) => {
        if (field === 'text') {
          return 'Existing';
        }
        return '';
      });

      render(<PromptBar {...defaultProps} />);

      const expandButton = screen.queryByTestId('expand-button');
      if (expandButton) {
        fireEvent.click(expandButton);
      }

      await waitFor(() => {
        expect(screen.getByTestId('expanded-view')).toBeInTheDocument();
      });

      const textarea = screen.getByTestId('textarea') as HTMLTextAreaElement;
      Object.defineProperty(textarea, 'scrollHeight', {
        configurable: true,
        value: 400,
      });

      act(() => {
        speechHandlers.onTranscription?.({ creditsUsed: 2, text: 'hello' });
      });

      expect(mockForm.setValue).toHaveBeenCalledWith('text', 'Existing hello', {
        shouldValidate: true,
      });
      expect(mockSetTextValue).toHaveBeenCalledWith('Existing hello');
      // Caps at PROMPT_BAR_TEXTAREA_MAX_HEIGHT (5 lines), then scrolls.
      expect(textarea.style.height).toBe('116px');
      expect(textarea.style.overflowY).toBe('auto');
      expect(mockNotifications.success).toHaveBeenCalledWith(
        'Voice input transcribed (2 credits used)',
      );
    });
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<PromptBar {...defaultProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('size-full');
  });

  it('should handle disabled state', () => {
    const { container } = render(
      <PromptBar {...defaultProps} isDisabled={true} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle generating state', () => {
    const { container } = render(
      <PromptBar {...defaultProps} isGenerating={true} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle generate disabled state', () => {
    const { container } = render(
      <PromptBar {...defaultProps} isGenerateDisabled={true} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle video category type', () => {
    const { container } = render(
      <PromptBar {...defaultProps} categoryType={IngredientCategory.VIDEO} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle music category type', () => {
    const { container } = render(
      <PromptBar {...defaultProps} categoryType={IngredientCategory.MUSIC} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should pass custom generate label', () => {
    const { container } = render(
      <PromptBar {...defaultProps} generateLabel="Create" />,
    );
    // The generate label is passed to child components
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle external format prop', () => {
    const { container } = render(
      <PromptBar
        {...defaultProps}
        externalFormat={IngredientFormat.LANDSCAPE}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle external dimensions', () => {
    const { container } = render(
      <PromptBar
        {...defaultProps}
        externalWidth={1920}
        externalHeight={1080}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle prompt data', () => {
    const { container } = render(
      <PromptBar {...defaultProps} promptData={{ text: 'test prompt' }} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle split state with promptText and promptConfig', () => {
    const mockOnTextChange = vi.fn();
    const mockOnConfigChange = vi.fn();
    const { container } = render(
      <PromptBar
        {...defaultProps}
        promptText="test"
        promptConfig={{}}
        onTextChange={mockOnTextChange}
        onConfigChange={mockOnConfigChange}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle empty models array', () => {
    const { container } = render(<PromptBar {...defaultProps} models={[]} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle dataset change callback', () => {
    const mockOnDatasetChange = vi.fn();
    const { container } = render(
      <PromptBar {...defaultProps} onDatasetChange={mockOnDatasetChange} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  describe('form element', () => {
    it('should render form element', () => {
      const { container } = render(<PromptBar {...defaultProps} />);
      const form = container.querySelector('form');
      expect(form).toBeInTheDocument();
    });

    it('should prevent default on form submit', () => {
      const mockOnSubmit = vi.fn();
      const { container } = render(
        <PromptBar {...defaultProps} onSubmit={mockOnSubmit} />,
      );
      const form = container.querySelector('form');
      if (form) {
        const event = new Event('submit', { bubbles: true, cancelable: true });
        fireEvent(form, event);
      }
    });
  });

  describe('with trainings', () => {
    it('should handle trainings prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          trainings={[{ id: 'train-1', name: 'Training 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('with presets', () => {
    it('should handle presets prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          presets={[{ key: 'preset-1', label: 'Preset 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('with avatars and voices', () => {
    it('should handle avatars prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          avatars={[{ id: 'avatar-1', name: 'Avatar 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle voices prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          voices={[{ id: 'voice-1', name: 'Voice 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('element filter props', () => {
    it('should handle styles prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          styles={[{ key: 'style-1', label: 'Style 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle moods prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          moods={[{ key: 'mood-1', label: 'Mood 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle cameras prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          cameras={[{ key: 'camera-1', label: 'Camera 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle scenes prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          scenes={[{ key: 'scene-1', label: 'Scene 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle lightings prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          lightings={[{ key: 'lighting-1', label: 'Lighting 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle lenses prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          lenses={[{ key: 'lens-1', label: 'Lens 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle cameraMovements prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          cameraMovements={[{ key: 'movement-1', label: 'Movement 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle fontFamilies prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          fontFamilies={[{ key: 'font-1', label: 'Font 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle blacklists prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          blacklists={[
            { isDefault: true, key: 'blacklist-1', label: 'Blacklist 1' },
          ]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle sounds prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          sounds={[{ isDefault: true, key: 'sound-1', label: 'Sound 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('with folders and profiles', () => {
    it('should handle folders prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          folders={[{ id: 'folder-1', name: 'Folder 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle profiles prop', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          profiles={[{ id: 'profile-1', name: 'Profile 1' }]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('multiple models', () => {
    it('should handle multiple models', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          models={[
            { category: 'image', key: 'model-1', label: 'Model 1' },
            { category: 'video', key: 'model-2', label: 'Model 2' },
          ]}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('format variations', () => {
    it('should handle landscape format', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          externalFormat={IngredientFormat.LANDSCAPE}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle square format', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          externalFormat={IngredientFormat.SQUARE}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('combined props', () => {
    it('should handle all props together', () => {
      const { container } = render(
        <PromptBar
          {...defaultProps}
          models={[{ category: 'video', key: 'model-1', label: 'Model 1' }]}
          trainings={[{ id: 'train-1', name: 'Training 1' }]}
          presets={[{ key: 'preset-1', label: 'Preset 1' }]}
          folders={[{ id: 'folder-1', name: 'Folder 1' }]}
          profiles={[{ id: 'profile-1', name: 'Profile 1' }]}
          styles={[{ key: 'style-1', label: 'Style 1' }]}
          categoryType={IngredientCategory.VIDEO}
          externalFormat={IngredientFormat.PORTRAIT}
          externalWidth={1080}
          externalHeight={1920}
          isGenerating={false}
          isGenerateDisabled={false}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle props with empty arrays', () => {
      const { container } = render(
        <PromptBar
          models={[]}
          trainings={[]}
          presets={[]}
          folders={[]}
          profiles={[]}
          moods={[]}
          styles={[]}
          cameras={[]}
          scenes={[]}
          fontFamilies={[]}
          blacklists={[]}
          sounds={[]}
          lightings={[]}
          lenses={[]}
          cameraMovements={[]}
          avatars={[]}
          voices={[]}
          categoryType={IngredientCategory.IMAGE}
        />,
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('without categoryType', () => {
    it('should work without categoryType', () => {
      const propsWithoutCategory = {
        ...defaultProps,
        categoryType: undefined,
      };
      const { container } = render(<PromptBar {...propsWithoutCategory} />);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('should keep the root layout container classes', () => {
      const { container } = render(<PromptBar {...defaultProps} />);
      expect(container.firstChild).toHaveClass('size-full', 'min-h-0');
    });

    it('should have flex-col class', () => {
      const { container } = render(<PromptBar {...defaultProps} />);
      expect(container.firstChild).toHaveClass('flex-col');
    });

    it('should have relative positioning', () => {
      const { container } = render(<PromptBar {...defaultProps} />);
      expect(container.firstChild).toHaveClass('relative');
    });
  });
});
