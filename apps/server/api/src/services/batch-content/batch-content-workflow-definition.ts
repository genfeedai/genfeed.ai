import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import {
  EXECUTABLE_SKILL_SLUGS,
  type ExecutableSkillSlug,
  SKILL_WORKFLOW_IDS,
} from '@api/services/skill-executor/skill-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const BATCH_CONTENT_ACTION_IDS = {
  PLAN: 'content.batch.plan',
  PREPARE_ITEM: 'content.batch.item.prepare',
  RANK: 'content.batch.rank',
} as const;

export function getBatchContentWorkflowId(
  skillSlug: ExecutableSkillSlug,
): string {
  return `content.batch.generate.${skillSlug}`;
}

function getBatchContentItemWorkflowId(skillSlug: ExecutableSkillSlug): string {
  return `content.batch.generate-item.${skillSlug}`;
}

export function buildBatchContentWorkflowDefinitions(): SystemWorkflowGraphDefinition[] {
  return EXECUTABLE_SKILL_SLUGS.flatMap((skillSlug) => [
    buildBatchContentItemWorkflowDefinition(skillSlug),
    buildBatchContentWorkflowDefinition(skillSlug),
  ]);
}

export function buildBatchContentWorkflowDefinition(
  skillSlug: ExecutableSkillSlug,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId: getBatchContentWorkflowId(skillSlug),
    definition: {
      edges: [
        {
          id: 'plan-to-generate',
          source: 'plan-batch',
          sourceHandle: 'items',
          target: 'generate-items',
          targetHandle: 'items',
        },
        {
          id: 'plan-to-rank',
          source: 'plan-batch',
          target: 'rank-drafts',
          targetHandle: 'plan',
        },
        {
          id: 'generate-to-rank',
          source: 'generate-items',
          target: 'rank-drafts',
          targetHandle: 'batch',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Batch content request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: BATCH_CONTENT_ACTION_IDS.PLAN,
          id: 'plan-batch',
          inputVariableKeys: ['request'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'generate-items',
          parameters: {
            childWorkflowId: getBatchContentItemWorkflowId(skillSlug),
            itemInputKey: 'item',
            maxConcurrency: 10,
            mode: 'await',
          },
          position: { x: 0, y: 220 },
        }),
        createGenfeedActionNode({
          actionId: BATCH_CONTENT_ACTION_IDS.RANK,
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

export function buildBatchContentItemWorkflowDefinition(
  skillSlug: ExecutableSkillSlug,
): SystemWorkflowGraphDefinition {
  return {
    canonicalId: getBatchContentItemWorkflowId(skillSlug),
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
          label: 'Batch content item',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: BATCH_CONTENT_ACTION_IDS.PREPARE_ITEM,
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
