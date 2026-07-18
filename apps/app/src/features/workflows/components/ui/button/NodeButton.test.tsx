import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NodeIconButton } from './NodeButton';

describe('NodeIconButton', () => {
  it('uses its title as the accessible name for icon-only actions', () => {
    render(
      <NodeIconButton title="Copy webhook URL">
        <span aria-hidden="true">copy</span>
      </NodeIconButton>,
    );

    expect(
      screen.getByRole('button', { name: 'Copy webhook URL' }),
    ).toHaveAttribute('title', 'Copy webhook URL');
  });

  it('preserves an explicit accessible name when it differs from the tooltip', () => {
    render(
      <NodeIconButton aria-label="Copy generated caption" title="Copy">
        <span aria-hidden="true">copy</span>
      </NodeIconButton>,
    );

    expect(
      screen.getByRole('button', { name: 'Copy generated caption' }),
    ).toHaveAttribute('title', 'Copy');
  });
});
