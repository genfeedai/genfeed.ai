import { preferredWorkflowTemplateIdForAgentType } from '@pages/agents/content-team/content-team-presets';
import type {
  AgentStrategyDialogProps,
  AgentStrategyFormState,
  AgentStrategyPayload,
} from '@props/automation/agent-strategies-page.props';

export function isCadenceFormValid(
  form: Pick<
    AgentStrategyFormState,
    'postsPerWeek' | 'publishingCeilingPerWeek' | 'readyDraftReserve'
  >,
  initial?: Pick<
    NonNullable<AgentStrategyDialogProps['initialStrategy']>,
    'postsPerWeek' | 'publishingCeilingPerWeek' | 'readyDraftReserve'
  > | null,
): boolean {
  const target = form.postsPerWeek?.trim() ?? '';
  const ceiling = form.publishingCeilingPerWeek?.trim() ?? '';
  const reserve = form.readyDraftReserve?.trim() ?? '';
  if (
    (initial?.postsPerWeek !== undefined && !target) ||
    (initial?.publishingCeilingPerWeek !== undefined && !ceiling) ||
    (initial?.readyDraftReserve !== undefined && !reserve)
  )
    return false;
  if (
    target &&
    (!Number.isInteger(Number(target)) ||
      Number(target) < 1 ||
      Number(target) > 100)
  )
    return false;
  if (!ceiling && !reserve) return true;
  if (!target) return false;
  const maximum = ceiling ? Number(ceiling) : Number(target);
  return (
    Number.isInteger(maximum) &&
    maximum >= Number(target) &&
    maximum <= 1000 &&
    (!reserve ||
      (Number.isInteger(Number(reserve)) &&
        Number(reserve) >= 0 &&
        Number(reserve) <= 100))
  );
}

export function buildPayload(
  form: AgentStrategyFormState,
): AgentStrategyPayload {
  if (!isCadenceFormValid(form))
    throw new RangeError(
      'Invalid posting target, publishing ceiling or draft reserve.',
    );
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
    ...(form.postsPerWeek?.trim()
      ? { postsPerWeek: Number(form.postsPerWeek) }
      : {}),
    ...(form.publishingCeilingPerWeek?.trim()
      ? { publishingCeilingPerWeek: Number(form.publishingCeilingPerWeek) }
      : {}),
    ...(form.readyDraftReserve?.trim()
      ? { readyDraftReserve: Number(form.readyDraftReserve) }
      : {}),
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
