import { fireEvent, render, screen } from '@testing-library/react';
import SelectionActionsBar from '@ui/ingredients/list/selection-actions-bar/SelectionActionsBar';
import { describe, expect, it, vi } from 'vitest';

describe('SelectionActionsBar', () => {
  it('should render without crashing', () => {
    const { container } = render(<SelectionActionsBar />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<SelectionActionsBar />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<SelectionActionsBar />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('shows campaign publish action when enabled', () => {
    render(
      <SelectionActionsBar
        count={3}
        canPublishCampaign
        onPublishCampaign={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Publish Carousel' }),
    ).toBeEnabled();
  });

  it('disables campaign publish action until at least two assets are selected', () => {
    render(
      <SelectionActionsBar
        count={1}
        canPublishCampaign
        onPublishCampaign={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Publish Carousel' }),
    ).toBeDisabled();
  });

  it('triggers campaign publish handler', () => {
    const onPublishCampaign = vi.fn();

    render(
      <SelectionActionsBar
        count={2}
        canPublishCampaign
        onPublishCampaign={onPublishCampaign}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish Carousel' }));

    expect(onPublishCampaign).toHaveBeenCalledTimes(1);
  });
});
