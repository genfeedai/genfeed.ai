import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';

export const generateMetadata = createPageMetadata('Agents');

/** Schedule and autonomy live on the agent. Keep the old URL working. */
export default function AutopilotPage() {
  redirect(APP_ROUTES.AUTOMATION.AGENTS);
}
