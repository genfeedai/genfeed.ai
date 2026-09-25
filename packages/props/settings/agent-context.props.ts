import type {
  AgentBrandContextEditTarget,
  AgentBrandContextLayerKey,
  IAgentBrandContextLayerStatus,
  IAgentBrandContextLayers,
  IAgentBrandContextMemory,
  IAgentBrandContextSnapshot,
  IAgentMemoryEntry,
  IBrandMemoryInsight,
} from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

export interface AgentContextLayerCardProps {
  children?: ReactNode;
  /** Resolved href per edit target for the current brand. */
  editHrefs: Record<AgentBrandContextEditTarget, string>;
  id?: string;
  layerKey: AgentBrandContextLayerKey;
  status?: IAgentBrandContextLayerStatus;
}

export interface AgentContextLayerBodyProps {
  layerKey: AgentBrandContextLayerKey;
  layers: IAgentBrandContextLayers;
  /** Rendered prompt, used to tell stored-only data from injected data. */
  systemPrompt: string;
}

export interface AgentContextOverviewCardProps {
  isRefreshing: boolean;
  onPreview: (query: string) => void;
  onRefresh: () => void;
  snapshot: IAgentBrandContextSnapshot;
}

export interface AgentContextPromptCardProps {
  memoryPrompt: string;
  systemPrompt: string;
}

export interface AgentContextMemoriesSectionProps {
  brandMemories: IAgentMemoryEntry[] | null;
  editHrefs: Record<AgentBrandContextEditTarget, string>;
  injectedMemories: IAgentBrandContextMemory[];
  injectedStatus?: IAgentBrandContextLayerStatus;
  isMemoriesError: boolean;
  onArchive: (memoryId: string) => void;
  pendingMemoryId: string | null;
  personalMemories: IAgentMemoryEntry[] | null;
}

export interface AgentContextInsightsCardProps {
  insights: IBrandMemoryInsight[] | null;
  isError: boolean;
}

export interface AgentContextPageState {
  archivePersonalMemory: (memoryId: string) => Promise<void>;
  brandMemories: IAgentMemoryEntry[] | null;
  insights: IBrandMemoryInsight[] | null;
  isInsightsError: boolean;
  isLoadError: boolean;
  isMemoriesError: boolean;
  isRefreshing: boolean;
  pendingMemoryId: string | null;
  personalMemories: IAgentMemoryEntry[] | null;
  preview: (query: string) => void;
  refresh: () => void;
  snapshot: IAgentBrandContextSnapshot | null;
}
