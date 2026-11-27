/** Only a failed post needs the owner. A scheduled post is on track and shows once, in the list. */
export function needsPostAttention(status?: string | null): boolean {
  return status?.toLowerCase() === 'failed';
}
