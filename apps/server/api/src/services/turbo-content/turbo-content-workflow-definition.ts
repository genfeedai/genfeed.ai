import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import {
  EXECUTABLE_SKILL_SLUGS,
  type ExecutableSkillSlug,
  SKILL_WORKFLOW_IDS,
} from '@api/services/skill-executor/skill-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const TURBO_CONTENT_ACTION_IDS = {
  PLAN: 'content.turbo.plan',
  PREPARE_ITEM: 'content.turbo.item.prepare',
  RANK: 'content.turbo.rank',
} as const;

export function getTurboContentWorkflowId(
  skillSlug: ExecutableSkillSlug,
): string {
  return `content.turbo.generate.${skillSlug}`;
}

function getTurboContentItemWorkflowId(skillSlug: ExecutableSkillSlug): string {
  return `content.turbo.generate-item.${skillSlug}`;
}

export function buildTurboContentWorkflowDefinitions(): SystemWorkflowGraphDefinition[] {
  return EXECUTABLE_SKILL_SLUGS.flatMap((skillSlug) => [
    buildTurboContentItemWorkflowDefinition(skillSlug),
    buildTurboContentWorkflowDefinition(skillSlug),
  ]);
}

export function buildTurboContentWorkflowDefinition(
  skillSlug: ExecutableSkillSlug,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId: getTurboContentWorkflowId(skillSlug),
    organizationModule: 'turbo',
    definition: {
      edges: [
        {
          id: 'plan-to-generate',
          source: 'plan-run',
          sourceHandle: 'items',
          target: 'generate-items',
          targetHandle: 'items',
        },
        {
          id: 'plan-to-rank',
          source: 'plan-run',
          target: 'rank-drafts',
          targetHandle: 'plan',
        },
        {
          id: 'generate-to-rank',
          source: 'generate-items',
          target: 'rank-drafts',
          targetHandle: 'turboRun',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Turbo content request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: TURBO_CONTENT_ACTION_IDS.PLAN,
          id: 'plan-run',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'generate-items',
          parameters: {
            childWorkflowId: getTurboContentItemWorkflowId(skillSlug),
            itemInputKey: 'item',
            maxConcurrency: 10,
            mode: 'await',
          },
          position: { x: 0, y: 220 },
        }),
        createGenfeedActionNode({
          actionId: TURBO_CONTENT_ACTION_IDS.RANK,
          id: 'rank-drafts',
          position: { x: 0, y: 440 },
        }),
      ],
    },
    description: `Plans, generates, and ranks a bounded set of ${skillSlug} drafts through action-backed child workflows.`,
    label: `Generate ${skillSlug} batch`,
    resultNodeId: 'rank-drafts',
    version: 1,
  };
}

export function buildTurboContentItemWorkflowDefinition(
  skillSlug: ExecutableSkillSlug,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId: getTurboContentItemWorkflowId(skillSlug),
    organizationModule: 'turbo',
    definition: {
      edges: [
        {
          id: 'prepare-to-skill-context',
          source: 'prepare-item',
          sourceHandle: 'context',
          target: 'run-skill',
          targetHandle: 'context',
        },
        {
          id: 'prepare-to-skill-params',
          source: 'prepare-item',
          sourceHandle: 'params',
          target: 'run-skill',
          targetHandle: 'params',
        },
      ],
      inputVariables: [
        {
          key: 'item',
          label: 'Turbo content item',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: TURBO_CONTENT_ACTION_IDS.PREPARE_ITEM,
          id: 'prepare-item',
          inputVariableKeys: ['item'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: 'workflow.run-child',
          id: 'run-skill',
          parameters: {
            childWorkflowId: SKILL_WORKFLOW_IDS[skillSlug],
          },
          position: { x: 0, y: 220 },
        }),
      ],
    },
    description: `Generates one ${skillSlug} draft through its canonical skill workflow.`,
    label: `Generate ${skillSlug} batch item`,
    resultNodeId: 'run-skill',
    version: 1,
  };
}
