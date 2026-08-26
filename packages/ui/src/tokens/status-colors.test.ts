import { describe, expect, it } from 'vitest';
import { agentStatusDot, statusBadge, statusIcon } from './status-colors';

describe('status color contract', () => {
  it('keeps tone and glyph coverage in lockstep', () => {
    expect(Object.keys(statusIcon).sort()).toEqual(
      Object.keys(statusBadge).sort(),
    );
  });

  it('keeps agent status indicators semantic and motion-free', () => {
    expect(Object.values(agentStatusDot).join(' ')).not.toMatch(/#|animate-/);
    expect(agentStatusDot.running).toBe('bg-info');
  });
});
