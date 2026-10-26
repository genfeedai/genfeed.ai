import { getToolByName } from '@genfeedai/actions';

const PRIVATE_ARGUMENT = /secret|password|token|authorization|credential|key/i;
/** Opaque ids say nothing to a reviewer; the brand gets its own column. */
const OPAQUE_ID_ARGUMENT = /(?:Id|Ids|_id)$/;

/** Argument keys that carry the content itself rather than a setting. */
export const MCP_APPROVAL_CAPTION_ARGUMENT_KEYS = [
  'caption',
  'text',
  'description',
  'content',
  'prompt',
  'title',
] as const;

export function humanizeToken(value: string): string {
  const text = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Up to three short, non-private settings of the call, e.g. `Type: image`. */
export function describeMcpApprovalArguments(
  args: Record<string, unknown>,
): string {
  return Object.entries(args)
    .filter(
      ([key, value]) =>
        !PRIVATE_ARGUMENT.test(key) &&
        !OPAQUE_ID_ARGUMENT.test(key) &&
        !(MCP_APPROVAL_CAPTION_ARGUMENT_KEYS as readonly string[]).includes(
          key,
        ) &&
        (typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean') &&
        String(value).trim().length > 0 &&
        String(value).length <= 60,
    )
    .slice(0, 3)
    .map(([key, value]) => `${humanizeToken(key)}: ${String(value)}`)
    .join(' · ');
}

/** One line naming what an approval would do: the tool title and its settings. */
export function summarizeMcpApproval(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const title = getToolByName(toolName)?.title ?? humanizeToken(toolName);
  const details = describeMcpApprovalArguments(args);
  return details ? `${title} · ${details}` : title;
}
