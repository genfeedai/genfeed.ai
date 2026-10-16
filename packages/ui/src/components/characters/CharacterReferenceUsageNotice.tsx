'use client';

import type { CharacterReferenceUsage } from '@genfeedai/contracts/interfaces';
import { useTranslations } from 'next-intl';

export interface CharacterReferenceUsageNoticeProps {
  usage: CharacterReferenceUsage[];
}

/**
 * The characters that keep an asset as a reference image, shown inside the
 * delete confirm. A character that uses several of the assets being deleted
 * is listed once.
 */
export default function CharacterReferenceUsageNotice({
  usage,
}: CharacterReferenceUsageNoticeProps) {
  const translate = useTranslations(
    'common.settings.characters.referenceUsage',
  );

  const characters = new Map<string, { id: string; name: string }>();
  for (const entry of usage) {
    for (const character of entry.characters) {
      if (!characters.has(character.id)) {
        characters.set(character.id, {
          id: character.id,
          name: character.handle ? `@${character.handle}` : character.label,
        });
      }
    }
  }

  if (characters.size === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-left text-sm">
      <p className="font-medium">{translate('intro')}</p>
      <ul className="mt-2 list-disc pl-5">
        {[...characters.values()].map((character) => (
          <li key={character.id}>
            {translate('item', { name: character.name })}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-foreground/70">{translate('outro')}</p>
    </div>
  );
}
