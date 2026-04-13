import type { ContentHarnessPack } from './types';

export interface HarnessPackRegistry {
  registerPack(pack: ContentHarnessPack): void;
  get(id: string): ContentHarnessPack | undefined;
  list(): ContentHarnessPack[];
}

export class ContentHarnessRegistry implements HarnessPackRegistry {
  private readonly packs = new Map<string, ContentHarnessPack>();

  registerPack(pack: ContentHarnessPack): void {
    this.packs.set(pack.id, pack);
  }

  get(id: string): ContentHarnessPack | undefined {
    return this.packs.get(id);
  }

  list(): ContentHarnessPack[] {
    return [...this.packs.values()];
  }
}

export function isContentHarnessPack(
  value: unknown,
): value is ContentHarnessPack {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ContentHarnessPack>;
  return (
    typeof candidate.id === 'string' && typeof candidate.version === 'string'
  );
}
