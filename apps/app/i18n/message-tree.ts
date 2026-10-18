import type { IntlMessageTree } from '@genfeedai/props/providers/intl-provider.props';

export function mergeMessageTrees(
  inherited: IntlMessageTree,
  selected: IntlMessageTree,
): IntlMessageTree {
  const messages = { ...inherited };
  for (const [key, value] of Object.entries(selected)) {
    const previous = inherited[key];
    messages[key] =
      typeof value === 'string' || typeof previous !== 'object'
        ? value
        : mergeMessageTrees(previous, value);
  }
  return messages;
}
