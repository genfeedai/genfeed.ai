import StudioPage from '@pages/studio/page/StudioPage';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/studio'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

describe('StudioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<StudioPage />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
