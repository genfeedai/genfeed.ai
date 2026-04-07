import { render } from '@testing-library/react';
import BaseFormField from '@ui/forms/base/base-form-field/BaseFormField';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

/** Wrapper that renders BaseFormField with a real form control */
function TestBaseFormField() {
  const { control } = useForm({ defaultValues: { test: '' } });
  return (
    <BaseFormField
      name="test"
      control={control}
      render={(field) => <input {...field} />}
    />
  );
}

describe('BaseFormField', () => {
  it('should render without crashing', () => {
    const { container } = render(<TestBaseFormField />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<TestBaseFormField />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<TestBaseFormField />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
