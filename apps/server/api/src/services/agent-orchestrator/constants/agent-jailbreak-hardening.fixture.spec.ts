import {
  AGENT_JAILBREAK_ADVERSARIAL_FIXTURES,
  AgentJailbreakFixtureCategory,
} from './agent-jailbreak-hardening.fixture';

describe('AGENT_JAILBREAK_ADVERSARIAL_FIXTURES', () => {
  it('is a non-empty QA set', () => {
    expect(AGENT_JAILBREAK_ADVERSARIAL_FIXTURES.length).toBeGreaterThan(0);
  });

  it('gives every case a prompt and expectedRefusal', () => {
    for (const fixture of AGENT_JAILBREAK_ADVERSARIAL_FIXTURES) {
      expect(fixture.prompt.trim().length).toBeGreaterThan(0);
      expect(fixture.expectedRefusal.trim().length).toBeGreaterThan(0);
    }
  });

  it('covers prompt-extraction, role-override, and developer mode', () => {
    const categories = new Set(
      AGENT_JAILBREAK_ADVERSARIAL_FIXTURES.map((fixture) => fixture.category),
    );

    expect(categories).toEqual(
      new Set([
        AgentJailbreakFixtureCategory.DEVELOPER_MODE,
        AgentJailbreakFixtureCategory.PROMPT_EXTRACTION,
        AgentJailbreakFixtureCategory.ROLE_OVERRIDE,
      ]),
    );
  });
});
