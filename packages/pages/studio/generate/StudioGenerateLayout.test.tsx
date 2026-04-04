import StudioGenerateLayout from '@pages/studio/generate/StudioGenerateLayout';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/studio/generate'),
}));

describe('StudioGenerateLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<StudioGenerateLayout />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
