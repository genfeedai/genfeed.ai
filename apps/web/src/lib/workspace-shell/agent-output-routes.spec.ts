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

  it('matches the master conversation but not a single full-page thread', () => {
    expect(isAgentOutputRoute('/agent')).toBe(true);
    expect(isAgentOutputRoute('/agent/')).toBe(true);
    expect(isAgentOutputRoute('/agent/new')).toBe(false);
    expect(isAgentOutputRoute('/agent/journey')).toBe(false);
  });

  it('matches the workflow editor, new or saved', () => {
    expect(isAgentOutputRoute('/automation/workflows/new')).toBe(true);
    expect(isAgentOutputRoute('/automation/workflows/wf-1')).toBe(true);
    expect(isAgentOutputRoute('/automation/workflows/wf-1/')).toBe(true);
  });

  it('leaves the workflow library and templates on the dock', () => {
    expect(isAgentOutputRoute('/automation/workflows')).toBe(false);
    expect(isAgentOutputRoute('/automation/workflows/templates')).toBe(false);
    expect(isAgentOutputRoute('/automation/workflows/templates/')).toBe(false);
  });

  it('matches a clipper project and leaves the list and the create form', () => {
    expect(isAgentOutputRoute('/clipper/project-1')).toBe(true);
    expect(isAgentOutputRoute('/clipper/project-1/')).toBe(true);
    expect(isAgentOutputRoute('/clipper')).toBe(false);
    expect(isAgentOutputRoute('/clipper/new')).toBe(false);
  });

  it('keeps Library, Publishing and Approvals on the dock', () => {
    expect(isAgentOutputRoute('/library/assets')).toBe(false);
    expect(isAgentOutputRoute('/library/shelf/needs-review')).toBe(false);
    expect(isAgentOutputRoute('/publishing/posts')).toBe(false);
    expect(isAgentOutputRoute('/publishing/calendar')).toBe(false);
    expect(isAgentOutputRoute('/publishing/overview')).toBe(false);
    expect(isAgentOutputRoute('/publishing/approvals')).toBe(false);
    expect(isAgentOutputRoute('/publishing/approvals/run-1/item-1')).toBe(
      false,
    );
  });

  it('matches an editor project and leaves the list and the create form', () => {
    expect(isAgentOutputRoute('/editor/project-1')).toBe(true);
    expect(isAgentOutputRoute('/editor/project-1/')).toBe(true);
    expect(isAgentOutputRoute('/editor')).toBe(false);
    expect(isAgentOutputRoute('/editor/new')).toBe(false);
    expect(isAgentOutputRoute('/editor/new/')).toBe(false);
  });

  it('does not match other apps or nested paths', () => {
    expect(isAgentOutputRoute('/agent/thread-1')).toBe(false);
    expect(isAgentOutputRoute('/storyboard/run-1/extra')).toBe(false);
  });
});
