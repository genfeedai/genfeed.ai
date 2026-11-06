import { render } from '@testing-library/react';
import ModalActions from '@ui/modals/actions/ModalActions';
import { describe, expect, it } from 'vitest';

describe('ModalActions', () => {
  it('renders its actions', () => {
    const { getByText } = render(<ModalActions>actions</ModalActions>);
    expect(getByText('actions')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<ModalActions>actions</ModalActions>);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement.className).toContain('justify-end');
    expect(rootElement.className).toContain('shrink-0');
  });

  it('allows className overrides for special footers', () => {
    const { container } = render(
      <ModalActions className="justify-between">actions</ModalActions>,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement.className).toContain('justify-between');
  });
});
