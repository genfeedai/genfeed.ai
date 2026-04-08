import { AGENT_MODELS } from '@genfeedai/agent/constants/agent-models.constant';
import type { AgentApiConfig } from '@genfeedai/agent/services/agent-api.service';
import { ButtonSize, ButtonVariant, CostTier } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import {
  HiOutlineBolt,
  HiOutlineCheck,
  HiOutlineCurrencyDollar,
  HiOutlineScale,
  HiOutlineSparkles,
  HiOutlineTrophy,
} from 'react-icons/hi2';

interface AgentSettingsProps {
  apiConfig: AgentApiConfig;
  brandId?: string;
}

interface BrandAgentConfig {
  defaultModel?: string;
  persona?: string;
}

type GenerationPriority = 'quality' | 'balanced' | 'speed' | 'cost';

interface PriorityOption {
  key: GenerationPriority;
  label: string;
  description: string;
  icon: ReactElement;
}

const GENERATION_PRIORITY_OPTIONS: PriorityOption[] = [
  {
    description: 'Premium models, highest quality output',
    icon: <HiOutlineTrophy className="h-4 w-4" />,
    key: 'quality',
    label: 'Best Quality',
  },
  {
    description: 'Smart balance of quality, speed, and cost',
    icon: <HiOutlineScale className="h-4 w-4" />,
    key: 'balanced',
    label: 'Balanced',
  },
  {
    description: 'Fastest generation, may use lighter models',
    icon: <HiOutlineBolt className="h-4 w-4" />,
    key: 'speed',
    label: 'Fast',
  },
  {
    description: 'Cheapest models, saves credits',
    icon: <HiOutlineCurrencyDollar className="h-4 w-4" />,
    key: 'cost',
    label: 'Budget',
  },
];

const COST_TIER_COLORS: Record<CostTier, string> = {
  [CostTier.LOW]: 'text-green-400 bg-green-400/10',
  [CostTier.MEDIUM]: 'text-yellow-400 bg-yellow-400/10',
  [CostTier.HIGH]: 'text-orange-400 bg-orange-400/10',
};

export function AgentSettings({
  apiConfig,
  brandId,
}: AgentSettingsProps): ReactElement {
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [persona, setPersona] = useState('');
  const [generationPriority, setGenerationPriority] =
    useState<GenerationPriority>('quality');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle',
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchConfig(): Promise<void> {
      try {
        const token = await apiConfig.getToken();
        const headers = {
          Authorization: token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json',
        };

        // Fetch brand config and user settings in parallel
        const [brandRes, settingsRes] = await Promise.all([
          brandId
            ? fetch(`${apiConfig.baseUrl}/brands/${brandId}`, {
                headers,
                signal: controller.signal,
              })
            : Promise.resolve(null),
          fetch(`${apiConfig.baseUrl}/users/me/settings`, {
            headers,
            signal: controller.signal,
          }),
        ]);

        if (brandRes?.ok) {
          const json = await brandRes.json();
          const agentConfig: BrandAgentConfig | undefined =
            json?.data?.attributes?.agentConfig;
          if (agentConfig?.defaultModel) {
            setSelectedModel(agentConfig.defaultModel);
          }
          if (agentConfig?.persona) {
            setPersona(agentConfig.persona);
          }
        }

        if (settingsRes.ok) {
          const json = await settingsRes.json();
          const priority = json?.data?.attributes?.generationPriority;
          if (priority) {
            setGenerationPriority(priority as GenerationPriority);
          }
        }
      } catch {
        // Silently fail — settings will use defaults
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    fetchConfig();
    return () => controller.abort();
  }, [apiConfig, brandId]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const token = await apiConfig.getToken();
      const headers = {
        Authorization: token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json',
      };

      // Save brand config and user settings in parallel
      const requests: Promise<Response>[] = [];

      if (brandId) {
        requests.push(
          fetch(`${apiConfig.baseUrl}/brands/${brandId}/agent-config`, {
            body: JSON.stringify({
              defaultModel: selectedModel || undefined,
              persona: persona || undefined,
            }),
            headers,
            method: 'PATCH',
          }),
        );
      }

      requests.push(
        fetch(`${apiConfig.baseUrl}/users/me/settings`, {
          body: JSON.stringify({ generationPriority }),
          headers,
          method: 'PATCH',
        }),
      );

      const results = await Promise.all(requests);
      const allOk = results.every((r) => r.ok);

      if (allOk) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }, [apiConfig, brandId, selectedModel, persona, generationPriority]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
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
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => setGenerationPriority(option.key)}
              className={cn(
                'flex items-center gap-3 border px-4 py-3 text-left transition-colors',
                generationPriority === option.key
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]',
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center',
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
                <HiOutlineCheck className="h-4 w-4 shrink-0 text-primary" />
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
          Leave this on Auto to use brand defaults and OpenRouter auto-routing
          for new threads.
        </p>
        <div className="grid gap-2">
          {AGENT_MODELS.map((model) => (
            <Button
              key={model.key}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => setSelectedModel(model.key)}
              className={cn(
                'flex items-center gap-3 border px-4 py-3 text-left transition-colors',
                selectedModel === model.key
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]',
              )}
            >
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  {model.isReasoning && (
                    <HiOutlineSparkles className="h-3.5 w-3.5 text-purple-400" />
                  )}
                  <span className="text-sm font-medium text-foreground">
                    {model.label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {model.description}
                </span>
              </div>
              {model.creditCost != null && model.costTier && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold',
                    COST_TIER_COLORS[model.costTier],
                  )}
                >
                  {model.creditCost}cr
                </span>
              )}
              {selectedModel === model.key && (
                <HiOutlineCheck className="h-4 w-4 text-primary" />
              )}
            </Button>
          ))}
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
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
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
          <span className="text-xs text-green-400">Settings saved</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-xs text-red-400">Failed to save</span>
        )}
      </div>
    </div>
  );
}
