import PromptSuggestions from '@pages/studio/prompt-bars/PromptSuggestions';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

const mockSuggestions = [
  'A beautiful sunset over mountains',
  'A futuristic cityscape at night',
  'An abstract art piece with vibrant colors',
];

describe('PromptSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <PromptSuggestions suggestions={mockSuggestions} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display suggestions', () => {
    render(
      <PromptSuggestions suggestions={mockSuggestions} onSelect={vi.fn()} />,
    );
    expect(
      screen.getByText('A beautiful sunset over mountains'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A futuristic cityscape at night'),
    ).toBeInTheDocument();
  });
});
