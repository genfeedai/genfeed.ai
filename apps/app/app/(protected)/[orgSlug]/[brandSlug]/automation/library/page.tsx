import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { permanentRedirect } from 'next/navigation';

/** Legacy Team list → nested `/automation/agents` roster. */
export default function AutomationLibraryLegacyRoute() {
  permanentRedirect(APP_ROUTES.AUTOMATION.AGENTS);
}
