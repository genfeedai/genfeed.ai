import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import FeaturesPage from './features-page';

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    description,
  }: {
    children: ReactNode;
    description: string;
  }) => (
    <div>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

describe('FeaturesPage', () => {
  it('places image and video generation on the full Genfeed connector', () => {
    render(<FeaturesPage />);

    expect(
      screen.getByText(
        /draft and schedule posts, make video and images on the full Genfeed connector/,
      ),
    ).toBeInTheDocument();
  });
});
