import type { ActionContractSchemas } from './action-contract.interface';
import { getAdsActionContract } from './ads-action-contracts';
import { getAgentCampaignActionContract } from './agent-campaign-action-contracts';
import { getAgentTurnActionContract } from './agent-turn-action-contracts';
import { getAiInfluencerActionContract } from './ai-influencer-action-contracts';
import { getAnalyticsActionContract } from './analytics-action-contracts';
import { getAuthorReplyActionContract } from './author-reply-action-contracts';
import { getAutomationActionContract } from './automation-action-contracts';
import { getBatchActionContract } from './batch-action-contracts';
import { getBrandRemixActionContract } from './brand-remix-action-contracts';
import { getCampaignOutreachActionContract } from './campaign-outreach-action-contracts';
import { getClipActionContract } from './clip-action-contracts';
import { getContentOptimizationActionContract } from './content-optimization-action-contracts';
import { getContentPipelineActionContract } from './content-pipeline-action-contracts';
import { getCriticalActionContract } from './critical-action-contracts';
import { getEditorialActionContract } from './editorial-action-contracts';
import { getEmailDigestActionContract } from './email-digest-action-contracts';
import { getInsightActionContract } from './insight-action-contracts';
import { getKnowledgeSourceActionContract } from './knowledge-source-action-contracts';
import { getLifecycleEmailActionContract } from './lifecycle-email-action-contracts';
import { getMaintenanceActionContract } from './maintenance-action-contracts';
import { getNewsletterActionContract } from './newsletter-action-contracts';
import { getPatternExtractionActionContract } from './pattern-extraction-action-contracts';
import { getReplyBotActionContract } from './reply-bot-action-contracts';
import { getScheduledPostActionContract } from './scheduled-post-action-contracts';
import { materializeJsonDocumentSchema } from './schema-builders';
import { getSignupPrefillActionContract } from './signup-prefill-action-contracts';
import { getSocialInboxActionContract } from './social-inbox-action-contracts';
import { getSocialReplyCampaignActionContract } from './social-reply-campaign-action-contracts';
import { getSystemActionContract } from './system-action-contracts';
import { getTelegramActionContract } from './telegram-action-contracts';
import { getTwitterPipelineActionContract } from './twitter-pipeline-action-contracts';
import { getWorkflowNodeActionContract } from './workflow-node-action-contracts';
import { getWorkspaceTaskActionContract } from './workspace-task-action-contracts';
import { getYoutubeClipActionContract } from './youtube-clip-action-contracts';

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
