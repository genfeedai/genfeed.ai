import type { FormControlProps } from '@props/forms/form.props';
import Field from '@ui/primitives/field';

export default function FormControl({
  children,
  className = '',
  description,
  error,
  helpText,
  htmlFor,
  isRequired = false,
  label,
}: FormControlProps) {
  return (
    <Field
      className={className}
      description={description}
      error={error}
      helpText={helpText}
      htmlFor={htmlFor}
      isRequired={isRequired}
      label={label}
    >
      {children}
    </Field>
  );
}
