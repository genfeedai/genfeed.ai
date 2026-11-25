import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiGeneratedLabelField from '@/features/posts/components/posts/ai-generated-label/AiGeneratedLabelField';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('AiGeneratedLabelField', () => {
  it('shows the label as checked and reports a change', () => {
    const onChange = vi.fn();
    render(<AiGeneratedLabelField isChecked onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox', {
      name: 'Label as AI-generated',
    });
    expect(checkbox).toBeChecked();
    expect(
      screen.getByText(/Turn it off for a real video or photo you uploaded/),
    ).toBeInTheDocument();

    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('cannot be changed while disabled', () => {
    render(
      <AiGeneratedLabelField isChecked={false} isDisabled onChange={vi.fn()} />,
    );

    expect(
      screen.getByRole('checkbox', { name: 'Label as AI-generated' }),
    ).toBeDisabled();
  });
});
