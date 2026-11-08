const HTML_TAGS_PATTERN = /<[^>]*>/g;
const WHITESPACE_RUN_PATTERN = /\s+/g;
const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  threads: 'Threads',
  tiktok: 'TikTok',
  twitter: 'X',
  youtube: 'YouTube',
};

/** Post copy can carry editor HTML; cards and meta tags need plain text. */
export function toPlainPostText(value: string | undefined): string {
  return (value ?? '')
    .replace(HTML_TAGS_PATTERN, ' ')
    .replace(WHITESPACE_RUN_PATTERN, ' ')
    .trim();
}

/** "Posted on X", or nothing for a post published on Genfeed itself. */
export function postPlatformLabel(platform: string | undefined): string | null {
  if (!platform) {
    return null;
  }
  return PLATFORM_LABELS[platform.toLowerCase()] ?? null;
}

/** A post's title: its label, else the opening words of its copy. */
export function postTitle(label: string | undefined, text: string): string {
  const trimmedLabel = label?.trim();
  if (trimmedLabel) {
    return trimmedLabel;
  }
  if (text.length <= 80) {
    return text || 'Post';
  }
  const clipped = text.slice(0, 79);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}
