import { PagesService } from '@services/content/pages.service';
import { render, screen } from '@testing-library/react';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock PagesService
vi.mock('@services/content/pages.service', () => ({
  PagesService: {
    getTotalDocs: vi.fn(),
    getTotalPages: vi.fn(),
  },
}));

describe('AutoPagination', () => {
  beforeEach(() => {
    vi.mocked(PagesService.getTotalPages).mockReturnValue(5);
    vi.mocked(PagesService.getTotalDocs).mockReturnValue(50);
  });

  it('should render when there are multiple pages', () => {
    const { container } = render(<AutoPagination />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should not render when there is only one page', () => {
    vi.mocked(PagesService.getTotalPages).mockReturnValue(1);

    const { container } = render(<AutoPagination />);
    expect(container.firstChild).toBeNull();
  });

  it('should show total when showTotal is true', () => {
    render(<AutoPagination showTotal />);
    expect(screen.getByText(/showing page/i)).toBeInTheDocument();
  });

  it('should use custom totalLabel', () => {
    render(<AutoPagination showTotal totalLabel="posts" />);
    expect(screen.getByText(/posts/)).toBeInTheDocument();
  });
});
