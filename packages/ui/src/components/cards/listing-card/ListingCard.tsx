'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { ListingCardProps } from '@props/cards/listing-card.props';
import Image from 'next/image';
import Link from 'next/link';
import { memo } from 'react';
import { HiStar } from 'react-icons/hi2';

function formatPrice(priceInCents: number, currency: string = 'USD'): string {
  if (!priceInCents || priceInCents === 0) {
    return 'Free';
  }
  return new Intl.NumberFormat('en-US', {
    currency,
    style: 'currency',
  }).format(priceInCents / 100);
}

const VARIANT_CLASSES = {
  compact: '',
  default: '',
  featured: '',
} as const;

const THUMBNAIL_ASPECT_CLASSES = {
  compact: 'aspect-[4/3]',
  default: 'aspect-[16/10]',
  featured: 'aspect-[16/9]',
} as const;

/**
 * ListingCard - A card component for marketplace listings
 * Supports default, compact, and featured variants
 */
const ListingCard = memo(function ListingCard({
  listing,
  variant = 'default',
  className,
}: ListingCardProps) {
  const sellerSlug = listing.seller?.slug || 'genfeed';
  const href = `/${sellerSlug}/${listing.slug}`;
  const isFree = !listing.price || listing.price === 0;

  return (
    <Link href={href} className="group block">
      <article
        className={cn(
          'relative h-full overflow-hidden',
          'gen-glass',
          'transition-all duration-400 ease-out',
          'hover:border-white/20 dark:hover:border-white/20',
          'hover:shadow-[0_0_40px_rgba(255,255,255,0.08)]',
          VARIANT_CLASSES[variant],
          className,
        )}
      >
        {/* Thumbnail */}
        <div
          className={cn(
            'relative overflow-hidden bg-black/20 dark:bg-black/20',
            THUMBNAIL_ASPECT_CLASSES[variant],
          )}
        >
          {listing.thumbnail ? (
            <Image
              src={listing.thumbnail}
              alt={listing.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/5 to-white/[0.02] dark:from-white/5 dark:to-white/[0.02]">
              <div className="w-16 h-16 bg-white/5 dark:bg-white/5 flex items-center justify-center">
                <span className="text-2xl opacity-40">
                  {listing.type === 'workflow'
                    ? '⚡'
                    : listing.type === 'prompt'
                      ? '💬'
                      : '🎯'}
                </span>
              </div>
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60" />

          {/* Price badge */}
          <div className="absolute top-3 right-3">
            <span
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md',
                isFree
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-white/10 text-white border border-white/20',
              )}
            >
              {formatPrice(listing.price, listing.currency)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className={cn('p-5', variant === 'compact' && 'p-4')}>
          {/* Title */}
          <h3 className="font-semibold text-foreground text-base leading-tight mb-2 line-clamp-1 group-hover:text-foreground/90 transition-colors">
            {listing.title}
          </h3>

          {/* Description - hidden in compact variant */}
          {variant !== 'compact' && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[2.5rem]">
              {listing.shortDescription}
            </p>
          )}

          {/* Footer */}
          <div
            className={cn(
              'flex items-center justify-between pt-3 border-t border-white/[0.06] dark:border-white/[0.06]',
              variant === 'compact' && 'pt-2',
            )}
          >
            {/* Seller */}
            {listing.seller?.displayName && (
              <div className="flex items-center gap-2">
                {listing.seller.avatar ? (
                  <Image
                    src={listing.seller.avatar}
                    alt={listing.seller.displayName}
                    width={24}
                    height={24}
                    className="rounded-full ring-1 ring-white/10"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-white/10 dark:bg-white/10 flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">
                      {listing.seller.displayName.charAt(0)}
                    </span>
                  </div>
                )}
                <span className="text-xs text-muted-foreground truncate max-w-truncate-sm">
                  {listing.seller.displayName}
                </span>
              </div>
            )}

            {/* Rating */}
            <div className="flex items-center gap-1">
              {listing.rating && listing.rating > 0 ? (
                <>
                  <HiStar className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs text-muted-foreground">
                    {listing.rating.toFixed(1)}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground/50">New</span>
              )}
            </div>
          </div>
        </div>

        {/* Hover glow effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none bg-gradient-to-t from-white/[0.02] to-transparent" />
      </article>
    </Link>
  );
});

export default ListingCard;
