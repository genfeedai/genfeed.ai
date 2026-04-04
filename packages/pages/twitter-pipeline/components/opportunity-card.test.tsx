import OpportunityCard from '@pages/twitter-pipeline/components/opportunity-card';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const mockOpportunity = {
  author: {
    handle: 'testuser',
    name: 'Test User',
  },
  content: 'Test content',
  createdAt: '2024-01-01',
  id: '1',
  score: 0.85,
};

describe('OpportunityCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <OpportunityCard opportunity={mockOpportunity} onEngage={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display opportunity content', () => {
    render(
      <OpportunityCard opportunity={mockOpportunity} onEngage={vi.fn()} />,
    );
    expect(screen.getByText('Test content')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('@testuser')).toBeInTheDocument();
  });
});
