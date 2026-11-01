import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Stepper } from './stepper';

const STEPS = [
  { id: 'brand', label: 'Brand' },
  { id: 'voice', label: 'Voice' },
  { id: 'plan', label: 'Plan' },
];

it('marks the current step and shows a check on completed ones', () => {
  render(<Stepper currentStep={1} steps={STEPS} />);

  expect(screen.getByText('Voice').closest('[aria-current]')).toHaveAttribute(
    'aria-current',
    'step',
  );
  expect(screen.getByText('Brand').closest('[aria-current]')).toBeNull();
  expect(screen.getByText('3')).toBeInTheDocument();
  expect(screen.queryByText('1')).toBeNull();
});

it('renders plain steps without buttons when no handler is given', () => {
  render(<Stepper currentStep={0} steps={STEPS} />);

  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
});

it('calls onStepSelect with the index of the clicked step', () => {
  const onStepSelect = vi.fn();
  render(<Stepper currentStep={2} onStepSelect={onStepSelect} steps={STEPS} />);

  fireEvent.click(screen.getByRole('button', { name: 'Voice' }));

  expect(onStepSelect).toHaveBeenCalledWith(1);
});

it('does not select a disabled step', () => {
  const onStepSelect = vi.fn();
  render(
    <Stepper
      currentStep={0}
      onStepSelect={onStepSelect}
      steps={[STEPS[0], { ...STEPS[1], isDisabled: true }, STEPS[2]]}
    />,
  );

  const voice = screen.getByRole('button', { name: 'Voice' });
  expect(voice).toBeDisabled();
  fireEvent.click(voice);
  expect(onStepSelect).not.toHaveBeenCalled();
});
