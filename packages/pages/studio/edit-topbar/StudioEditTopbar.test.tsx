import StudioEditTopbar from '@pages/studio/edit-topbar/StudioEditTopbar';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

describe('StudioEditTopbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<StudioEditTopbar />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
