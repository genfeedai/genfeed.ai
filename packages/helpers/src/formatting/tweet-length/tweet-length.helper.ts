const URL_LENGTH = 23;
const urlRegex = /https?:\/\/[^\s]+/g;

export function calculateTweetLength(text: string): number {
  const urls = text.match(urlRegex) || [];
  const replaced = text.replace(urlRegex, '');
  return replaced.length + urls.length * URL_LENGTH;
}

export function isTweetTooLong(text: string): boolean {
  return calculateTweetLength(text) > 280;
}
