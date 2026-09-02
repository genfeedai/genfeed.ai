import { getToolByName } from '@genfeedai/actions';
import { AgentToolName } from '@genfeedai/contracts/interfaces';
import {
  AGENT_NEXT_STEP_DESTINATION_KEYS,
  AGENT_NEXT_STEP_DESTINATIONS,
  isAgentNextStepDestinationKey,
} from './agent-next-step-destinations.constant';

function readDestinationEnum(): string[] {
  const tool = getToolByName(AgentToolName.SUGGEST_NEXT_STEPS);
  const steps = tool?.parameters.properties.steps as
    | {
        items?: {
          properties?: {
            destination?: { enum?: string[] };
          };
        };
      }
    | undefined;

  return steps?.items?.properties?.destination?.enum ?? [];
}

describe('agent next step destinations', () => {
  it('offers the same keys the tool schema lets the model pick', () => {
    // A key the schema does not offer is unreachable; a schema value with no
    // destination silently drops the CTA and leaves the step as prose again.
    expect([...readDestinationEnum()].sort()).toEqual(
      [...AGENT_NEXT_STEP_DESTINATION_KEYS].sort(),
    );
  });

  it('gives every destination an in-app href and a verb label', () => {
    for (const [key, destination] of Object.entries(
      AGENT_NEXT_STEP_DESTINATIONS,
    )) {
      expect(destination.href, `${key} href`).toMatch(/^\//);
      expect(
        destination.ctaLabel.trim().length,
        `${key} ctaLabel`,
      ).toBeGreaterThan(0);
      expect(destination.label.trim().length, `${key} label`).toBeGreaterThan(
        0,
      );
    }
  });

  it('rejects values that are not destination keys', () => {
    expect(isAgentNextStepDestinationKey('brand_settings')).toBe(true);
    expect(isAgentNextStepDestinationKey('https://example.com')).toBe(false);
    expect(isAgentNextStepDestinationKey(undefined)).toBe(false);
  });
});
