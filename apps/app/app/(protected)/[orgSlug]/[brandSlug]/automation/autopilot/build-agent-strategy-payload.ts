import { preferredWorkflowTemplateIdForAgentType } from '@pages/agents/content-team/content-team-presets';
import type {
  AgentStrategyFormState,
  AgentStrategyPayload,
} from '@props/automation/agent-strategies-page.props';

export function buildPayload(
  form: AgentStrategyFormState,
): AgentStrategyPayload {
  const preferredWorkflowTemplateId = preferredWorkflowTemplateIdForAgentType(
    form.agentType,
  );

  return {
    agentType: form.agentType,
    autonomyMode: form.autonomyMode,
    autoPublishConfidenceThreshold:
      Number(form.autoPublishConfidenceThreshold) || 0,
    budgetPolicy: {
      monthlyCreditBudget: Number(form.monthlyCreditBudget) || 0,
      reserveTrendBudget: Number(form.reserveTrendBudget) || 0,
    },
    dailyCreditBudget: Number(form.dailyCreditBudget) || 0,
    goalProfile: form.goalProfile,
    isActive: form.isActive,
    isEnabled: form.isEnabled,
    label: form.label.trim(),
    minCreditThreshold: Number(form.minCreditThreshold) || 0,
    opportunitySources: {
      eventTriggersEnabled: form.eventTriggersEnabled,
      evergreenCadenceEnabled: form.evergreenCadenceEnabled,
      trendWatchersEnabled: form.trendWatchersEnabled,
    },
    platforms: form.platforms,
    preferredWorkflowTemplateId,
    skillSlugs: form.skillSlugs,
    publishPolicy: {
      autoPublishEnabled: form.autoPublishEnabled,
      minImageScore: Number(form.minImageScore) || 0,
      minPostScore: Number(form.minPostScore) || 0,
    },
    reportingPolicy: {
      dailyDigestEnabled: form.dailyDigestEnabled,
      weeklySummaryEnabled: form.weeklySummaryEnabled,
    },
    runFrequency: form.runFrequency,
    topics: form.topics.split(',').flatMap((topic) => {
      const trimmedTopic = topic.trim();
      return trimmedTopic ? [trimmedTopic] : [];
    }),
  };
}
