import { fireEvent, render, screen } from '@testing-library/react';
import FormInput from '@ui/forms/inputs/input/form-input/FormInput';
import { useRef } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

// Wrapper component for controlled form tests
function _ControlledFormWrapper({
  children,
  defaultValues = {},
}: {
  children: React.ReactNode;
  defaultValues?: Record<string, unknown>;
}) {
  const methods = useForm({ defaultValues });
  return <FormProvider {...methods}>{children}</FormProvider>;
}

// Test component that provides control from useForm
function ControlledFormInput(props: {
  name: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isDisabled?: boolean;
  isChecked?: boolean;
  min?: number;
  max?: number;
  step?: number;
  hasError?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const { control } = useForm({
    defaultValues: { [props.name]: props.defaultValue || '' },
  });

  return <FormInput {...props} control={control} />;
}

describe('FormInput', () => {
  it('renders uncontrolled input with value', () => {
    render(<FormInput name="test" value="test value" />);
    const input = screen.getByDisplayValue('test value');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('name', 'test');
  });

  it('renders with placeholder', () => {
    render(<FormInput name="test" placeholder="Enter text" />);
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('handles onChange events', () => {
    const handleChange = vi.fn();
    render(<FormInput name="test" onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'new value' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('renders as readonly when specified', () => {
    render(<FormInput name="test" isReadOnly={true} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('readOnly');
  });

  it('renders as required when specified', () => {
    render(<FormInput name="test" isRequired={true} />);
    expect(screen.getByRole('textbox')).toBeRequired();
  });

  it('renders as disabled when specified', () => {
    render(<FormInput name="test" isDisabled={true} />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('renders checkbox input', () => {
    render(<FormInput name="test" type="checkbox" />);
    const input = screen.getByRole('checkbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'checkbox');
  });

  it('renders radio input', () => {
    render(<FormInput name="test" type="radio" />);
    const input = screen.getByRole('radio');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'radio');
  });

  it('sets checked state for checkbox', () => {
    render(<FormInput name="test" type="checkbox" isChecked={true} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('sets checked state for radio', () => {
    render(<FormInput name="test" type="radio" isChecked={true} />);
    expect(screen.getByRole('radio')).toBeChecked();
  });

  it('renders number input with min/max/step', () => {
    render(<FormInput name="test" type="number" min={0} max={100} step={5} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
    expect(input).toHaveAttribute('step', '5');
  });

  it('applies custom className', () => {
    render(<FormInput name="test" className="custom-class" />);
    expect(screen.getByRole('textbox')).toHaveClass('custom-class');
  });

  it('renders with default type text', () => {
    render(<FormInput name="test" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'text');
  });

  it('renders with empty value when value is undefined', () => {
    render(<FormInput name="test" value={undefined} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('renders with empty value when value is null', () => {
    render(<FormInput name="test" value={null as any} />);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('renders password input', () => {
    render(<FormInput name="test" type="password" />);
    const input = screen.getByDisplayValue('');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders email input', () => {
    render(<FormInput name="test" type="email" />);
    const input = screen.getByDisplayValue('');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('renders url input', () => {
    render(<FormInput name="test" type="url" />);
    const input = screen.getByDisplayValue('');
    expect(input).toHaveAttribute('type', 'url');
  });

  it('renders tel input', () => {
    render(<FormInput name="test" type="tel" />);
    const input = screen.getByDisplayValue('');
    expect(input).toHaveAttribute('type', 'tel');
  });

  it('renders search input', () => {
    render(<FormInput name="test" type="search" />);
    const input = screen.getByDisplayValue('');
    expect(input).toHaveAttribute('type', 'search');
  });

  it('handles onKeyDown event', () => {
    const handleKeyDown = vi.fn();
    render(<FormInput name="test" onKeyDown={handleKeyDown} />);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(handleKeyDown).toHaveBeenCalled();
  });

  it('applies error styling when hasError is true', () => {
    render(<FormInput name="test" hasError={true} />);
    expect(screen.getByRole('textbox')).toHaveClass('border-destructive');
  });

  it('does not apply error styling when hasError is false', () => {
    render(<FormInput name="test" hasError={false} />);
    expect(screen.getByRole('textbox')).not.toHaveClass('border-destructive');
  });

  describe('controlled input with react-hook-form', () => {
    it('renders controlled input with default value', () => {
      render(
        <ControlledFormInput name="test" defaultValue="controlled value" />,
      );
      const input = screen.getByDisplayValue('controlled value');
      expect(input).toBeInTheDocument();
    });

    it('renders controlled input with placeholder', () => {
      render(
        <ControlledFormInput name="test" placeholder="Enter controlled text" />,
      );
      expect(
        screen.getByPlaceholderText('Enter controlled text'),
      ).toBeInTheDocument();
    });

    it('renders controlled readonly input', () => {
      render(<ControlledFormInput name="test" isReadOnly={true} />);
      expect(screen.getByRole('textbox')).toHaveAttribute('readOnly');
    });

    it('renders controlled required input', () => {
      render(<ControlledFormInput name="test" isRequired={true} />);
      expect(screen.getByRole('textbox')).toBeRequired();
    });

    it('renders controlled disabled input', () => {
      render(<ControlledFormInput name="test" isDisabled={true} />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('renders controlled checkbox', () => {
      render(
        <ControlledFormInput name="test" type="checkbox" isChecked={true} />,
      );
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
    });

    it('renders controlled radio', () => {
      render(<ControlledFormInput name="test" type="radio" isChecked={true} />);
      const radio = screen.getByRole('radio');
      expect(radio).toBeInTheDocument();
    });

    it('renders controlled number input with min/max/step', () => {
      render(
        <ControlledFormInput
          name="test"
          type="number"
          min={0}
          max={100}
          step={5}
        />,
      );
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAttribute('min', '0');
      expect(input).toHaveAttribute('max', '100');
      expect(input).toHaveAttribute('step', '5');
    });

    it('applies error styling in controlled input', () => {
      render(<ControlledFormInput name="test" hasError={true} />);
      expect(screen.getByRole('textbox')).toHaveClass('border-destructive');
    });

    it('handles onKeyDown in controlled input', () => {
      const handleKeyDown = vi.fn();
      render(<ControlledFormInput name="test" onKeyDown={handleKeyDown} />);
      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(handleKeyDown).toHaveBeenCalled();
    });

    it('renders controlled password input', () => {
      render(<ControlledFormInput name="test" type="password" />);
      const input = screen.getByDisplayValue('');
      expect(input).toHaveAttribute('type', 'password');
    });

    it('allows typing in controlled input', () => {
      render(<ControlledFormInput name="test" />);
      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'typed value' } });
      expect(input).toHaveValue('typed value');
    });
  });

  describe('inputRef handling', () => {
    it('assigns inputRef for uncontrolled input', () => {
      const TestComponent = () => {
        const inputRef = useRef<HTMLInputElement | null>(null);
        return <FormInput name="test" inputRef={inputRef} />;
      };
      const { container } = render(<TestComponent />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('assigns inputRef for controlled input', () => {
      const TestComponent = () => {
        const inputRef = useRef<HTMLInputElement | null>(null);
        const { control } = useForm({ defaultValues: { test: '' } });
        return <FormInput name="test" control={control} inputRef={inputRef} />;
      };
      const { container } = render(<TestComponent />);
      expect(container.firstChild).toBeInTheDocument();
    });
  });
});
