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

  it('matches the Library asset browser destinations', () => {
    expect(isAgentOutputRoute('/library/assets')).toBe(true);
    expect(isAgentOutputRoute('/library/images')).toBe(true);
    expect(isAgentOutputRoute('/library/trash/')).toBe(true);
    expect(isAgentOutputRoute('/library/shelf/needs-review')).toBe(true);
  });

  it('keeps the other Library pages on the dock', () => {
    expect(isAgentOutputRoute('/library')).toBe(false);
    expect(isAgentOutputRoute('/library/overview')).toBe(false);
    expect(isAgentOutputRoute('/library/references')).toBe(false);
    expect(isAgentOutputRoute('/library/voices')).toBe(false);
    expect(isAgentOutputRoute('/library/captions')).toBe(false);
    expect(isAgentOutputRoute('/library/shelf')).toBe(false);
  });

  it('does not match other apps or nested paths', () => {
    expect(isAgentOutputRoute('/agent/thread-1')).toBe(false);
    expect(isAgentOutputRoute('/storyboard/run-1/extra')).toBe(false);
  });
});
