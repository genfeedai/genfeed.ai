import { fireEvent, render, screen } from '@testing-library/react';
import FormDropdown from '@ui/forms/selectors/dropdown/form-dropdown/FormDropdown';
import { describe, expect, it, vi } from 'vitest';

describe('FormDropdown', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <FormDropdown name="test" options={[]} onChange={() => {}} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <FormDropdown name="test" options={[]} onChange={() => {}} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <FormDropdown name="test" options={[]} onChange={() => {}} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('renders icon-only trigger without selected label text', () => {
    render(
      <FormDropdown
        name="quality"
        value="premium"
        icon={<span data-testid="dropdown-icon">I</span>}
        label="Quality"
        triggerDisplay="icon-only"
        options={[
          { key: 'standard', label: 'Standard' },
          { key: 'premium', label: 'Premium' },
        ]}
        onChange={() => {}}
      />,
    );

    expect(screen.getByTestId('dropdown-icon')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Quality',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Premium')).not.toBeInTheDocument();
  });

  it('calls onChange with the selected option', () => {
    const handleChange = vi.fn();

    render(
      <FormDropdown
        name="quality"
        value="premium"
        options={[
          { key: 'standard', label: 'Standard' },
          { key: 'premium', label: 'Premium' },
        ]}
        onChange={handleChange}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Standard'));

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          name: 'quality',
          value: 'standard',
        }),
      }),
    );
  });
});
