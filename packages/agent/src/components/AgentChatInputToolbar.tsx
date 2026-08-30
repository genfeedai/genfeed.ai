import { CONVERSATION_COMPOSER_ACTIONS } from '@genfeedai/agent/constants/conversation-composer-actions.constant';
import {
  agentPresetToGenerationSetupValues,
  useAgentGenerationSetupPresets,
} from '@genfeedai/agent/hooks/use-agent-generation-setup-presets';
import type {
  ConversationComposerActionName,
  ConversationComposerGenerationMode,
  ConversationComposerGenerationSettings,
} from '@genfeedai/agent/models/conversation-composer.model';
import type {
  AgentApiService,
  GenerationModel,
} from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import {
  AGENT_GENERATION_SETUP_TYPE_OPTIONS,
  buildConversationComposerGenerationSettings,
  buildDefaultAgentGenerationSetupValues,
  getAgentGenerationSetupCapabilities,
  isAgentGenerationType,
} from '@genfeedai/agent/utils/agent-generation-setup.util';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant, ModelCategory } from '@genfeedai/enums';
import type { IStudioLook } from '@genfeedai/interfaces';
import type { GenerationSetupFieldKey } from '@genfeedai/interfaces/studio/generation-setup.interface';
import type { StudioGenerateType } from '@genfeedai/interfaces/studio/studio-generate.interface';
import type {
  GenerationSetupFieldSetter,
  GenerationSetupLookOptions,
} from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import { cn } from '@helpers/formatting/cn/cn.util';
import { resolveOrgAllowlistedModels } from '@helpers/model-allowlist.helper';
import { useDebounce } from '@hooks/utils/use-debounce/use-debounce';
import GenerationSetupPopover from '@ui/dropdowns/generation-setup/GenerationSetupPopover';
import { recommendGenerationSetup } from '@ui/dropdowns/generation-setup/generation-setup.recommend';
import {
  applyGenerationSetupPreset,
  applyGenerationSetupRecommendation,
  buildAgentGenerationSetupScope,
  clearGenerationSetupPreset,
  resetGenerationSetupAll,
  resetGenerationSetupField,
  setGenerationSetupField,
  useGenerationSetupStore,
} from '@ui/dropdowns/generation-setup/generation-setup.store';
import { useModelFavorites } from '@ui/dropdowns/model-selector/useModelFavorites';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import PromptBarReferenceControls from '@ui/prompt-bars/components/toolbar/PromptBarReferenceControls';
import PromptBarVoiceControl from '@ui/prompt-bars/components/toolbar/PromptBarVoiceControl';
import { ArrowUp, Square, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  memo,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/** Debounce window before a prompt-text change re-runs the setup recommendation. */
const RECOMMENDATION_DEBOUNCE_MS = 400;

/** Agent composer never offers Look presets by field — only saved Studio Looks. */
const EMPTY_LOOK_OPTIONS: GenerationSetupLookOptions = {};

export interface AgentChatInputToolbarProps {
  apiService?: AgentApiService;
  canSendMessage: boolean;
  creditsAvailable?: number | null;
  disabled: boolean | undefined;
  hasEditor: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  isUploading: boolean;
  generationMode: ConversationComposerGenerationMode;
  /** Live prompt text — drives the debounced setup recommendation. */
  promptText: string;
  onAddFiles?: (files: File[]) => void;
  onInsertReference: () => void;
  onGenerationModeChange: (mode: ConversationComposerGenerationMode) => void;
  onGenerationSettingsChange: (
    settings: ConversationComposerGenerationSettings,
  ) => void;
  onSelectAction: (actionName: ConversationComposerActionName) => void;
  onSend: () => void;
  onStartListening: () => void;
  onStop: (() => void | Promise<void>) | undefined;
  onStopListening: () => void;
  shouldShowSendButton: boolean;
  shouldShowVoiceInput: boolean;
  showStop: boolean;
  /** Send will enqueue instead of starting a new turn. */
  willQueueFollowUp?: boolean;
  density?: 'compact' | 'default';
}

function AgentChatInputToolbarInner({
  apiService,
  canSendMessage,
  creditsAvailable = null,
  disabled,
  hasEditor,
  isListening,
  isTranscribing,
  isUploading,
  generationMode,
  promptText,
  onAddFiles,
  onInsertReference,
  onGenerationModeChange,
  onGenerationSettingsChange,
  onSelectAction,
  onSend,
  onStartListening,
  onStop,
  onStopListening,
  shouldShowSendButton,
  shouldShowVoiceInput,
  showStop,
  willQueueFollowUp = false,
  density = 'default',
}: AgentChatInputToolbarProps): ReactElement {
  const translate = useTranslations('agent.composerToolbar');
  const isCompact = density === 'compact';
  const threadId = useAgentChatStore((state) => state.activeThreadId);
  const {
    organizationId,
    settings: organizationSettings,
    settingsLoading,
  } = useBrand();
  const { favoriteModelKeys, onFavoriteToggle } = useModelFavorites();

  // The setup scope only ever tracks image/video — a brand-new composer
  // starts on image, matching the shared store's own default aspect ratio.
  const [activeGenerationType, setActiveGenerationType] = useState<
    'image' | 'video'
  >(generationMode === 'video' ? 'video' : 'image');

  const scope = buildAgentGenerationSetupScope(threadId, activeGenerationType);
  const defaults = buildDefaultAgentGenerationSetupValues(activeGenerationType);
  const setupFromStore = useGenerationSetupStore(
    (state) => state.setupByScope[scope],
  );
  const reasons =
    useGenerationSetupStore((state) => state.reasonsByScope[scope]) ?? {};
  const setup = setupFromStore ?? { sources: {}, values: defaults };
  const isTypeLocked = setup.sources.type === 'user';
  const capabilities =
    getAgentGenerationSetupCapabilities(activeGenerationType);

  // The chip's send mode mirrors whether the operator has explicitly locked a
  // type: unlocked stays plain conversation (the agent's own tools decide
  // whether to generate), locked commits to a direct generation send.
  useEffect(() => {
    onGenerationModeChange(isTypeLocked ? activeGenerationType : 'auto');
  }, [isTypeLocked, activeGenerationType, onGenerationModeChange]);

  // Send-boundary wire shape stays the narrow ConversationComposerGenerationSettings
  // the rest of the send pipeline already expects — only its source moved.
  useEffect(() => {
    onGenerationSettingsChange(
      buildConversationComposerGenerationSettings(setup.values),
    );
  }, [setup.values, onGenerationSettingsChange]);

  // Model catalogue: registry fetch + org allowlist + category filter, ported
  // from the retired AgentGenerationComposerControls (its aspect-ratio /
  // duration / output UI is now owned by GenerationSetupCustomizePanel).
  const [registryModels, setRegistryModels] = useState<GenerationModel[]>([]);

  useEffect(() => {
    if (!apiService) {
      setRegistryModels([]);
      return;
    }

    const controller = new AbortController();
    runAgentApiEffect(apiService.getModelsEffect(controller.signal))
      .then(setRegistryModels)
      .catch(() => {
        if (!controller.signal.aborted) setRegistryModels([]);
      });
    return () => controller.abort();
  }, [apiService]);

  const category =
    activeGenerationType === 'video'
      ? ModelCategory.VIDEO
      : ModelCategory.IMAGE;
  const filteredModels = useMemo(
    () =>
      resolveOrgAllowlistedModels(registryModels, {
        enabledModelIds: organizationSettings?.enabledModelIds,
        isSettingsReady: !settingsLoading,
        organizationId,
      }).filter((model) => model.category === category),
    [
      category,
      registryModels,
      organizationId,
      organizationSettings?.enabledModelIds,
      settingsLoading,
    ],
  );

  // Studio Looks presets — org+brand scoped, fetched lazily on first open.
  const { deletePreset, isPresetsLoading, loadPresets, presets, savePreset } =
    useAgentGenerationSetupPresets(apiService, activeGenerationType);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const button = triggerButtonRef.current;
    if (!button) {
      return;
    }
    const handleOpenIntent = () => loadPresets();
    button.addEventListener('pointerdown', handleOpenIntent);
    button.addEventListener('focus', handleOpenIntent);
    return () => {
      button.removeEventListener('pointerdown', handleOpenIntent);
      button.removeEventListener('focus', handleOpenIntent);
    };
  }, [loadPresets]);

  // Debounced setup recommendation from prompt text. Unlocked, the type
  // itself is auto-detected from the prompt (resolveType keyword-matches);
  // locked, `lockedType` short-circuits that and only the other fields
  // (aspect ratio, look, etc.) keep recommending.
  const debouncedPrompt = useDebounce(promptText, RECOMMENDATION_DEBOUNCE_MS);

  // biome-ignore lint/correctness/useExhaustiveDependencies: capabilities/defaults are pure functions of activeGenerationType, already a dep — including their fresh per-render identities would re-run this every render and defeat the debounce.
  useEffect(() => {
    const recommendation = recommendGenerationSetup({
      capabilities,
      hasZeroCredits:
        typeof creditsAvailable === 'number' && creditsAvailable <= 0,
      lockedType: isTypeLocked ? activeGenerationType : undefined,
      prompt: debouncedPrompt,
      type: activeGenerationType,
    });
    const resolvedType = isAgentGenerationType(recommendation.values.type)
      ? recommendation.values.type
      : activeGenerationType;

    if (!isTypeLocked && resolvedType !== activeGenerationType) {
      // Re-home onto the new type's own scope before applying — writing the
      // new type into the OLD scope's values would corrupt it.
      const nextScope = buildAgentGenerationSetupScope(threadId, resolvedType);
      applyGenerationSetupRecommendation(
        nextScope,
        recommendation,
        buildDefaultAgentGenerationSetupValues(resolvedType),
      );
      setActiveGenerationType(resolvedType);
      return;
    }

    applyGenerationSetupRecommendation(scope, recommendation, defaults);
  }, [debouncedPrompt, scope, activeGenerationType, isTypeLocked, threadId]);

  const handleSetField: GenerationSetupFieldSetter = useCallback(
    (key, value) => {
      // Type changes route through handleTypeChange, which re-homes the
      // scope first — writing it here would land in the old scope.
      if (key === 'type') {
        return;
      }
      setGenerationSetupField(scope, key, value, defaults);
    },
    [scope, defaults],
  );

  const handleResetField = useCallback(
    (key: GenerationSetupFieldKey) =>
      resetGenerationSetupField(scope, key, defaults),
    [scope, defaults],
  );

  const handleResetAll = useCallback(
    () => resetGenerationSetupAll(scope, defaults),
    [scope, defaults],
  );

  const handleClearPreset = useCallback(
    () => clearGenerationSetupPreset(scope),
    [scope],
  );

  const handleApplyPreset = useCallback(
    (preset: IStudioLook) => {
      applyGenerationSetupPreset(
        scope,
        preset.id,
        agentPresetToGenerationSetupValues(preset),
        defaults,
      );
    },
    [scope, defaults],
  );

  const handleSavePreset = useCallback(
    (label: string) => {
      void savePreset(label, setup.values);
    },
    [savePreset, setup.values],
  );

  const handleDeletePreset = useCallback(
    (presetId: string) => {
      void deletePreset(presetId);
    },
    [deletePreset],
  );

  const handleTypeChange = useCallback(
    (nextType: StudioGenerateType) => {
      if (
        !isAgentGenerationType(nextType) ||
        nextType === activeGenerationType
      ) {
        return;
      }
      const nextScope = buildAgentGenerationSetupScope(threadId, nextType);
      setGenerationSetupField(
        nextScope,
        'type',
        nextType,
        buildDefaultAgentGenerationSetupValues(nextType),
      );
      setActiveGenerationType(nextType);
    },
    [activeGenerationType, threadId],
  );

  // Match paperclip / link / actions: square ICON control with default
  // design-system radius (rounded-md via ButtonSize.ICON) — never a full pill.
  const controlSize = isCompact ? 'size-8' : 'size-9';
  const trailingControlClass = cn(
    'shrink-0',
    controlSize,
    'min-h-0 min-w-0 p-0',
  );
  // Pull only the far-right send into the shell padding — leading setup chip
  // keeps natural shell inset so it doesn't hug the border or fight icon gap.
  const trailingEdgeOffset = isCompact ? '-mr-1.5' : '-mr-2';

  // Trailing primary: Stop replaces mic during a run; send sits beside Stop
  // only when the field has text to queue.
  let trailingPrimary: ReactElement | null = null;

  if (isTranscribing || isListening) {
    trailingPrimary = (
      <PromptBarVoiceControl
        density={density}
        isDisabled={disabled}
        isListening={isListening}
        isTranscribing={isTranscribing}
        onStartListening={onStartListening}
        onStopListening={onStopListening}
      />
    );
  } else {
    const stopButton =
      showStop && onStop ? (
        <Button
          ariaLabel="Stop agent"
          className={trailingControlClass}
          icon={
            <Square aria-hidden className="size-2.5 fill-current stroke-none" />
          }
          onClick={() => {
            void onStop();
          }}
          size={ButtonSize.ICON}
          tooltip="Stop"
          variant={ButtonVariant.DESTRUCTIVE}
          withWrapper={false}
        />
      ) : null;

    let actionButton: ReactElement | null = null;
    if (shouldShowVoiceInput && !showStop) {
      actionButton = (
        <PromptBarVoiceControl
          density={density}
          isDisabled={disabled}
          isListening={false}
          isTranscribing={false}
          onStartListening={onStartListening}
          onStopListening={onStopListening}
        />
      );
    } else if (shouldShowSendButton) {
      actionButton = (
        <Button
          ariaLabel={
            willQueueFollowUp
              ? 'Queue follow-up'
              : generationMode === 'image'
                ? 'Generate image'
                : generationMode === 'video'
                  ? 'Generate video'
                  : 'Send message'
          }
          className={trailingControlClass}
          icon={<ArrowUp className="size-4" />}
          isDisabled={disabled || !hasEditor || !canSendMessage || isUploading}
          onClick={onSend}
          size={ButtonSize.ICON}
          tooltip={
            willQueueFollowUp ? 'Queue follow-up (Enter)' : 'Send (Enter)'
          }
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
        />
      );
    }

    trailingPrimary =
      stopButton || actionButton ? (
        <>
          {stopButton}
          {actionButton}
        </>
      ) : null;
  }

  return (
    <div
      className={cn(
        // min-w-0 + wrap: narrow inspector rails must not stack labels on icons.
        'mt-0.5 flex min-w-0 items-center justify-between gap-2',
        isCompact ? 'min-h-8 flex-wrap pt-0.5' : 'min-h-9 pt-1',
      )}
    >
      {/* Leading: one setup chip, then tools tight to it (no inflated gap). */}
      <div className="flex min-w-0 shrink items-center gap-0.5">
        <GenerationSetupPopover
          buttonRef={triggerButtonRef}
          capabilities={capabilities}
          creditsAvailable={creditsAvailable}
          favoriteModelKeys={favoriteModelKeys}
          isDisabled={disabled || showStop}
          isPresetsLoading={isPresetsLoading}
          lookOptions={EMPTY_LOOK_OPTIONS}
          models={filteredModels}
          onApplyPreset={handleApplyPreset}
          onClearPreset={handleClearPreset}
          onDeletePreset={handleDeletePreset}
          onFavoriteToggle={onFavoriteToggle}
          onResetAll={handleResetAll}
          onResetField={handleResetField}
          onSavePreset={handleSavePreset}
          onSetField={handleSetField}
          onTypeChange={handleTypeChange}
          presets={presets}
          reasons={reasons}
          scopeKey={scope}
          setup={setup}
          typeOptions={AGENT_GENERATION_SETUP_TYPE_OPTIONS}
        />

        <PromptBarReferenceControls
          density={density}
          isAttachmentDisabled={disabled}
          isLibraryDisabled={disabled || !hasEditor}
          onAddFiles={onAddFiles}
          onOpenLibrary={onInsertReference}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ariaLabel={translate('actionsAria')}
              className={cn('shrink-0', controlSize)}
              icon={<Zap className="size-4" />}
              isDisabled={disabled || !hasEditor}
              size={ButtonSize.ICON}
              tooltip={translate('actionsAria')}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-56"
            side="top"
            sideOffset={8}
          >
            <DropdownMenuLabel className="flex flex-col gap-0.5 normal-case tracking-normal">
              <span className="text-xs font-semibold text-foreground">
                {translate('actions')}
              </span>
              <span className="text-2xs font-normal leading-4 text-muted-foreground">
                {translate('actionsDescription')}
              </span>
            </DropdownMenuLabel>
            {CONVERSATION_COMPOSER_ACTIONS.map((action) => (
              <DropdownMenuItem
                key={action.name}
                onSelect={() => {
                  onSelectAction(action.name);
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {action.label}
                  </p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {action.description}
                  </p>
                </div>
                <DropdownMenuShortcut className="normal-case tracking-normal">
                  /{action.name}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Trailing: stop (replaces mic) + optional queue send */}
      <div
        className={cn(
          'flex min-w-0 shrink items-center justify-end',
          trailingEdgeOffset,
        )}
      >
        {trailingPrimary}
      </div>
    </div>
  );
}

export const AgentChatInputToolbar = memo(AgentChatInputToolbarInner);
