import { DEFAULT_LOCALE } from '@genfeedai/constants';
import { loadMessages } from '../i18n/messages';

type MessageNode = string | { readonly [key: string]: MessageNode };

// Resolve against the real English catalog so shared-package namespaces
// (`agent`, `pages`, …) stay in sync with i18n/messages.ts.
const catalog = loadMessages(DEFAULT_LOCALE) as unknown as MessageNode;
const CARDINAL_PLURAL_PATTERN =
  /\{(\w+),\s*plural,\s*one\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\}/g;

function interpolateMessage(
  message: string,
  values?: Record<string, string | number>,
): string {
  const withPlurals = message.replace(
    CARDINAL_PLURAL_PATTERN,
    (token, name: string, singular: string, plural: string) => {
      const value = values?.[name];

      if (typeof value !== 'number') {
        return token;
      }

      return (value === 1 ? singular : plural).replaceAll('#', String(value));
    },
  );

  return withPlurals.replace(/\{(\w+)\}/g, (token, name: string) =>
    values?.[name] === undefined ? token : String(values[name]),
  );
}

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
export function translateFromCatalog(namespace: string) {
  return (key: string, values?: Record<string, string | number>): string => {
    const path = `${namespace}.${key}`;
    let node = catalog;

    for (const segment of path.split('.')) {
      if (typeof node === 'string') {
        return path;
      }

      const next = node[segment];

      if (next === undefined) {
        return path;
      }

      node = next;
    }

    if (typeof node !== 'string') {
      return path;
    }

    return interpolateMessage(node, values);
  };
}
