import { render, screen } from '@testing-library/react';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import { describe, expect, it } from 'vitest';

describe('PromptBarToolbar', () => {
  it('lays the tools out as mode and setup, with enhance and references clustered at the right edge', () => {
    render(
      <PromptBarToolbar
        enhance={<span>enhance</span>}
        leading={<span>setup</span>}
        leadingLabel="Prompt tools"
        mode={<span>mode</span>}
        reference={<span>reference</span>}
        trailing={<span>submit</span>}
      />,
    );

    const tools = screen.getByRole('group', { name: 'Prompt tools' });
    expect(
      Array.from(tools.children).map((child) => child.textContent),
    ).toEqual(['mode', 'setup', 'enhancereference']);
    const cluster = tools.lastElementChild;
    expect(cluster).toHaveClass('ml-auto');
    expect(
      Array.from(cluster?.children ?? []).map((child) => child.textContent),
    ).toEqual(['enhance', 'reference']);
  });

  it('keeps submission out of the tools group', () => {
    render(
      <PromptBarToolbar
        enhance={<span>enhance</span>}
        leadingLabel="Prompt tools"
        trailing={<span>submit</span>}
      />,
    );

    expect(
      screen.getByRole('group', { name: 'Prompt tools' }),
    ).not.toHaveTextContent('submit');
  });
});
