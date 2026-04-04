import { fireEvent, render, screen } from '@testing-library/react';
import Pagination from '@ui/navigation/pagination/Pagination';
import { describe, expect, it, vi } from 'vitest';

describe('Pagination', () => {
  it('renders page links with previous and next controls', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );

    expect(screen.getByLabelText('Go to previous page')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to next page')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('highlights current page', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        currentPage={3}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );

    const currentPageLink = screen.getByText('3').closest('a');
    expect(currentPageLink).toHaveAttribute('aria-current', 'page');
  });

  it('calls onPageChange when page is clicked', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={5}
        onPageChange={handlePageChange}
      />,
    );

    fireEvent.click(screen.getByText('3'));
    expect(handlePageChange).toHaveBeenCalledWith(3);
  });

  it('renders links when onPageChange is not provided', () => {
    render(<Pagination currentPage={1} totalPages={3} />);

    const page1Link = screen.getByText('1').closest('a');
    const page2Link = screen.getByText('2').closest('a');
    const page3Link = screen.getByText('3').closest('a');

    expect(page1Link).toHaveAttribute('href', '?page=1');
    expect(page2Link).toHaveAttribute('href', '?page=2');
    expect(page3Link).toHaveAttribute('href', '?page=3');
  });

  it('uses click handlers when onPageChange is provided', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={3}
        onPageChange={handlePageChange}
      />,
    );

    fireEvent.click(screen.getByLabelText('Go to next page'));
    expect(handlePageChange).toHaveBeenCalledWith(2);
  });

  it('hides pagination when totalPages is 1', () => {
    const handlePageChange = vi.fn();
    const { container } = render(
      <Pagination
        currentPage={1}
        totalPages={1}
        onPageChange={handlePageChange}
      />,
    );

    // Component renders nothing when there's only 1 page
    expect(container.querySelector('.inline-flex')).not.toBeInTheDocument();
  });

  it('hides pagination when totalPages is 0', () => {
    const handlePageChange = vi.fn();
    const { container } = render(
      <Pagination
        currentPage={1}
        totalPages={0}
        onPageChange={handlePageChange}
      />,
    );

    expect(container.querySelector('.inline-flex')).not.toBeInTheDocument();
  });

  it('renders correct number of pages', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={10}
        onPageChange={handlePageChange}
      />,
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('More pages')).toBeInTheDocument();
  });

  it('renders interactive links for page items', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        currentPage={1}
        totalPages={3}
        onPageChange={handlePageChange}
      />,
    );

    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      expect(link).toBeInTheDocument();
    });
  });

  it('defaults to page 1 when currentPage not provided', () => {
    const handlePageChange = vi.fn();
    render(<Pagination totalPages={5} onPageChange={handlePageChange} />);

    const page1Link = screen.getByText('1').closest('a');
    expect(page1Link).toHaveAttribute('aria-current', 'page');
  });

  it('defaults to 1 total page when totalPages not provided', () => {
    const handlePageChange = vi.fn();
    const { container } = render(
      <Pagination currentPage={1} onPageChange={handlePageChange} />,
    );

    // Component renders nothing when there's only 1 page
    expect(container.querySelector('.inline-flex')).not.toBeInTheDocument();
  });
});
