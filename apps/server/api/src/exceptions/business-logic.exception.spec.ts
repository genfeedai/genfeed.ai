import { PlanLimitExceededException } from '@api/exceptions/business-logic.exception';
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('PlanLimitExceededException', () => {
  it('uses the singular label when the limit is one', () => {
    const error = new PlanLimitExceededException({
      currentCount: 1,
      limit: 1,
      resource: 'brands',
      upgradeTier: 'pro',
    });
    const response = error.getResponse() as {
      detail: string;
      meta: Record<string, unknown>;
    };

    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(error.name).toBe('PlanLimitExceededException');
    expect(response.detail).toBe(
      'Your current plan includes 1 brand kit. Upgrade to Pro to add more.',
    );
    expect(response.meta).toEqual({
      currentCount: 1,
      limit: 1,
      resource: 'brands',
      upgradeTier: 'pro',
    });
  });

  it('uses the plural label and a generic tier when none is provided', () => {
    const error = new PlanLimitExceededException({
      currentCount: 3,
      limit: 3,
      resource: 'seats',
      upgradeTier: null,
    });
    const response = error.getResponse() as { detail: string };

    expect(response.detail).toBe(
      'Your current plan includes 3 team seats. Upgrade to a higher plan to add more.',
    );
  });

  it('covers the remaining plan-limit resources', () => {
    const channels = new PlanLimitExceededException({
      currentCount: 2,
      limit: 2,
      resource: 'channels',
      upgradeTier: 'scale',
    });
    const organizations = new PlanLimitExceededException({
      currentCount: 4,
      limit: 4,
      resource: 'organizations',
      upgradeTier: 'enterprise',
    });

    expect((channels.getResponse() as { detail: string }).detail).toContain(
      'connected channels',
    );
    expect(
      (organizations.getResponse() as { detail: string }).detail,
    ).toContain('organizations');
  });
});
