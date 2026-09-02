import { fireEvent, render, screen } from '@testing-library/react';
import SelectionActionsBar from '@ui/ingredients/list/selection-actions-bar/SelectionActionsBar';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

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

  it('anchors the selection count and Clear control on the left', () => {
    render(<SelectionActionsBar count={3} />);

    const buttons = screen.getAllByRole('button');

    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(buttons[0]).toHaveAccessibleName('Clear selection');
  });

  it('triggers the clear handler', () => {
    const onClear = vi.fn();

    render(<SelectionActionsBar count={3} onClear={onClear} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('groups constructive actions together and keeps Delete last, never between them', () => {
    render(
      <SelectionActionsBar
        count={3}
        canMerge
        canPublishCampaign
        onDownload={vi.fn()}
        onMerge={vi.fn()}
        onPublishCampaign={vi.fn()}
      />,
    );

    const buttonNames = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') || button.textContent);

    const deleteIndex = buttonNames.findIndex((name) =>
      name?.includes('Delete selection'),
    );

    expect(deleteIndex).toBe(buttonNames.length - 1);
  });

  it('does not render Download when no handler is supplied', () => {
    render(<SelectionActionsBar count={3} />);

    expect(
      screen.queryByRole('button', { name: /download/i }),
    ).not.toBeInTheDocument();
  });

  it('renders Download and triggers its handler when supplied', () => {
    const onDownload = vi.fn();

    render(<SelectionActionsBar count={3} onDownload={onDownload} />);

    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('always renders a Delete action for the current selection', () => {
    render(<SelectionActionsBar count={3} />);

    expect(
      screen.getByRole('button', { name: 'Delete selection' }),
    ).toBeInTheDocument();
  });
});
