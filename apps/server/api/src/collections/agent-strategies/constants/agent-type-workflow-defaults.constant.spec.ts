import { AgentType } from '@genfeedai/contracts';
import {
  AGENT_TYPE_WORKFLOW_DEFAULTS,
  getAgentTypeWorkflowDefault,
} from './agent-type-workflow-defaults.constant';

describe('agent-type-workflow-defaults', () => {
  it('maps every content production agent type to a template', () => {
    const productionTypes = [
      AgentType.X_CONTENT,
      AgentType.IMAGE_CREATOR,
      AgentType.VIDEO_CREATOR,
      AgentType.AI_AVATAR,
      AgentType.ARTICLE_WRITER,
      AgentType.LINKEDIN_CONTENT,
      AgentType.ADS_SCRIPT_WRITER,
      AgentType.SHORT_FORM_WRITER,
      AgentType.CTA_CONTENT,
      AgentType.YOUTUBE_SCRIPT,
    ];

    for (const type of productionTypes) {
      const defaults = getAgentTypeWorkflowDefault(type);
      expect(defaults, type).toBeDefined();
      expect(defaults?.templateId.length).toBeGreaterThan(0);
      expect(defaults?.skillSlugs.length).toBeGreaterThan(0);
    }
  });

  it('uses distinct avatar and youtube templates', () => {
    expect(AGENT_TYPE_WORKFLOW_DEFAULTS[AgentType.AI_AVATAR]?.templateId).toBe(
      'avatar-ugc-heygen',
    );
    expect(
      AGENT_TYPE_WORKFLOW_DEFAULTS[AgentType.YOUTUBE_SCRIPT]?.templateId,
    ).toBe('youtube-thumbnail-script');
  });

  it('uses the general workflow as the safe fallback for unknown types', () => {
    expect(getAgentTypeWorkflowDefault('not-a-real-type')).toEqual(
      AGENT_TYPE_WORKFLOW_DEFAULTS[AgentType.GENERAL],
    );
  });
});
