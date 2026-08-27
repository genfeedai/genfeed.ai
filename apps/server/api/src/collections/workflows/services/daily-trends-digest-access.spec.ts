import { buildSystemWorkflowMetadata } from '@api/collections/workflows/system-workflow.contract';
import { describe, expect, it } from 'vitest';
import {
  isDailyTrendsDigestMetadata,
  isDailyTrendsDigestRecipientAllowed,
  resolveDailyTrendsDigestScheduleEnabled,
} from './daily-trends-digest-access';

describe('isDailyTrendsDigestMetadata', () => {
  it('matches seeded sourceTemplateId and canonical system metadata', () => {
    expect(
      isDailyTrendsDigestMetadata({
        sourceTemplateId: 'daily-trends-digest',
      }),
    ).toBe(true);
    expect(
      isDailyTrendsDigestMetadata({
        systemWorkflow: buildSystemWorkflowMetadata({
          canonicalId: 'daily-trends-digest',
        }),
      }),
    ).toBe(true);
    expect(
      isDailyTrendsDigestMetadata({
        systemWorkflow: buildSystemWorkflowMetadata({
          canonicalId: 'content-loop-autopilot',
        }),
      }),
    ).toBe(false);
    expect(isDailyTrendsDigestMetadata(null)).toBe(false);
  });
});

describe('isDailyTrendsDigestRecipientAllowed', () => {
  it('allows only the operator inbox on hosted SaaS', () => {
    expect(
      isDailyTrendsDigestRecipientAllowed('vincent@genfeed.ai', {
        isCloud: true,
      }),
    ).toBe(true);
    expect(
      isDailyTrendsDigestRecipientAllowed('dubay887@gmail.com', {
        isCloud: true,
      }),
    ).toBe(false);
    expect(
      isDailyTrendsDigestRecipientAllowed('mitchell@mantella.nl', {
        isCloud: true,
      }),
    ).toBe(false);
  });

  it('allows any owner inbox on self-host', () => {
    expect(
      isDailyTrendsDigestRecipientAllowed('mitchell@mantella.nl', {
        isCloud: false,
      }),
    ).toBe(true);
  });
});

describe('resolveDailyTrendsDigestScheduleEnabled', () => {
  it('forces hosted SaaS onto the operator inbox only', () => {
    expect(
      resolveDailyTrendsDigestScheduleEnabled({
        email: 'vincent@genfeed.ai',
        existingScheduleEnabled: false,
        isCloud: true,
      }),
    ).toBe(true);
    expect(
      resolveDailyTrendsDigestScheduleEnabled({
        email: 'contact@timetosurge.xyz',
        existingScheduleEnabled: true,
        isCloud: true,
      }),
    ).toBe(false);
  });

  it('defaults self-host creates on and honors an existing pause', () => {
    expect(
      resolveDailyTrendsDigestScheduleEnabled({
        email: 'owner@selfhost.local',
        isCloud: false,
      }),
    ).toBe(true);
    expect(
      resolveDailyTrendsDigestScheduleEnabled({
        email: 'owner@selfhost.local',
        existingScheduleEnabled: false,
        isCloud: false,
      }),
    ).toBe(false);
  });
});
