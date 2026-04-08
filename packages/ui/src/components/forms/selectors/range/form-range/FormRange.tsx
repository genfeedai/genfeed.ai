import type { FormRangeProps } from '@props/forms/form.props';
import RangeField from '@ui/primitives/range-field';
import type { FieldValues } from 'react-hook-form';

export default function FormRange<T extends FieldValues>(
  props: FormRangeProps<T>,
) {
  return <RangeField {...props} />;
}
