import { render, screen } from '@testing-library/react';
import CreativeAppWorkspace from '@ui/layout/creative-app-workspace/CreativeAppWorkspace';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// The shell needs the workspace host; a stub that shows what it was told keeps
// the spec on this component's own wiring.
vi.mock('@ui/layout/agent-output-layout/AgentOutputShell', () => ({
  default: ({
    agent,
    agentTitle,
    children,
    outputLabel,
  }: {
    agent: ReactNode;
    agentTitle: string;
    children: ReactNode;
    outputLabel: string;
  }) => (
    <div>
      <section aria-label={agentTitle}>{agent}</section>
      <section aria-label={outputLabel}>{children}</section>
    </div>
  ),
}));

describe('CreativeAppWorkspace', () => {
  it('always shows the New pane and the projects column, even with no project', () => {
    render(
      <CreativeAppWorkspace
        agent={<p>Prompt</p>}
        agentTitle="New"
        outputLabel="Projects"
      >
        <p>No projects yet</p>
      </CreativeAppWorkspace>,
    );

    expect(screen.getByRole('region', { name: 'New' })).toHaveTextContent(
      'Prompt',
    );
    expect(screen.getByRole('region', { name: 'Projects' })).toHaveTextContent(
      'No projects yet',
    );
  });
});
