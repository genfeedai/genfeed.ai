import { DEFAULT_LOCALE } from '@genfeedai/contracts/constants';
import {
  createTranslateFromCatalog,
  type MessageCatalog,
} from '@ui/tests/next-intl.stub';
import { loadMessages } from '../i18n/messages';

// Resolve against the real English catalog so shared-package namespaces
// (`agent`, `pages`, …) stay in sync with i18n/messages.ts.
const catalog = loadMessages(DEFAULT_LOCALE) as unknown as MessageCatalog;

/**
 * `vi.mock('next-intl')` replacement that resolves keys against the real
 * English catalog, so component tests keep asserting the copy a user actually
 * reads instead of a `catalog:` placeholder.
 *
 * Interpolation covers simple `{name}` placeholders and the catalog's
 * `{count, plural, one {...} other {...}}` cardinal form. It is intentionally
 * not a full ICU implementation. A missing key returns its own path, which
 * surfaces as a failed assertion rather than a silent blank.
 */
export const translateFromCatalog = createTranslateFromCatalog(catalog);
