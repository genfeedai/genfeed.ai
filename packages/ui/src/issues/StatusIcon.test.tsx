// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusIcon } from './StatusIcon';

describe('StatusIcon', () => {
  it('uses a labeled status-specific glyph instead of a generic dot', () => {
    const { container } = render(<StatusIcon status="done" />);

    expect(screen.getByLabelText('Done')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('.rounded-full')).not.toBeInTheDocument();
  });

  it('keeps the visible label when requested', () => {
    render(<StatusIcon status="in_progress" showLabel />);

    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });
});
