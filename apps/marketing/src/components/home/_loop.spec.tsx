import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomeLoop from './_loop';

describe('HomeLoop', () => {
  it('says the product runs the loop around the file', () => {
    render(<HomeLoop />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'It does not stop at the file.',
      }),
    ).toBeInTheDocument();
  });

  it.each(['Trends', 'Create', 'Publish', 'Analytics'])(
    'names the %s step',
    (title) => {
      render(<HomeLoop />);

      expect(
        screen.getByRole('heading', { level: 3, name: title }),
      ).toBeInTheDocument();
    },
  );

  it('does not promise results', () => {
    render(<HomeLoop />);

    expect(
      screen.queryByText(/grow|viral|more views|reach/i),
    ).not.toBeInTheDocument();
  });
});
