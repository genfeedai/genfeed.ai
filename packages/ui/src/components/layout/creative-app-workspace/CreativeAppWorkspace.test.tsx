import { render, screen } from '@testing-library/react';
import CreativeAppWorkspace, {
  useCreativeProjectsPresence,
} from '@ui/layout/creative-app-workspace/CreativeAppWorkspace';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// The shell needs the workspace host; a stub that shows what it was told keeps
// the spec on this component's own wiring.
vi.mock('@ui/layout/agent-output-layout/AgentOutputShell', () => ({
  default: ({
    agent,
    children,
    isOutputHidden,
  }: {
    agent: ReactNode;
    children: ReactNode;
    isOutputHidden?: boolean;
  }) => (
    <div data-output-hidden={String(Boolean(isOutputHidden))}>
      <section aria-label="agent">{agent}</section>
      <section aria-label="output">{children}</section>
    </div>
  ),
}));

function List({ presence }: { presence: 'empty' | 'populated' | 'unknown' }) {
  useCreativeProjectsPresence(presence);
  return <p>List</p>;
}

function layout() {
  return screen.getByLabelText('output').parentElement;
}

function renderWorkspace(presence: 'empty' | 'populated' | 'unknown') {
  return render(
    <CreativeAppWorkspace
      agent={<p>New</p>}
      agentTitle="New"
      outputLabel="Projects"
    >
      <List presence={presence} />
    </CreativeAppWorkspace>,
  );
}

describe('CreativeAppWorkspace', () => {
  it('keeps both columns until the list knows', () => {
    renderWorkspace('unknown');

    expect(layout()).toHaveAttribute('data-output-hidden', 'false');
  });

  it('gives the New pane the page while the brand has no project', () => {
    renderWorkspace('empty');

    expect(layout()).toHaveAttribute('data-output-hidden', 'true');
    expect(screen.getByText('List')).toBeInTheDocument();
  });

  it('brings the second column back once a project exists', () => {
    const { rerender } = renderWorkspace('empty');
    rerender(
      <CreativeAppWorkspace
        agent={<p>New</p>}
        agentTitle="New"
        outputLabel="Projects"
      >
        <List presence="populated" />
      </CreativeAppWorkspace>,
    );

    expect(layout()).toHaveAttribute('data-output-hidden', 'false');
  });
});
