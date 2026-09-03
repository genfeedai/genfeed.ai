import { describe, expect, it } from 'vitest';
import {
  AgentGenerationMode,
  isExplicitAgentMediaGenerationMode,
} from '../../src/enums/agent-generation-mode.enum';

describe('agent-generation-mode.enum', () => {
  it('uses lowercase product values', () => {
    expect(AgentGenerationMode.AUTO).toBe('auto');
    expect(AgentGenerationMode.IMAGE).toBe('image');
    expect(AgentGenerationMode.VIDEO).toBe('video');
  });

  it('treats only image and video as explicit media generation', () => {
    expect(isExplicitAgentMediaGenerationMode(AgentGenerationMode.IMAGE)).toBe(
      true,
    );
    expect(isExplicitAgentMediaGenerationMode(AgentGenerationMode.VIDEO)).toBe(
      true,
    );
    expect(isExplicitAgentMediaGenerationMode(AgentGenerationMode.AUTO)).toBe(
      false,
    );
    expect(isExplicitAgentMediaGenerationMode(undefined)).toBe(false);
  });
});
