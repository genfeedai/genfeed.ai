import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../stores/uiStore';
import { NotificationToast } from './NotificationToast';

beforeEach(() => {
  useUIStore.setState({ notifications: [] });
});

describe('NotificationToast', () => {
  it('renders nothing without notifications', () => {
    const { container } = render(<NotificationToast />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title and message per notification', () => {
    useUIStore.setState({
      notifications: [
        {
          id: 'n1',
          message: 'Details here',
          title: 'Something happened',
          type: 'error',
        },
        { id: 'n2', title: 'All good', type: 'success' },
      ],
    });

    render(<NotificationToast />);
    expect(screen.getByText('Something happened')).toBeInTheDocument();
    expect(screen.getByText('Details here')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('dismisses a notification', () => {
    useUIStore.setState({
      notifications: [{ id: 'n1', title: 'Bye', type: 'info' }],
    });

    render(<NotificationToast />);
    fireEvent.click(screen.getByTitle('Dismiss'));

    expect(useUIStore.getState().notifications).toHaveLength(0);
  });

  it('copies title and message to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    useUIStore.setState({
      notifications: [
        { id: 'n1', message: 'More', title: 'Copy me', type: 'warning' },
      ],
    });

    render(<NotificationToast />);
    fireEvent.click(screen.getByTitle('Copy message'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Copy me\n\nMore');
    });
  });
});
