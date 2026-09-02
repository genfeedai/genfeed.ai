import { VideoEaseCurve } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import EaseCurveSelector from '@ui/storyboard/EaseCurveSelector';

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

    await user.click(screen.getByRole('button', { name: 'Ease In-Out Cubic' }));
    await user.click(screen.getByRole('button', { name: /Ease In-Out Sine/i }));
    expect(onChange).toHaveBeenNthCalledWith(
      1,
      VideoEaseCurve.EASE_IN_OUT_SINE,
    );

    await user.click(screen.getByRole('button', { name: 'Ease In-Out Cubic' }));
    await user.click(screen.getByRole('button', { name: /None/i }));
    expect(onChange).toHaveBeenNthCalledWith(2, undefined);
    expect(onChange).toHaveBeenCalledTimes(2);
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

    const trigger = screen.getByRole('button', { name: 'Transition ease' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveClass('w-64');
  });
});
