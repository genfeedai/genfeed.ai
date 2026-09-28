import { render, screen } from '@testing-library/react';
import CollectionSection from '@ui/collection/CollectionSection';
import { describe, expect, it } from 'vitest';

describe('CollectionSection', () => {
  it('renders nothing, heading included, when the section has no items', () => {
    const { container } = render(
      <CollectionSection itemCount={0} title="Needs you">
        <p>body</p>
      </CollectionSection>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('stays rendered while loading even with zero items', () => {
    render(
      <CollectionSection isLoading itemCount={0} title="Recent">
        <p>loading body</p>
      </CollectionSection>,
    );

    expect(screen.getByRole('region', { name: 'Recent' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByText('loading body')).toBeInTheDocument();
  });

  it('renders a labelled h2 landmark with the count when asked', () => {
    render(
      <CollectionSection isCountVisible itemCount={3} title="Needs you">
        <p>body</p>
      </CollectionSection>,
    );

    const section = screen.getByRole('region', { name: /Needs you/ });
    expect(section).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Needs you3',
    );
  });

  it('replaces the body with the section error and keeps the heading', () => {
    render(
      <CollectionSection
        error="Could not load agents"
        itemCount={0}
        title="All"
      >
        <p>body</p>
      </CollectionSection>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load agents',
    );
    expect(screen.queryByText('body')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'All' })).toBeInTheDocument();
  });

  it('makes the header sticky only when requested', () => {
    const { rerender } = render(
      <CollectionSection itemCount={1} title="All">
        <p>body</p>
      </CollectionSection>,
    );
    const header = () =>
      screen.getByRole('heading').parentElement?.parentElement;
    expect(header()).not.toHaveClass('sticky');

    rerender(
      <CollectionSection isHeaderSticky itemCount={1} title="All">
        <p>body</p>
      </CollectionSection>,
    );
    expect(header()).toHaveClass('sticky', 'top-0');
  });
});
