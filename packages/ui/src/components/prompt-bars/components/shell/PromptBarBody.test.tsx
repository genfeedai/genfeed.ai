import { render, screen } from '@testing-library/react';
import PromptBarBody from '@ui/prompt-bars/components/shell/PromptBarBody';
import { describe, expect, it } from 'vitest';

describe('PromptBarBody', () => {
  it('preserves the compact inspector density', () => {
    render(<PromptBarBody density="compact">Editor</PromptBarBody>);

    expect(screen.getByTestId('prompt-bar-body')).toHaveClass(
      'px-2.5',
      'pb-1',
      'pt-2',
    );
  });
});
