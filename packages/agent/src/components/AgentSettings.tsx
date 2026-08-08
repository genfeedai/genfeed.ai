import { COST_TIER_DISPLAY, REASONING_FEATURE } from '@genfeedai/constants';
import {
  ButtonSize,
  ButtonVariant,
  GenerationPriority,
} from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { Check, DollarSign, Scale, Sparkles, Trophy, Zap } from 'lucide-react';
import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useState,
} from 'react';

export interface AgentSettingsValues {
  defaultModel: string;
  generationPriority: GenerationPriority;
  persona: string;
}

interface AgentSettingsProps {
  initialSettings: AgentSettingsValues;
  isDefaultState?: boolean;
  /** Registry models for the default-model picker (required). */
  models: readonly IModel[];
  isModelsLoading?: boolean;
  onSave: (settings: AgentSettingsValues) => Promise<void>;
}

interface PriorityOption {
  key: GenerationPriority;
  label: string;
  description: string;
  icon: ReactElement;
}

const GENERATION_PRIORITY_OPTIONS: PriorityOption[] = [
  {
    description: 'Premium models, highest quality output',
    icon: <Trophy className="size-4" />,
    key: GenerationPriority.QUALITY,
    label: 'Best Quality',
  },
  {
    description: 'Smart balance of quality, speed, and cost',
    icon: <Scale className="size-4" />,
    key: GenerationPriority.BALANCED,
    label: 'Balanced',
  },
  {
    description: 'Fastest generation, may use lighter models',
    icon: <Zap className="size-4" />,
    key: GenerationPriority.SPEED,
    label: 'Fast',
  },
  {
    description: 'Cheapest models, saves credits',
    icon: <DollarSign className="size-4" />,
    key: GenerationPriority.COST,
    label: 'Budget',
  },
];

export function AgentSettings({
  initialSettings,
  isDefaultState = false,
  models,
  isModelsLoading = false,
  onSave,
}: AgentSettingsProps): ReactElement {
  const [selectedModel, setSelectedModel] = useState(
    initialSettings.defaultModel,
  );
  const [persona, setPersona] = useState(initialSettings.persona);
  const [generationPriority, setGenerationPriority] =
    useState<GenerationPriority>(initialSettings.generationPriority);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle',
  );
  const [hasPersistedOverrides, setHasPersistedOverrides] = useState(
    !isDefaultState,
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      await onSave({
        defaultModel: selectedModel,
        generationPriority,
        persona,
      });
      setHasPersistedOverrides(true);
      setSaveStatus('success');
    } catch {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [generationPriority, onSave, persona, selectedModel]);

  const handlePriorityChange = useCallback((priority: GenerationPriority) => {
    setGenerationPriority(priority);
    setSaveStatus('idle');
  }, []);

  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
    setSaveStatus('idle');
  }, []);

  const handlePersonaChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setPersona(event.target.value);
      setSaveStatus('idle');
    },
    [],
  );

  return (
    <div className="space-y-8">
      {!hasPersistedOverrides && (
        <p
          className="rounded bg-white/[0.02] px-4 py-3 text-xs text-muted-foreground"
          role="status"
        >
          No model, persona, or generation priority overrides are saved yet.
          These defaults become persisted only after you save.
        </p>
      )}
      {/* Generation Priority */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-foreground">
          Generation Quality
        </h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Control how the agent selects models for image and video generation.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {GENERATION_PRIORITY_OPTIONS.map((option) => (
            <Button
              key={option.key}
              aria-pressed={generationPriority === option.key}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => handlePriorityChange(option.key)}
              className={cn(
                'flex items-center gap-3 border px-4 py-3 text-left transition-colors',
                generationPriority === option.key
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]',
              )}
            >
              <div
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center',
                  generationPriority === option.key
                    ? 'bg-primary/10 text-primary'
                    : 'bg-white/[0.05] text-muted-foreground',
                )}
              >
                {option.icon}
              </div>
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {option.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </div>
              {generationPriority === option.key && (
                <Check className="size-4 shrink-0 text-primary" />
              )}
            </Button>
          ))}
        </div>
      </section>

      {/* Default Model */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-foreground">
          Default Model Override
        </h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Leave unset to use the platform default model for new threads.
        </p>
        <div className="grid gap-2">
          {isModelsLoading ? (
            <p className="text-xs text-muted-foreground">Loading models…</p>
          ) : null}
          {!isModelsLoading && models.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No agent models in the registry. Seed the model catalog.
            </p>
          ) : null}
          {models.map((model) => {
            const isReasoning = (model.supportsFeatures ?? []).includes(
              REASONING_FEATURE,
            );
            return (
              <Button
                key={model.key}
                aria-pressed={selectedModel === model.key}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => handleModelChange(model.key)}
                className={cn(
                  'flex items-center gap-3 border px-4 py-3 text-left transition-colors',
                  selectedModel === model.key
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]',
                )}
              >
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    {isReasoning ? (
                      <Sparkles className="size-3.5 text-purple-400" />
                    ) : null}
                    <span className="text-sm font-medium text-foreground">
                      {model.label}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {model.description || model.label}
                  </span>
                </div>
                {model.costTier && COST_TIER_DISPLAY[model.costTier] ? (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold',
                      COST_TIER_DISPLAY[model.costTier].colorClass,
                    )}
                    title={`Cost tier ${COST_TIER_DISPLAY[model.costTier].symbol}`}
                  >
                    {COST_TIER_DISPLAY[model.costTier].symbol}
                  </span>
                ) : null}
                {selectedModel === model.key ? (
                  <Check className="size-4 text-primary" />
                ) : null}
              </Button>
            );
          })}
        </div>
      </section>

      {/* Persona */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Persona</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Customize your agent's personality and instructions. Leave empty to
          use the default.
        </p>
        <div className="relative">
          <Textarea
            aria-label="Agent persona"
            value={persona}
            onChange={handlePersonaChange}
            placeholder="Customize your agent's personality and instructions..."
            maxLength={5000}
            rows={6}
            className="resize-y border-white/[0.12] bg-white/[0.03] px-4 py-3 text-sm placeholder:text-foreground/30 focus:border-primary/40"
          />
          <div className="mt-1 text-right text-[10px] text-muted-foreground">
            {persona.length}/5000
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <Button
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.DEFAULT}
          onClick={handleSave}
          isDisabled={isSaving}
          className="px-6"
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
        {saveStatus === 'success' && (
          <span className="text-xs text-success" role="status">
            Settings saved
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="text-xs text-destructive" role="alert">
            Failed to save settings
          </span>
        )}
      </div>
    </div>
  );
}
