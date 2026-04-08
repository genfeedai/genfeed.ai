import type { DateRangePickerProps } from '@ui/primitives/date-range-picker';
import DateRangePicker from '@ui/primitives/date-range-picker';

export type FormDateRangePickerProps = DateRangePickerProps;

export default function FormDateRangePicker(props: FormDateRangePickerProps) {
  return <DateRangePicker {...props} />;
}
