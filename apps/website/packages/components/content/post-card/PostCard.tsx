'use client';

import type { ICredential, IIngredient } from '@genfeedai/interfaces';
import type { PostCardProps } from '@genfeedai/interfaces/content/publication-card.interface';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Image from 'next/image';
import Link from 'next/link';
import { FaCalendarAlt } from 'react-icons/fa';
import { FaCalendarCheck, FaPlay } from 'react-icons/fa6';
import { HiArrowTopRightOnSquare } from 'react-icons/hi2';

export default function PostCard({ post, className = '' }: PostCardProps) {
  const ingredients = (post.ingredients || []) as IIngredient[];
  const primaryIngredient = ingredients[0];
  const credential = post.credential as ICredential;

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
            <HiArrowTopRightOnSquare />
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
            <FaPlay className="text-muted-foreground text-4xl" />
          </div>
        )}

        <div className="absolute top-3 left-3">
          <div className="bg-black/70 backdrop-blur-sm p-2">
            {getPlatformIcon(post.platform)}
          </div>
        </div>

        <div className="absolute top-3 right-3">
          <Badge status={post.status} className="text-xs">
            {post.status}
          </Badge>
        </div>

        {primaryIngredient?.metadataDuration && (
          <div className="absolute bottom-3 right-3">
            <div className="bg-black/70 backdrop-blur-sm px-2 py-1 text-surface text-xs">
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
        {getPlatformIcon(post.platform)}
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
              <Link
                key={ingredient.id}
                href={`/ingredients/${post.category}s/${ingredient.id}`}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-current/20 hover:bg-primary hover:text-primary-foreground transition-colors"
                title={ingredient.metadataLabel || 'View ingredient'}
              >
                {ingredient.metadataLabel || 'Untitled'}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2 mb-4">
        {[
          {
            date: post.uploadedAt,
            icon: FaCalendarAlt,
            iconColor: 'text-muted-foreground',
            label: 'Uploaded',
          },
          {
            date: post.scheduledDate,
            icon: FaCalendarAlt,
            iconColor: 'text-muted-foreground',
            label: 'Scheduled',
          },
          {
            date: post.publicationDate,
            icon: FaCalendarCheck,
            iconColor: 'text-green-500',
            label: 'Published',
          },
        ]
          .filter(
            (
              item,
            ): item is typeof item & {
              date: string;
            } => Boolean(item.date),
          )
          .map(({ date, icon: Icon, iconColor, label }) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <Icon className={`${iconColor} w-4 h-4`} />
              <span className="text-foreground/70">
                {label}: {formatDate(date)}
              </span>
            </div>
          ))}
      </div>
    </Card>
  );
}
