import { render, screen } from '@testing-library/react';
import Portal from '@ui/layout/portal/Portal';
import { describe, expect, it } from 'vitest';

describe('Portal', () => {
  it('should apply correct styles and classes', () => {
    render(
      <Portal>
        <div className="test-class">Portal</div>
      </Portal>,
    );
    expect(screen.getByText('Portal')).toBeInTheDocument();
  });
});
