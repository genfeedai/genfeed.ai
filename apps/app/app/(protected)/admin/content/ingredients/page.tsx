import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/** Index → videos type (dynamic `[type]` segment). */
export default function AdminIngredientsIndexPage() {
  redirect(APP_ROUTES.ADMIN.CONTENT.INGREDIENTS_VIDEOS);
}
