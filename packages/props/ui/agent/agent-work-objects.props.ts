import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import type {
  AgentWorkObject,
  AgentWorkObjectActionPayload,
} from '@genfeedai/contracts/interfaces';

export interface AgentWorkObjectsProps {
  apiService: AgentApiService;
  isReadOnly?: boolean;
}

export interface AgentWorkObjectEditorProps {
  object: AgentWorkObject;
  libraryHref?: string;
  threadId?: string;
  isReadOnly?: boolean;
  onAction: (
    object: AgentWorkObject,
    action: AgentWorkObjectActionPayload['action'],
    changes?: Pick<AgentWorkObjectActionPayload, 'body' | 'rows'>,
  ) => Promise<void>;
}
