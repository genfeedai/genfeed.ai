import { render, screen } from '@testing-library/react';
import PromptBarBody from '@ui/prompt-bars/components/shell/PromptBarBody';
import { describe, expect, it } from 'vitest';

describe('PromptBarBody', () => {
  it('insets the right and bottom edges equally, so the send button has one gap to both', () => {
    render(
      <PromptBarBody>
        <div>Editor</div>
        <div>Toolbar</div>
      </PromptBarBody>,
    );

    expect(screen.getByTestId('prompt-bar-body')).toHaveClass(
      'px-3',
      'pb-3',
      'pt-3',
    );
  });

  it('keeps the right and bottom edges equal at the compact density', () => {
    render(<PromptBarBody density="compact">Editor</PromptBarBody>);

    expect(screen.getByTestId('prompt-bar-body')).toHaveClass(
      'px-2.5',
      'pb-2.5',
      'pt-2',
    );
  });
});
