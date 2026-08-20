import { APP_ROUTES } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/** Legacy `/automate/new` → nested `/automate/agents/new`. */
export default function AutomateNewAgentLegacyRoute() {
  permanentRedirect(APP_ROUTES.AUTOMATE.NEW);
}
