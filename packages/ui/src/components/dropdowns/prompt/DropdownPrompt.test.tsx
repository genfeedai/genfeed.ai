import { render, screen } from '@testing-library/react';
import DropdownPrompt from '@ui/dropdowns/prompt/DropdownPrompt';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({
      copyToClipboard: vi.fn(),
    }),
  },
}));

describe('DropdownPrompt', () => {
  it('should render nothing when promptText is not provided', () => {
    const { container } = render(<DropdownPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('should render trigger button when promptText is provided', () => {
    render(<DropdownPrompt promptText="test prompt" />);
    expect(screen.getByLabelText('View prompt')).toBeInTheDocument();
  });

  it('should disable trigger when isDisabled is true', () => {
    render(<DropdownPrompt promptText="test prompt" isDisabled />);
    const button = screen.getByLabelText('View prompt');
    expect(button).toBeDisabled();
  });
});
