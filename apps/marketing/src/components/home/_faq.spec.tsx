import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomeFaq from './_faq';

describe('HomeFaq', () => {
  it('answers whether Genfeed is only for video', () => {
    render(<HomeFaq />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Is Genfeed only for video?' }),
    );

    expect(
      screen.getByText(/makes and manages everything you publish/i),
    ).toBeInTheDocument();
  });

  it('links to the full FAQ', () => {
    render(<HomeFaq />);

    expect(
      screen.getByRole('link', { name: 'Read every answer' }),
    ).toHaveAttribute('href', '/faq');
  });
});
