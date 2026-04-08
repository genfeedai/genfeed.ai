import type { FormSearchbarProps } from '@props/forms/form.props';
import Searchbar from '@ui/primitives/searchbar';

export default function FormSearchbar(
  props: FormSearchbarProps,
): React.ReactElement {
  return <Searchbar {...props} />;
}
