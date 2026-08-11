import common from '../messages/en/common.json';

type MessageNode = string | { readonly [key: string]: MessageNode };

/**
 * The catalog files hold a namespace's contents, not the namespace itself —
 * `i18n/messages.ts` is what nests them. Mirror that here so a lookup of
 * `common.actions.cancel` resolves.
 */
const MESSAGES = { common } as unknown as MessageNode;

/**
 * `vi.mock('next-intl')` replacement that resolves keys against the real
 * English catalog, so component tests keep asserting the copy a user actually
 * reads instead of a `catalog:` placeholder.
 *
 * Interpolation covers the `{name}` form the catalog uses; it is not a full
 * ICU implementation. A missing key returns its own path, which surfaces as a
 * failed assertion rather than a silent blank.
 */
export function translateFromCatalog(namespace: string) {
  return (key: string, values?: Record<string, string | number>): string => {
    const path = `${namespace}.${key}`;
    let node: MessageNode = MESSAGES;

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

    return node.replace(/\{(\w+)\}/g, (token, name: string) =>
      values?.[name] === undefined ? token : String(values[name]),
    );
  };
}
