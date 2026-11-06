import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import TextareaLabelActions from '@/components/content/textarea-label-actions/TextareaLabelActions';

describe('TextareaLabelActions', () => {
  it('shows the label with a required marker', () => {
    render(
      <TextareaLabelActions
        isRequired
        label="Prompt"
        onCopy={vi.fn()}
        onEnhance={vi.fn()}
      />,
    );

    expect(screen.getByText('Prompt')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});
