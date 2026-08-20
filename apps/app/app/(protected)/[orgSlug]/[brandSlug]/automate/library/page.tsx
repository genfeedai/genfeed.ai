import { APP_ROUTES } from '@genfeedai/constants';
import { permanentRedirect } from 'next/navigation';

/** Legacy Team list → nested `/automate/agents` roster. */
export default function AutomateLibraryLegacyRoute() {
  permanentRedirect(APP_ROUTES.AUTOMATE.AGENTS);
}
