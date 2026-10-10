import {
  AgentAutonomyMode,
  AgentRunFrequency,
  AgentType,
} from '@genfeedai/contracts';
import type { AgentStrategyFormState } from '@props/automation/agent-strategies-page.props';
import { describe, expect, it } from 'vitest';
import {
  buildPayload,
  isCadenceFormValid,
} from './build-agent-strategy-payload';

const form: AgentStrategyFormState = {
  agentType: AgentType.GENERAL,
  autonomyMode: AgentAutonomyMode.SUPERVISED,
  autoPublishConfidenceThreshold: '0.8',
  autoPublishEnabled: false,
  dailyCreditBudget: '100',
  dailyDigestEnabled: true,
  eventTriggersEnabled: true,
  evergreenCadenceEnabled: true,
  goalProfile: 'reach_traffic',
  isActive: true,
  isEnabled: true,
  label: '',
  minCreditThreshold: '50',
  minImageScore: '75',
  minPostScore: '70',
  monthlyCreditBudget: '500',
  postsPerWeek: '7',
  publishingCeilingPerWeek: '7',
  readyDraftReserve: '0',
  platforms: ['twitter'],
  skillSlugs: [],
  reserveTrendBudget: '125',
  runFrequency: AgentRunFrequency.DAILY,
  topics: '',
  trendWatchersEnabled: true,
  weeklySummaryEnabled: true,
};

describe('cadence form payload', () => {
  it('sends independent targets, ceilings and reserve including zero', () => {
    expect(
      buildPayload({
        ...form,
        postsPerWeek: '7',
        publishingCeilingPerWeek: '14',
        readyDraftReserve: '3',
      }),
    ).toMatchObject({
      postsPerWeek: 7,
      publishingCeilingPerWeek: 14,
      readyDraftReserve: 3,
    });
    expect(
      buildPayload({ ...form, readyDraftReserve: '0' }).readyDraftReserve,
    ).toBe(0);
  });
  it('preserves absent controls when editing a legacy strategy', () => {
    const payload = buildPayload({
      ...form,
      publishingCeilingPerWeek: '',
      readyDraftReserve: '',
    });
    expect(payload).not.toHaveProperty('publishingCeilingPerWeek');
    expect(payload).not.toHaveProperty('readyDraftReserve');
  });
  it.each([
    { publishingCeilingPerWeek: '6' },
    { postsPerWeek: '' },
    { readyDraftReserve: '-1' },
    { readyDraftReserve: '101' },
    { postsPerWeek: '7.5' },
    { publishingCeilingPerWeek: '1001' },
  ])('blocks invalid controls (%j)', (change) => {
    expect(isCadenceFormValid({ ...form, ...change })).toBe(false);
    expect(() => buildPayload({ ...form, ...change })).toThrow();
  });
  it.each([
    'postsPerWeek',
    'publishingCeilingPerWeek',
    'readyDraftReserve',
  ] as const)('requires a replacement when clearing configured %s', (field) => {
    const initial = {
      postsPerWeek: 7,
      publishingCeilingPerWeek: 14,
      readyDraftReserve: 3,
    };
    expect(isCadenceFormValid({ ...form, [field]: '' }, initial)).toBe(false);
    expect(
      isCadenceFormValid({ ...form, readyDraftReserve: '0' }, initial),
    ).toBe(true);
  });
  it('keeps absent legacy controls optional while requiring an existing zero reserve', () => {
    const legacy = {
      ...form,
      publishingCeilingPerWeek: '',
      readyDraftReserve: '',
    };
    expect(isCadenceFormValid(legacy, { postsPerWeek: 7 })).toBe(true);
    expect(
      isCadenceFormValid(legacy, { postsPerWeek: 7, readyDraftReserve: 0 }),
    ).toBe(false);
  });
});
