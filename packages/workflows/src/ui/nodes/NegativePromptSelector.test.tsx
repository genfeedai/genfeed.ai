import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NegativePromptSelector } from './NegativePromptSelector';

function expand() {
  fireEvent.click(screen.getByRole('button', { name: /negative prompt/i }));
}

describe('NegativePromptSelector', () => {
  it('toggles the option grid and the custom input when the header is clicked', () => {
    render(<NegativePromptSelector value="" onChange={vi.fn()} />);

    expand();
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    expect(screen.getByLabelText('Custom')).toBeTruthy();

    expand();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('checks the options that are present in the value, case-insensitively', () => {
    render(
      <NegativePromptSelector value="Blurry, watermark" onChange={vi.fn()} />,
    );

    expand();

    expect(screen.getByLabelText('Blurry').getAttribute('data-state')).toBe(
      'checked',
    );
    expect(screen.getByLabelText('Watermark').getAttribute('data-state')).toBe(
      'checked',
    );
    expect(screen.getByLabelText('Distorted').getAttribute('data-state')).toBe(
      'unchecked',
    );
    expect(screen.getByText('2 selected')).toBeTruthy();
  });

  it('seeds the custom input with terms outside the predefined options', () => {
    render(
      <NegativePromptSelector
        value="blurry, ugly, , deformed hands"
        onChange={vi.fn()}
      />,
    );

    expand();

    expect((screen.getByLabelText('Custom') as HTMLInputElement).value).toBe(
      'ugly, deformed hands',
    );
    // One checked option (blurry) plus one for the non-empty custom group.
    expect(screen.getByText('2 selected')).toBeTruthy();
  });

  it('emits the checked options in canonical order, keeping custom terms', () => {
    const onChange = vi.fn();
    render(<NegativePromptSelector value="ugly, blurry" onChange={onChange} />);

    expand();
    fireEvent.click(screen.getByLabelText('Low Quality'));

    expect(onChange).toHaveBeenCalledWith('blurry, low quality, ugly');
  });

  it('removes an option when it is unchecked', () => {
    const onChange = vi.fn();
    render(
      <NegativePromptSelector value="blurry, watermark" onChange={onChange} />,
    );

    expand();
    fireEvent.click(screen.getByLabelText('Blurry'));

    expect(onChange).toHaveBeenCalledWith('watermark');
  });

  it('combines typed custom terms with the checked options', () => {
    const onChange = vi.fn();
    render(<NegativePromptSelector value="grainy" onChange={onChange} />);

    expand();
    fireEvent.change(screen.getByLabelText('Custom'), {
      target: { value: 'ugly,  deformed , ' },
    });

    expect(onChange).toHaveBeenCalledWith('grainy, ugly, deformed');
    expect((screen.getByLabelText('Custom') as HTMLInputElement).value).toBe(
      'ugly,  deformed , ',
    );
  });

  it('emits an empty string when everything is cleared', () => {
    const onChange = vi.fn();
    render(<NegativePromptSelector value="artifacts" onChange={onChange} />);

    expand();
    fireEvent.click(screen.getByLabelText('Artifacts'));

    expect(onChange).toHaveBeenCalledWith('');
  });
});
