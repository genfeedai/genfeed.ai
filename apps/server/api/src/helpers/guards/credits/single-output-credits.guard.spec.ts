import type { CreditsGuardRequest } from '@api/helpers/guards/credits/credits.guard';
import { SingleOutputCreditsGuard } from '@api/helpers/guards/credits/single-output-credits.guard';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

function contextFor(request: Partial<CreditsGuardRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('SingleOutputCreditsGuard', () => {
  const guard = new SingleOutputCreditsGuard();

  it.each([
    ['no outputs', {}],
    ['plain outputs=2', { outputs: 2 }],
    ['JSON:API attributes outputs=5', { data: { attributes: { outputs: 5 } } }],
    ['string outputs', { outputs: '3' }],
  ])('admits one output when the body carries %s', (_label, body) => {
    const request = { body } as unknown as CreditsGuardRequest;

    const isAllowed = guard.canActivate(contextFor(request));

    expect(isAllowed).toBe(true);
    expect(request.creditsOutputCount).toBe(1);
  });
});
