import { render, screen } from '@testing-library/react';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import { describe, expect, it } from 'vitest';

describe('PromptBarToolbar', () => {
  it('lays the tools out as mode, setup, then the `+` last, with submit on the right', () => {
    render(
      <PromptBarToolbar
        leading={<span>setup</span>}
        leadingLabel="Prompt tools"
        mode={<span>mode</span>}
        reference={<span>reference</span>}
        trailing={<span>submit</span>}
        trailingLabel="Generation controls"
      />,
    );

    const tools = screen.getByRole('group', { name: 'Prompt tools' });
    expect(
      Array.from(tools.children).map((child) => child.textContent),
    ).toEqual(['mode', 'setup', 'reference']);
    const submission = screen.getByRole('group', {
      name: 'Generation controls',
    });
    expect(submission).toHaveTextContent('submit');
    expect(submission).not.toHaveTextContent('reference');
  });

  it('makes the whole row the container every chip collapses against', () => {
    render(<PromptBarToolbar trailing={<span>submit</span>} />);

    expect(screen.getByTestId('prompt-bar-toolbar')).toHaveClass(
      '@container/prompt-bar',
    );
  });

  it('keeps submission out of the tools group', () => {
    render(
      <PromptBarToolbar
        leadingLabel="Prompt tools"
        trailing={<span>submit</span>}
      />,
    );

    expect(
      screen.getByRole('group', { name: 'Prompt tools' }),
    ).not.toHaveTextContent('submit');
  });
});
