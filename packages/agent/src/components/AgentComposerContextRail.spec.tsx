import { AgentComposerContextRail } from '@genfeedai/agent/components/AgentComposerContextRail';
import { ConversationComposerShellProvider } from '@genfeedai/agent/components/ConversationComposerShellContext';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

function withShell(contextLabel: string, children: ReactElement): ReactElement {
  return (
    <ConversationComposerShellProvider
      contextLabel={contextLabel}
      draftScopeKey={null}
      portalTarget={null}
      shellState="canvas"
    >
      {children}
    </ConversationComposerShellProvider>
  );
}

describe('AgentComposerContextRail', () => {
  it('falls back to a generic label outside a shell', () => {
    render(<AgentComposerContextRail attachmentCount={0} referenceCount={0} />);

    expect(screen.getByText('Conversation')).toBeInTheDocument();
  });

  it('shows the shell context label', () => {
    render(
      withShell(
        'Campaign brief',
        <AgentComposerContextRail attachmentCount={0} referenceCount={0} />,
      ),
    );

    expect(screen.getByText('Campaign brief')).toBeInTheDocument();
  });

  it('omits both counters at zero', () => {
    render(<AgentComposerContextRail attachmentCount={0} referenceCount={0} />);

    expect(screen.queryByText(/reference/)).not.toBeInTheDocument();
    expect(screen.queryByText(/file/)).not.toBeInTheDocument();
  });

  it('uses singular wording for a single reference and file', () => {
    render(<AgentComposerContextRail attachmentCount={1} referenceCount={1} />);

    expect(screen.getByText('· 1 reference')).toBeInTheDocument();
    expect(screen.getByText('· 1 file')).toBeInTheDocument();
  });

  it('uses plural wording beyond one', () => {
    render(<AgentComposerContextRail attachmentCount={3} referenceCount={2} />);

    expect(screen.getByText('· 2 references')).toBeInTheDocument();
    expect(screen.getByText('· 3 files')).toBeInTheDocument();
  });
});
