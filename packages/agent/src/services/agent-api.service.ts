import * as executionsApi from '@genfeedai/agent/services/agent-api/agent-api.executions';
import * as mediaApi from '@genfeedai/agent/services/agent-api/agent-api.media';
import * as mentionsApi from '@genfeedai/agent/services/agent-api/agent-api.mentions';
import * as threadsApi from '@genfeedai/agent/services/agent-api/agent-api.threads';
import * as workflowsApi from '@genfeedai/agent/services/agent-api/agent-api.workflows';
import { AgentBaseApiService } from '@genfeedai/agent/services/agent-base-api.service';

export type {
  AgentClonedVoice,
  AgentGeneratedAsset,
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

/**
 * Thin facade over domain API modules (threads, runs, mentions, media, workflows).
 * Call sites keep `apiService.method(...)` — implementations live in
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
  createThread = threadsApi.createThread.bind(null, this);
  sendMessage = threadsApi.sendMessage.bind(null, this);
  chat = threadsApi.chat.bind(null, this);
  chatStream = threadsApi.chatStream.bind(null, this);
  getThreads = threadsApi.getThreads.bind(null, this);
  archiveAllThreads = threadsApi.archiveAllThreads.bind(null, this);
  archiveThread = threadsApi.archiveThread.bind(null, this);
  unarchiveThread = threadsApi.unarchiveThread.bind(null, this);
  getThread = threadsApi.getThread.bind(null, this);
  getThreadSnapshot = threadsApi.getThreadSnapshot.bind(null, this);
  updateThread = threadsApi.updateThread.bind(null, this);
  updateThreadContext = threadsApi.updateThreadContext.bind(null, this);
  branchThread = threadsApi.branchThread.bind(null, this);
  respondToInputRequest = threadsApi.respondToInputRequest.bind(null, this);
  respondToUiAction = threadsApi.respondToUiAction.bind(null, this);
  pinThread = threadsApi.pinThread.bind(null, this);
  unpinThread = threadsApi.unpinThread.bind(null, this);
  getMessages = threadsApi.getMessages.bind(null, this);
  getMessagesPage = threadsApi.getMessagesPage.bind(null, this);
  retryAgentTransfer = threadsApi.retryAgentTransfer.bind(null, this);

  // Workflow executions / credits / readiness
  getInstallReadiness = executionsApi.getInstallReadiness.bind(null, this);
  getCreditsInfo = executionsApi.getCreditsInfo.bind(null, this);
  getActiveWorkflowExecutions = executionsApi.getActiveWorkflowExecutions.bind(
    null,
    this,
  );
  getWorkflowExecution = executionsApi.getWorkflowExecution.bind(null, this);
  cancelWorkflowExecution = executionsApi.cancelWorkflowExecution.bind(
    null,
    this,
  );

  // Mentions / memory
  getMentions = mentionsApi.getMentions.bind(null, this);
  getTeamMentions = mentionsApi.getTeamMentions.bind(null, this);
  getCharacterMentions = mentionsApi.getCharacterMentions.bind(null, this);
  getContentMentions = mentionsApi.getContentMentions.bind(null, this);
  listMemories = mentionsApi.listMemories.bind(null, this);
  createMemory = mentionsApi.createMemory.bind(null, this);
  deleteMemory = mentionsApi.deleteMemory.bind(null, this);

  // Media / generation
  getModels = mediaApi.getModels.bind(null, this);
  getGeneratedAsset = mediaApi.getGeneratedAsset.bind(null, this);
  mergeVideos = mediaApi.mergeVideos.bind(null, this);
  reframeVideo = mediaApi.reframeVideo.bind(null, this);
  resizeVideo = mediaApi.resizeVideo.bind(null, this);
  createPrompt = mediaApi.createPrompt.bind(null, this);
  generateIngredient = mediaApi.generateIngredient.bind(null, this);
  generateVoice = mediaApi.generateVoice.bind(null, this);
  cloneVoice = mediaApi.cloneVoice.bind(null, this);
  getClonedVoices = mediaApi.getClonedVoices.bind(null, this);
  setBrandVoiceDefaults = mediaApi.setBrandVoiceDefaults.bind(null, this);
  uploadAttachment = mediaApi.uploadAttachment.bind(null, this);

  // Workflows / batches
  getWorkflowInterface = workflowsApi.getWorkflowInterface.bind(null, this);
  triggerWorkflow = workflowsApi.triggerWorkflow.bind(null, this);
  createManualReviewBatch = workflowsApi.createManualReviewBatch.bind(
    null,
    this,
  );
}
