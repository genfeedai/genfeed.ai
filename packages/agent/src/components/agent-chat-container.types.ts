import type { AgentChatMessage as AgentChatMessageType } from '@genfeedai/agent/models/agent-chat.model';
import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';

export interface AgentChatContainerProps {
  apiService: AgentApiService;
  archivedNotice?: string | null;
  isLoadingThread?: boolean;
  isReadOnly?: boolean;
  model?: string;
  placeholder?: string;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  suggestedActions?: SuggestedAction[];
  showSuggestedActionsWhenNotEmpty?: boolean;
  onOnboardingCompleted?: () => void | Promise<void>;
  onCopy?: (content: string) => void | Promise<void>;
  onRegenerate?: (message: AgentChatMessageType) => void | Promise<void>;
  onOAuthConnect?: (platform: string) => void;
  onBrandCreate?: (payload: {
    name: string;
    description: string;
  }) => void | Promise<void>;
  onCreateFollowUpTasks?: (taskId: string) => Promise<{ createdCount: number }>;
  onSelectCreditPack?: (pack: {
    label: string;
    price: string;
    credits: number;
  }) => void;
  onSelectIngredient?: (ingredient: { id: string; title?: string }) => void;
  isStreaming?: boolean;
  promptBarLayoutMode?: 'fixed' | 'surface-fixed';
  onboardingMode?: boolean;
  isWideLayout?: boolean;
  workspacePlanningTaskId?: string | null;
}
