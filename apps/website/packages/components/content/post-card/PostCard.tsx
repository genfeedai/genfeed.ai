'use client';

import type { ICredential, IIngredient } from '@genfeedai/contracts/interfaces';
import type { PostCardProps } from '@genfeedai/contracts/interfaces/content/publication-card.interface';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Calendar, CalendarCheck, ExternalLink, Play } from 'lucide-react';
import Image from 'next/image';

export default function PostCard({ post, className = '' }: PostCardProps) {
  const ingredients = (post.ingredients || []) as IIngredient[];
  const primaryIngredient = ingredients[0];
  const credential = post.credential as ICredential;
  const postDates = [
    {
      date: post.uploadedAt,
      icon: Calendar,
      iconColor: 'text-muted-foreground',
      label: 'Uploaded',
    },
    {
      date: post.scheduledDate,
      icon: Calendar,
      iconColor: 'text-muted-foreground',
      label: 'Scheduled',
    },
    {
      date: post.publicationDate,
      icon: CalendarCheck,
      iconColor: 'text-green-500',
      label: 'Published',
    },
  ].reduce<
    Array<{
      date: string;
      icon: typeof Calendar;
      iconColor: string;
      label: string;
    }>
  >((items, item) => {
    if (item.date) {
      items.push({ ...item, date: item.date });
    }

    return items;
  }, []);

  const externalUrl =
    post.url ||
    (credential?.externalId && credential?.externalUrl
      ? `${credential.externalUrl}/video/${credential.externalId}`
      : null);

  return (
    <Card
      className={`shadow-lg hover:shadow-xl transition-all duration-300 group ${className}`}
      bodyClassName="p-4"
      actions={
        externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 text-sm font-medium transition-colors gap-2"
            title="View"
          >
            <ExternalLink />
            View
          </a>
        ) : undefined
      }
    >
      <figure className="relative w-full h-48 bg-muted overflow-hidden -mx-4 -mt-4 mb-4">
        {primaryIngredient?.thumbnailUrl ? (
          <Image
            src={primaryIngredient.thumbnailUrl}
            alt={primaryIngredient?.metadataLabel || 'Video thumbnail'}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            <Play className="text-muted-foreground text-4xl" />
          </div>
        )}

        <div className="absolute top-3 left-3">
          <div
            className={
              'bg-black/70 backdrop-blur-sm p-2' /* design-system-allow-content-color -- media overlay */
            }
          >
            {post.platform ? getPlatformIcon(post.platform) : null}
          </div>
        </div>

        <div className="absolute top-3 right-3">
          <Badge status={post.status} className="text-xs">
            {post.status}
          </Badge>
        </div>

        {primaryIngredient?.metadataDuration && (
          <div className="absolute bottom-3 right-3">
            <div
              className={
                'bg-black/70 backdrop-blur-sm px-2 py-1 text-surface text-xs' /* design-system-allow-content-color -- media overlay */
              }
            >
              {Math.floor(primaryIngredient.metadataDuration / 60)}:
              {(primaryIngredient.metadataDuration % 60)
                .toString()
                .padStart(2, '0')}
            </div>
          </div>
        )}
      </figure>

      <h3 className="text-lg font-semibold line-clamp-2 mb-2">
        {post.label || 'Untitled Post'}
      </h3>

      <div className="flex items-center gap-2 mb-3">
        {post.platform ? getPlatformIcon(post.platform) : null}
        <span className="text-sm capitalize text-foreground/70">
          {post.platform || 'Unknown Platform'}
        </span>
      </div>

      {ingredients.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-foreground/60 mb-2">
            {ingredients.length === 1
              ? 'Ingredient'
              : `Ingredients (${ingredients.length})`}
          </div>
          <div className="flex flex-wrap gap-2">
            {ingredients.map((ingredient) => (
              <span
                key={ingredient.id}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-current/20"
                title={ingredient.metadataLabel || undefined}
              >
                {ingredient.metadataLabel || 'Untitled'}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {postDates.map(({ date, icon: Icon, iconColor, label }) => (
          <div key={label} className="flex items-center gap-2 text-sm">
            <Icon className={`${iconColor} size-4`} />
            <span className="text-foreground/70">
              {label}: {formatDate(date)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
