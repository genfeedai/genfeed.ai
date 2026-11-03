import { render, screen } from '@testing-library/react';
import PromptBarNotice from '@ui/prompt-bars/components/shell/PromptBarNotice';
import { describe, expect, it } from 'vitest';

describe('PromptBarNotice', () => {
  it('announces an error as an alert by default', () => {
    render(<PromptBarNotice>Could not save</PromptBarNotice>);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
  });

  it('announces an info notice as a status', () => {
    render(<PromptBarNotice tone="info">Renderer unavailable</PromptBarNotice>);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Renderer unavailable',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
