import { describe, expect, it } from 'vitest';
import { isAgentOutputRoute } from './agent-output-routes';

describe('isAgentOutputRoute', () => {
  it('matches a storyboard run', () => {
    expect(isAgentOutputRoute('/storyboard/run-1')).toBe(true);
    expect(isAgentOutputRoute('/storyboard/run-1/')).toBe(true);
  });

  it('leaves the storyboard list and the create form on the dock', () => {
    expect(isAgentOutputRoute('/storyboard')).toBe(false);
    expect(isAgentOutputRoute('/storyboard/new')).toBe(false);
    expect(isAgentOutputRoute('/storyboard/new/')).toBe(false);
  });

  it('keeps a run id that starts with "new" on the split layout', () => {
    expect(isAgentOutputRoute('/storyboard/new-run')).toBe(true);
  });

  it('matches a clipper project and leaves the list and the create form', () => {
    expect(isAgentOutputRoute('/clipper/project-1')).toBe(true);
    expect(isAgentOutputRoute('/clipper/project-1/')).toBe(true);
    expect(isAgentOutputRoute('/clipper')).toBe(false);
    expect(isAgentOutputRoute('/clipper/new')).toBe(false);
  });

  it('does not match other apps or nested paths', () => {
    expect(isAgentOutputRoute('/library/images')).toBe(false);
    expect(isAgentOutputRoute('/agent/thread-1')).toBe(false);
    expect(isAgentOutputRoute('/storyboard/run-1/extra')).toBe(false);
  });
});
