import type { ActionContractSchemas } from './action-contract.interface.js';
import { getAdsActionContract } from './ads-action-contracts.js';
import { getAgentCampaignActionContract } from './agent-campaign-action-contracts.js';
import { getAgentTurnActionContract } from './agent-turn-action-contracts.js';
import { getAiInfluencerActionContract } from './ai-influencer-action-contracts.js';
import { getAnalyticsActionContract } from './analytics-action-contracts.js';
import { getAuthorReplyActionContract } from './author-reply-action-contracts.js';
import { getAutomationActionContract } from './automation-action-contracts.js';
import { getBatchActionContract } from './batch-action-contracts.js';
import { getBrandRemixActionContract } from './brand-remix-action-contracts.js';
import { getCampaignOutreachActionContract } from './campaign-outreach-action-contracts.js';
import { getClipActionContract } from './clip-action-contracts.js';
import { getContentOptimizationActionContract } from './content-optimization-action-contracts.js';
import { getContentPipelineActionContract } from './content-pipeline-action-contracts.js';
import { getCriticalActionContract } from './critical-action-contracts.js';
import { getEditorialActionContract } from './editorial-action-contracts.js';
import { getEmailDigestActionContract } from './email-digest-action-contracts.js';
import { getInsightActionContract } from './insight-action-contracts.js';
import { getKnowledgeSourceActionContract } from './knowledge-source-action-contracts.js';
import { getLifecycleEmailActionContract } from './lifecycle-email-action-contracts.js';
import { getMaintenanceActionContract } from './maintenance-action-contracts.js';
import { getNewsletterActionContract } from './newsletter-action-contracts.js';
import { getPatternExtractionActionContract } from './pattern-extraction-action-contracts.js';
import { getReplyBotActionContract } from './reply-bot-action-contracts.js';
import { getScheduledPostActionContract } from './scheduled-post-action-contracts.js';
import { materializeJsonDocumentSchema } from './schema-builders.js';
import { getSignupPrefillActionContract } from './signup-prefill-action-contracts.js';
import { getSocialInboxActionContract } from './social-inbox-action-contracts.js';
import { getSocialReplyCampaignActionContract } from './social-reply-campaign-action-contracts.js';
import { getSystemActionContract } from './system-action-contracts.js';
import { getTelegramActionContract } from './telegram-action-contracts.js';
import { getTwitterPipelineActionContract } from './twitter-pipeline-action-contracts.js';
import { getWorkflowNodeActionContract } from './workflow-node-action-contracts.js';
import { getWorkspaceTaskActionContract } from './workspace-task-action-contracts.js';
import { getYoutubeClipActionContract } from './youtube-clip-action-contracts.js';

const CONTRACT_RESOLVERS = [
  getCriticalActionContract,
  getAdsActionContract,
  getContentOptimizationActionContract,
  getContentPipelineActionContract,
  getCampaignOutreachActionContract,
  getClipActionContract,
  getAgentCampaignActionContract,
  getAgentTurnActionContract,
  getAnalyticsActionContract,
  getEditorialActionContract,
  getEmailDigestActionContract,
  getAutomationActionContract,
  getAuthorReplyActionContract,
  getBatchActionContract,
  getWorkflowNodeActionContract,
  getAiInfluencerActionContract,
  getReplyBotActionContract,
  getSignupPrefillActionContract,
  getTelegramActionContract,
  getTwitterPipelineActionContract,
  getSocialInboxActionContract,
  getSocialReplyCampaignActionContract,
  getSystemActionContract,
  getMaintenanceActionContract,
  getNewsletterActionContract,
  getPatternExtractionActionContract,
  getScheduledPostActionContract,
  getLifecycleEmailActionContract,
  getInsightActionContract,
  getKnowledgeSourceActionContract,
  getBrandRemixActionContract,
  getWorkspaceTaskActionContract,
  getYoutubeClipActionContract,
] as const;

export function countExplicitActionContracts(id: string): number {
  return CONTRACT_RESOLVERS.filter((resolve) => resolve(id) !== undefined)
    .length;
}

export function getExplicitActionContract(id: string): ActionContractSchemas {
  const matches = CONTRACT_RESOLVERS.flatMap((resolve) => {
    const contract = resolve(id);
    return contract ? [contract] : [];
  });
  if (matches.length !== 1) {
    throw new Error(
      `Action ${id} must have exactly one explicit JSON Schema contract; found ${matches.length}`,
    );
  }
  const contract = matches[0];
  if (!contract) {
    throw new Error(`Action ${id} is missing an explicit JSON Schema contract`);
  }
  return {
    inputSchema: materializeJsonDocumentSchema(contract.inputSchema),
    outputSchema: materializeJsonDocumentSchema(contract.outputSchema),
  };
}
