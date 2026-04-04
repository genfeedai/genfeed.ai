import { render } from '@testing-library/react';
import TopbarEnd from '@ui/topbars/end/TopbarEnd';
import { describe, expect, it } from 'vitest';

describe('TopbarEnd', () => {
  it('renders no trailing topbar controls for the workspace shell', () => {
    const { container } = render(<TopbarEnd />);
    expect(container.firstChild).toBeNull();
  });
});
