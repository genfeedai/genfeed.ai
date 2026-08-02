import { APP_ROUTES } from '@genfeedai/constants';
import { redirect } from 'next/navigation';

/** Index → all models (dynamic `[type]` segment with slug `all`). */
export default function AdminModelsIndexPage() {
  redirect(APP_ROUTES.ADMIN.AUTOMATION.MODELS_ALL);
}
