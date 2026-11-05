import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailSystemPrompt from '@/features/brands/components/system-prompt/BrandDetailSystemPrompt';

describe('BrandDetailSystemPrompt', () => {
  it('shows the system prompt and copies its text', () => {
    const onCopy = vi.fn();
    render(
      <BrandDetailSystemPrompt text="Write like a founder." onCopy={onCopy} />,
    );

    expect(screen.getByText('Write like a founder.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));

    expect(onCopy).toHaveBeenCalledWith('Write like a founder.');
  });
});
