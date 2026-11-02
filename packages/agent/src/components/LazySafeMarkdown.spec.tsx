import { LazySafeMarkdown } from '@genfeedai/agent/components/LazySafeMarkdown';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('LazySafeMarkdown', () => {
  it('renders the markdown once the parser chunk loads', async () => {
    render(<LazySafeMarkdown content={'Plan:\n\n- **Draft** the thread'} />);

    expect(await screen.findByRole('listitem')).toHaveTextContent(
      'Draft the thread',
    );
    expect(screen.getByText('Draft').tagName).toBe('STRONG');
  });

  it('keeps unsafe links as plain text through the lazy path', async () => {
    render(<LazySafeMarkdown content="[open](javascript:alert(1))" />);

    expect(await screen.findByText('open')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
