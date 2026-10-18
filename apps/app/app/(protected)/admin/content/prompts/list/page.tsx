import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { redirect } from 'next/navigation';

/** Prompts are listed with generations; the old Prompts page redirects there. */
export default function PromptsListRedirect() {
  redirect(APP_ROUTES.ADMIN.CONTENT.GENERATIONS);
}
