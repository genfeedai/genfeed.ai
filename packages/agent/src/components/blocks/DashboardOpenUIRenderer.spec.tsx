import DashboardOpenUIRenderer from '@genfeedai/agent/components/blocks/DashboardOpenUIRenderer';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('DashboardOpenUIRenderer', () => {
  it('renders the empty grid when no blocks are supplied', () => {
    render(<DashboardOpenUIRenderer />);

    expect(screen.getByText('No blocks to display')).toBeInTheDocument();
  });

  it('parses a bare block array', () => {
    render(
      <DashboardOpenUIRenderer
        blocks={[{ id: 'b-1', text: 'From blocks', type: 'text_paragraph' }]}
      />,
    );

    expect(screen.getByText('From blocks')).toBeInTheDocument();
  });

  it('parses an openui component document', () => {
    render(
      <DashboardOpenUIRenderer
        document={{
          components: [
            {
              component: 'Dashboard.Text',
              props: { id: 'b-1', text: 'From document' },
            },
          ],
          version: 'genfeed.dashboard.openui.v1',
        }}
      />,
    );

    expect(screen.getByText('From document')).toBeInTheDocument();
  });

  it('prefers the document when both inputs are supplied', () => {
    render(
      <DashboardOpenUIRenderer
        blocks={[{ id: 'b-1', text: 'From blocks', type: 'text_paragraph' }]}
        document={{
          components: [
            {
              component: 'Dashboard.Text',
              props: { id: 'b-2', text: 'From document' },
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('From document')).toBeInTheDocument();
    expect(screen.queryByText('From blocks')).not.toBeInTheDocument();
  });

  it('renders the unsupported-tree notice for a malformed block array', () => {
    render(<DashboardOpenUIRenderer blocks={{ nope: true }} />);

    expect(
      screen.getByText(/The dashboard was not rendered\./),
    ).toBeInTheDocument();
  });

  it('renders the unsupported-tree notice for a version mismatch', () => {
    render(<DashboardOpenUIRenderer document={{ version: 'wrong' }} />);

    expect(
      screen.getByText(/The dashboard was not rendered\./),
    ).toBeInTheDocument();
  });
});
