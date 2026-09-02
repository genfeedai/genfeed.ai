import { CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/campaign-orchestration-workflows.template';
import { AGENT_CAMPAIGN_WORKFLOW_IDS } from '@api/services/agent-campaign/agent-campaign-workflow-definition';

describe('campaign orchestration workflow templates', () => {
  it('persists explicit discover and fan-out graphs without legacy macro nodes', () => {
    expect(CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES).toHaveLength(2);
    for (const template of CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES) {
      expect(template.nodes?.map((node) => node.type)).toEqual([
        'genfeedAction',
        'genfeedAction',
      ]);
      expect(template.nodes?.[1]?.data.config.actionId).toBe(
        'workflow.for-each',
      );
      expect(template.nodes?.[1]?.data.config.parameters).toMatchObject({
        mode: 'await',
      });
    }
    expect(
      CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES[0]?.nodes?.[1]?.data.config
        .parameters,
    ).toMatchObject({
      childWorkflowId: AGENT_CAMPAIGN_WORKFLOW_IDS.ORCHESTRATE,
    });
    expect(
      CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES[1]?.nodes?.[1]?.data.config
        .parameters,
    ).toMatchObject({
      childWorkflowId: AGENT_CAMPAIGN_WORKFLOW_IDS.EVALUATE_TRIGGERS,
    });
  });
});
