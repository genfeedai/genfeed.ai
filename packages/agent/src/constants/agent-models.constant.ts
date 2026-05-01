import { DEFAULT_RUNTIME_AGENT_MODEL } from '@genfeedai/agent/constants/agent-runtime-model.constant';
import { CostTier } from '@genfeedai/enums';

export interface AgentModelOption {
  key: string;
  label: string;
  description: string;
  creditCost?: number;
  costTier?: CostTier;
  brandSlug: string;
  isReasoning?: boolean;
}

export const AUTO_AGENT_MODEL = '';

export const AGENT_MODELS: AgentModelOption[] = [
  {
    brandSlug: 'auto',
    description: 'Use brand defaults and OpenRouter auto-routing',
    key: AUTO_AGENT_MODEL,
    label: 'Auto',
  },
  {
    brandSlug: 'moonshotai',
    description: 'Agentic reasoning and multimodal work',
    isReasoning: true,
    key: DEFAULT_RUNTIME_AGENT_MODEL,
    label: 'Kimi 2.5',
  },
  {
    brandSlug: 'google',
    costTier: CostTier.LOW,
    creditCost: 4,
    description: 'Fast agentic OpenRouter model',
    isReasoning: true,
    key: 'google/gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
  },
  {
    brandSlug: 'deepseek-ai',
    costTier: CostTier.LOW,
    creditCost: 1,
    description: 'Fast & affordable',
    key: 'deepseek/deepseek-chat',
    label: 'DeepSeek',
  },
  {
    brandSlug: 'x-ai',
    costTier: CostTier.LOW,
    creditCost: 1,
    description: 'Real-time knowledge',
    key: 'x-ai/grok-4-fast',
    label: 'Grok 4',
  },
  {
    brandSlug: 'openai',
    costTier: CostTier.LOW,
    creditCost: 3,
    description: 'Fast reasoning',
    isReasoning: true,
    key: 'openai/o4-mini',
    label: 'o4-mini',
  },
  {
    brandSlug: 'openai',
    costTier: CostTier.MEDIUM,
    creditCost: 8,
    description: 'Versatile multimodal',
    key: 'openai/gpt-4o',
    label: 'GPT-4o',
  },
  {
    brandSlug: 'anthropic',
    costTier: CostTier.MEDIUM,
    creditCost: 10,
    description: 'Balanced intelligence',
    key: 'anthropic/claude-sonnet-4-5-20250929',
    label: 'Claude Sonnet 4.5',
  },
  {
    brandSlug: 'openai',
    costTier: CostTier.HIGH,
    creditCost: 15,
    description: 'Advanced reasoning',
    isReasoning: true,
    key: 'openai/o3',
    label: 'o3',
  },
  {
    brandSlug: 'anthropic',
    costTier: CostTier.HIGH,
    creditCost: 15,
    description: 'Most capable',
    key: 'anthropic/claude-opus-4-6',
    label: 'Claude Opus 4.6',
  },
];

export function getAgentModelByKey(key: string): AgentModelOption | undefined {
  return AGENT_MODELS.find((m) => m.key === key);
}
