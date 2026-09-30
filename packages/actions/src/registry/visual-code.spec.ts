import { describe, expect, it } from 'vitest';
import { getActionDefinition } from './action-registry';
import { AGENT_ACTION_CLASS, getAgentActionClass } from './agent-action-class';
import { materializeJsonDocumentSchema } from './contracts/schema-builders';
import {
  getVisualCodeActionContract,
  VISUAL_CODE_ACTION_ALIASES,
} from './contracts/visual-code-action-contracts';
import { getToolByName, getToolsForSurface } from './tool-registry';

describe('visual-code canonical actions', () => {
  it('exposes all valid aliases on agent and workflow without extending MCP', () => {
    for (const [alias, operation] of Object.entries(
      VISUAL_CODE_ACTION_ALIASES,
    )) {
      expect(alias).toMatch(/^[a-z_]+$/);
      const tool = getToolByName(alias);
      expect(tool).toMatchObject({
        creditCost: 0,
        toolset: 'generation',
        surfaces: { agent: true, mcp: false },
      });
      expect(
        getToolsForSurface('agent').some((item) => item.name === alias),
      ).toBe(true);
      expect(getActionDefinition(alias)?.visibility).toBe('workflow');
      expect(
        getActionDefinition(`visual-code.${operation}`)?.inputSchema,
      ).toEqual(
        materializeJsonDocumentSchema(
          getVisualCodeActionContract(alias)?.inputSchema ?? {},
        ),
      );
    }
  });
  it('keeps paid mutations approval-gated despite delegated zero tool credits', () => {
    for (const operation of ['generate', 'revise', 'export', 'retry']) {
      const alias = Object.entries(VISUAL_CODE_ACTION_ALIASES).find(
        ([, value]) => value === operation,
      )?.[0];
      expect(alias).toBeTruthy();
      expect(getToolByName(alias ?? '')?.mutationPolicy).toBe(
        'approval-required',
      );
      expect(getAgentActionClass(alias ?? '')).toBe(
        AGENT_ACTION_CLASS.CREDIT_SPENDING,
      );
      expect(getActionDefinition(`visual-code.${operation}`)).toMatchObject({
        approval: 'required',
        credits: { amount: 0, mode: 'fixed' },
      });
      expect(getToolByName(alias ?? '')?.uiActionType).not.toBe(
        'generation_action_card',
      );
    }
  });
  it('marks quote as read-only, cancellation direct and internal execution undiscoverable', () => {
    expect(
      getToolByName('quote_visual_code_generation')?.mutationPolicy,
    ).toBeUndefined();
    expect(getToolByName('cancel_visual_code_project')?.mutationPolicy).toBe(
      'direct',
    );
    expect(
      getActionDefinition('visual-code.execute-internal')?.visibility,
    ).toBe('internal');
    expect(
      getToolsForSurface('agent').some((item) =>
        item.name.includes('execute-internal'),
      ),
    ).toBe(false);
  });
});
