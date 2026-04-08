import type { DatepickerProps } from '@ui/primitives/datepicker';
import Datepicker from '@ui/primitives/datepicker';

export type FormDatepickerProps = DatepickerProps;

export default function FormDatepicker(props: FormDatepickerProps) {
  return <Datepicker {...props} />;
}
