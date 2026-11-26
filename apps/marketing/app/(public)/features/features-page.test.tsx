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
  it('puts image and video generation in the agent flow', () => {
    render(<FeaturesPage />);

    expect(
      screen.getByText(
        /draft and schedule posts, make video and images, then publish/,
      ),
    ).toBeInTheDocument();
  });
});
