import { AgentPrepareToolHandler } from '@api/services/agent-orchestrator/tools/agent-prepare-tool-handler.service';
import type { AgentNextStepOption } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';

type PrepareHandlerCtor = ConstructorParameters<typeof AgentPrepareToolHandler>;

function createHandler(): AgentPrepareToolHandler {
  // suggestNextSteps is pure formatting — it touches none of the injected
  // services, so the constructor deps stay unused stubs here.
  return new AgentPrepareToolHandler(
    {} as PrepareHandlerCtor[0],
    {} as PrepareHandlerCtor[1],
  );
}

function readSteps(result: {
  nextActions?: { nextSteps?: AgentNextStepOption[] }[];
}): AgentNextStepOption[] {
  return result.nextActions?.[0]?.nextSteps ?? [];
}

describe('AgentPrepareToolHandler.suggestNextSteps', () => {
  it('gives a destination step a navigation CTA on the owning page', () => {
    const result = createHandler().suggestNextSteps({
      steps: [{ destination: 'brand_settings', title: 'Brand setup' }],
    });

    expect(result.success).toBe(true);
    expect(readSteps(result)).toEqual([
      {
        ctas: [{ href: '/settings/brands', label: 'Open brand settings' }],
        description: undefined,
        id: 'next-step-1-brand_settings',
        title: 'Brand setup',
      },
    ]);
  });

  it('offers both the page and an in-conversation follow-up when the model supplies a prompt', () => {
    const result = createHandler().suggestNextSteps({
      prompt: 'Where would you like to start?',
      steps: [
        {
          description: 'Publish and schedule from Genfeed.',
          destination: 'connect_accounts',
          prompt: 'Walk me through connecting my first account.',
          title: 'Connect a social account',
        },
      ],
    });

    expect(readSteps(result)[0]?.ctas).toEqual([
      { href: '/settings/social', label: 'Open connections' },
      {
        action: 'send_prompt',
        label: 'Do it here',
        payload: { prompt: 'Walk me through connecting my first account.' },
      },
    ]);
    expect(result.nextActions?.[0]?.type).toBe('next_steps_card');
  });

  it('keeps a prompt-only step as an in-conversation continuation', () => {
    const result = createHandler().suggestNextSteps({
      steps: [{ prompt: 'Draft three post ideas.', title: 'Draft some posts' }],
    });

    expect(readSteps(result)[0]?.ctas).toEqual([
      {
        action: 'send_prompt',
        label: 'Continue here',
        payload: { prompt: 'Draft three post ideas.' },
      },
    ]);
  });

  it('drops a step with no destination and no prompt — that is prose again', () => {
    const result = createHandler().suggestNextSteps({
      steps: [
        { title: 'Think about it' },
        { destination: 'billing', title: 'Billing' },
      ],
    });

    expect(readSteps(result).map((step) => step.title)).toEqual(['Billing']);
  });

  it('ignores an unknown destination key rather than inventing a URL', () => {
    const result = createHandler().suggestNextSteps({
      steps: [{ destination: '/made/up/route', title: 'Somewhere' }],
    });

    expect(result.success).toBe(false);
    expect(result.nextActions).toBeUndefined();
  });

  it('fails when no step is actionable', () => {
    const result = createHandler().suggestNextSteps({ steps: [] });

    expect(result.success).toBe(false);
    expect(result.error).toContain('at least one entry');
  });
});
