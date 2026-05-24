import { render, screen } from '@testing-library/react';
import ContainerTitle from '@ui/layout/container-title/ContainerTitle';
import { describe, expect, it } from 'vitest';

describe('ContainerTitle', () => {
  it('renders plain text descriptions inside a paragraph', () => {
    render(
      <ContainerTitle title="Images" description="Generated assets library" />,
    );

    expect(screen.getByText('Generated assets library').tagName).toStrictEqual(
      'P',
    );
  });

  it('renders rich descriptions without nesting block elements inside paragraphs', () => {
    render(
      <ContainerTitle
        title="Images"
        description={
          <div data-testid="rich-description">
            <span>Generated assets library</span>
          </div>
        }
      />,
    );

    const richDescription = screen.getByTestId('rich-description');

    expect(richDescription).toBeInTheDocument();
    expect(richDescription.closest('p')).toBeNull();
  });
});
