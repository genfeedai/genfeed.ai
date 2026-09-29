import DashboardOpenUIRenderer from '@genfeedai/agent/components/blocks/DashboardOpenUIRenderer';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('DashboardOpenUIRenderer', () => {
  it('renders the empty grid when no blocks are supplied', () => {
    render(<DashboardOpenUIRenderer />);

    expect(screen.getByText('No blocks to display')).toBeInTheDocument();
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
});
