import { VideoEaseCurve } from '@genfeedai/enums';
import type { ChangeEvent } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import EaseCurveSelector from '@ui/storyboard/EaseCurveSelector';

vi.mock('@ui/primitives/dropdown-field', () => ({
  default: ({
    label,
    value,
    isDisabled,
    options,
    onChange,
    className,
  }: {
    label?: string;
    value?: string;
    isDisabled?: boolean;
    className?: string;
    options: Array<{ key: string; label: string }>;
    onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  }) => (
    <label className={className}>
      {label}
      <select
        aria-label={label}
        disabled={isDisabled}
        value={value ?? ''}
        onChange={onChange}
      >
        <option value="">none</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}));

describe('EaseCurveSelector', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <EaseCurveSelector onChange={() => undefined} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('emits the selected ease curve and clears it when none is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <EaseCurveSelector
        value={VideoEaseCurve.EASE_IN_OUT_CUBIC}
        onChange={onChange}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText('Ease Curve'),
      VideoEaseCurve.EASE_IN_OUT_SINE,
    );
    expect(onChange).toHaveBeenCalledWith(VideoEaseCurve.EASE_IN_OUT_SINE);

    await user.selectOptions(screen.getByLabelText('Ease Curve'), '');
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('should apply correct styles and classes', () => {
    render(
      <EaseCurveSelector
        className="w-64"
        isDisabled
        label="Transition ease"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Transition ease')).toBeDisabled();
    expect(screen.getByText('Transition ease')).toHaveClass('w-64');
  });
});
