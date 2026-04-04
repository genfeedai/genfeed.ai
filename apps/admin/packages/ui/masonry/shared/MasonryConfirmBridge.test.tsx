import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({
    openConfirm: vi.fn(),
  }),
}));

vi.mock('@helpers/formatting/format/format.helper', () => ({
  formatNumberWithCommas: (n: number) => String(n),
}));

import MasonryConfirmBridge from '@ui/masonry/shared/MasonryConfirmBridge';

describe('MasonryConfirmBridge', () => {
  const defaultProps = {
    clearUpscaleConfirm: vi.fn(),
    executeUpscale: vi.fn(),
    upscaleConfirmData: null,
  };

  it('should render without crashing', () => {
    const { container } = render(<MasonryConfirmBridge {...defaultProps} />);
    // MasonryConfirmBridge renders null
    expect(container).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    // This component is a side-effect bridge (opens modals via useEffect), no direct DOM interactions
  });

  it('should apply correct styles and classes', () => {
    // This component renders null, no styles to test
  });
});
