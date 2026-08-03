import * as mediaApi from '@genfeedai/agent/services/agent-api/agent-api.media';
import * as mentionsApi from '@genfeedai/agent/services/agent-api/agent-api.mentions';
import * as runsApi from '@genfeedai/agent/services/agent-api/agent-api.runs';
import * as threadsApi from '@genfeedai/agent/services/agent-api/agent-api.threads';
import * as workflowsApi from '@genfeedai/agent/services/agent-api/agent-api.workflows';
import { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';

export type {
  AgentClonedVoice,
  AgentInstallReadiness,
  CredentialMentionItem,
  GenerateIngredientResult,
  GenerationModel,
  ManualReviewBatchPayload,
  WorkflowInterfaceField,
  WorkflowInterfaceSchema,
  WorkflowTriggerScope,
} from '@genfeedai/agent/services/agent-api.types';
export type { AgentApiConfig } from '@genfeedai/agent/services/agent-base-api.service';
export type { ListAgentRunsParams } from '@genfeedai/agent/services/agent-run-api.helpers';

/**
 * Thin facade over domain API modules (threads, runs, mentions, media, workflows).
 * Call sites keep `apiService.methodEffect(...)` — implementations live in
 * `services/agent-api/*`.
 */
export class AgentApiService extends AgentBaseApiService {
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  getToken(options?: { forceRefresh?: boolean }): Promise<string | null> {
    return this.config.getToken(options);
  }

  // Threads / chat
  createThreadEffect = threadsApi.createThreadEffect.bind(null, this);
  sendMessageEffect = threadsApi.sendMessageEffect.bind(null, this);
  chatEffect = threadsApi.chatEffect.bind(null, this);
  chatStreamEffect = threadsApi.chatStreamEffect.bind(null, this);
  getThreadsEffect = threadsApi.getThreadsEffect.bind(null, this);
  archiveAllThreadsEffect = threadsApi.archiveAllThreadsEffect.bind(null, this);
  archiveThreadEffect = threadsApi.archiveThreadEffect.bind(null, this);
  unarchiveThreadEffect = threadsApi.unarchiveThreadEffect.bind(null, this);
  getThreadEffect = threadsApi.getThreadEffect.bind(null, this);
  getThreadSnapshotEffect = threadsApi.getThreadSnapshotEffect.bind(null, this);
  updateThreadEffect = threadsApi.updateThreadEffect.bind(null, this);
  updateThreadContextEffect = threadsApi.updateThreadContextEffect.bind(
    null,
    this,
  );
  branchThreadEffect = threadsApi.branchThreadEffect.bind(null, this);
  respondToInputRequestEffect = threadsApi.respondToInputRequestEffect.bind(
    null,
    this,
  );
  respondToUiActionEffect = threadsApi.respondToUiActionEffect.bind(null, this);
  pinThreadEffect = threadsApi.pinThreadEffect.bind(null, this);
  unpinThreadEffect = threadsApi.unpinThreadEffect.bind(null, this);
  getMessagesEffect = threadsApi.getMessagesEffect.bind(null, this);

  // Runs / credits / readiness
  getInstallReadinessEffect = runsApi.getInstallReadinessEffect.bind(
    null,
    this,
  );
  getCreditsInfoEffect = runsApi.getCreditsInfoEffect.bind(null, this);
  getActiveRunsEffect = runsApi.getActiveRunsEffect.bind(null, this);
  listRunsEffect = runsApi.listRunsEffect.bind(null, this);
  getRunEffect = runsApi.getRunEffect.bind(null, this);
  cancelRunEffect = runsApi.cancelRunEffect.bind(null, this);
  retryRunEffect = runsApi.retryRunEffect.bind(null, this);

  // Mentions / memory
  getMentionsEffect = mentionsApi.getMentionsEffect.bind(null, this);
  getTeamMentionsEffect = mentionsApi.getTeamMentionsEffect.bind(null, this);
  getContentMentionsEffect = mentionsApi.getContentMentionsEffect.bind(
    null,
    this,
  );
  listMemoriesEffect = mentionsApi.listMemoriesEffect.bind(null, this);
  createMemoryEffect = mentionsApi.createMemoryEffect.bind(null, this);
  deleteMemoryEffect = mentionsApi.deleteMemoryEffect.bind(null, this);

  // Media / generation
  getModelsEffect = mediaApi.getModelsEffect.bind(null, this);
  mergeVideosEffect = mediaApi.mergeVideosEffect.bind(null, this);
  reframeVideoEffect = mediaApi.reframeVideoEffect.bind(null, this);
  resizeVideoEffect = mediaApi.resizeVideoEffect.bind(null, this);
  createPromptEffect = mediaApi.createPromptEffect.bind(null, this);
  generateIngredientEffect = mediaApi.generateIngredientEffect.bind(null, this);
  cloneVoiceEffect = mediaApi.cloneVoiceEffect.bind(null, this);
  getClonedVoicesEffect = mediaApi.getClonedVoicesEffect.bind(null, this);
  setBrandVoiceDefaultsEffect = mediaApi.setBrandVoiceDefaultsEffect.bind(
    null,
    this,
  );
  uploadAttachmentEffect = mediaApi.uploadAttachmentEffect.bind(null, this);

  // Workflows / batches
  getWorkflowInterfaceEffect = workflowsApi.getWorkflowInterfaceEffect.bind(
    null,
    this,
  );
  triggerWorkflowEffect = workflowsApi.triggerWorkflowEffect.bind(null, this);
  createManualReviewBatchEffect =
    workflowsApi.createManualReviewBatchEffect.bind(null, this);
}
