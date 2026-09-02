import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const EXECUTABLE_SKILL_SLUGS = [
  'content-geo-optimizer',
  'content-writing',
  'image-generation',
  'trend-discovery',
  'trend-remix',
] as const;

export type ExecutableSkillSlug = (typeof EXECUTABLE_SKILL_SLUGS)[number];

export const SKILL_ACTION_IDS: Record<ExecutableSkillSlug, string> = {
  'content-geo-optimizer': 'skill.content-geo-optimizer.execute',
  'content-writing': 'skill.content-writing.execute',
  'image-generation': 'skill.image-generation.execute',
  'trend-discovery': 'skill.trend-discovery.execute',
  'trend-remix': 'skill.trend-remix.execute',
};

export const SKILL_WORKFLOW_IDS: Record<ExecutableSkillSlug, string> = {
  'content-geo-optimizer': 'skill.content-geo-optimizer',
  'content-writing': 'skill.content-writing',
  'image-generation': 'skill.image-generation',
  'trend-discovery': 'skill.trend-discovery',
  'trend-remix': 'skill.trend-remix',
};

export function isExecutableSkillSlug(
  value: string,
): value is ExecutableSkillSlug {
  return EXECUTABLE_SKILL_SLUGS.some((slug) => slug === value);
}

export function buildSkillWorkflowDefinition(
  skillSlug: ExecutableSkillSlug,
): SystemWorkflowGraphDefinition {
  const actionId = SKILL_ACTION_IDS[skillSlug];
  return {
    canonicalId: SKILL_WORKFLOW_IDS[skillSlug],
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'context',
          label: 'Skill execution context',
          required: true,
          type: 'json',
        },
        {
          key: 'params',
          label: 'Skill parameters',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId,
          id: 'execute-skill',
          inputVariableKeys: ['context', 'params'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: `Executes the built-in ${skillSlug} skill through its exact action contract.`,
    label: `Execute ${skillSlug}`,
    resultNodeId: 'execute-skill',
    version: 1,
  };
}
