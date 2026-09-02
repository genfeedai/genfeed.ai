import {
  AGENT_PROGRAM_TEMPLATES,
  getAgentProgramTemplate,
} from './agent-program-templates.constant';

describe('AGENT_PROGRAM_TEMPLATES', () => {
  it('defines the canonical Creator Studio team once', () => {
    const template = getAgentProgramTemplate('creator-studio');

    expect(template).toBe(AGENT_PROGRAM_TEMPLATES[0]);
    expect(template?.roles.map((role) => role.id)).toEqual([
      'script-writer',
      'instagram-short-creator',
      'x-twitter-writer',
      'image-carousel-creator',
    ]);
  });

  it('does not resolve unknown templates', () => {
    expect(getAgentProgramTemplate('unknown')).toBeUndefined();
  });
});
