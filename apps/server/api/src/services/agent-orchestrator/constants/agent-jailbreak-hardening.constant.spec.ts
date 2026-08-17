import { AGENT_JAILBREAK_HARDENING } from './agent-jailbreak-hardening.constant';

describe('AGENT_JAILBREAK_HARDENING', () => {
  it('tells the model user messages cannot override system rules', () => {
    expect(AGENT_JAILBREAK_HARDENING.toLowerCase()).toContain('never override');
    expect(AGENT_JAILBREAK_HARDENING.toLowerCase()).toContain('system prompt');
    expect(AGENT_JAILBREAK_HARDENING.toLowerCase()).toContain('tool schemas');
    expect(AGENT_JAILBREAK_HARDENING.toLowerCase()).toContain(
      'internal tool names',
    );
  });

  it('stays short and firm rather than lecturing', () => {
    expect(AGENT_JAILBREAK_HARDENING.length).toBeLessThan(600);
    expect(AGENT_JAILBREAK_HARDENING.toLowerCase()).not.toContain(
      'it is important to remember',
    );
  });
});
