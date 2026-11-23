'use client';

import { Checkbox } from '@ui/primitives/checkbox';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { PostRemovalOptionsProps } from '@/features/posts/props/post-removal-options.props';

/**
 * What the delete confirmation adds to its message: the plain statement that
 * a published post stays on the social network unless deleted there too, the
 * choice to delete it on the network (X and Mastodon), and the choice to delete
 * the Library media the posts use. The choices are written to the refs, which
 * the confirm handler reads when the person confirms.
 */
export default function PostRemovalOptions({
  deleteOnPlatformRef,
  hasMedia,
  hasPlatformDeletable,
  hasPublished,
  includeMediaRef,
}: PostRemovalOptionsProps) {
  const translate = useTranslations('ui.postRemoval');
  const [includeMedia, setIncludeMedia] = useState(false);
  const [deleteOnPlatform, setDeleteOnPlatform] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {hasPublished ? (
        <p className="text-sm text-muted-foreground">
          {translate('publishedNotice')}
        </p>
      ) : null}
      {hasPlatformDeletable ? (
        <Checkbox
          isChecked={deleteOnPlatform}
          label={translate('deleteOnPlatform')}
          name="deleteOnPlatform"
          onCheckedChange={(checked) => {
            const next = checked === true;
            deleteOnPlatformRef.current = next;
            setDeleteOnPlatform(next);
          }}
        />
      ) : null}
      {hasMedia ? (
        <Checkbox
          isChecked={includeMedia}
          label={translate('includeMedia')}
          name="includeMedia"
          onCheckedChange={(checked) => {
            const next = checked === true;
            includeMediaRef.current = next;
            setIncludeMedia(next);
          }}
        />
      ) : null}
    </div>
  );
}
