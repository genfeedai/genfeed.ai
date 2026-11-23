import { ButtonVariant } from '@genfeedai/contracts';
import { GENFEED_BRAND_HANDLE } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers';
import { addUTMParameters } from '@helpers/utm/utm-builder.helper';
import type { CreatorHeaderProps } from '@props/content/creator.props';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { Button } from '@ui/primitives/button';
import ProfileSignupCta from '@web-components/profile/ProfileSignupCta';
import ProfileSubscribe from '@web-components/profile/ProfileSubscribe';
import CopyLinkButton from './CopyLinkButton';
import CreatorAccounts from './CreatorAccounts';
import SupportCreatorButton from './SupportCreatorButton';
import ViewTracker from './ViewTracker';

const STAT_LABELS = [
  ['posts', 'posts'],
  ['articles', 'articles'],
  ['videos', 'videos'],
  ['images', 'images'],
] as const;

/**
 * Who the creator is, how to follow them, and what they have published. The
 * avatar overlaps the banner above; name and bio sit beside it, and the
 * connected accounts and counts run underneath.
 */
export default function CreatorHeader({
  brand,
  counts,
  handle,
  hasBanner,
  profileUrl,
  referralCode,
}: CreatorHeaderProps): React.ReactElement {
  const label = brand.label?.trim() || `@${handle}`;
  const stats = STAT_LABELS.filter(([key]) => counts[key] > 0);
  const links = brand.links ?? [];

  return (
    <header className="space-y-5 px-1">
      <div className="flex items-start gap-5">
        {/* Only the picture overlaps the banner. The banner is a positioned
            box, so it paints over any static content pulled up under it: the
            name used to sit in the pulled-up row and vanished behind it. */}
        <div
          className={cn(
            'relative z-10 shrink-0 rounded-2xl bg-background p-1.5',
            hasBanner && '-mt-12 sm:-mt-16',
          )}
        >
          <span className="sm:hidden">
            <BrandAvatar
              alt={`${label} logo`}
              name={label}
              size="2xl"
              src={brand.logoUrl}
            />
          </span>
          <span className="hidden sm:block">
            <BrandAvatar
              alt={`${label} logo`}
              name={label}
              size="3xl"
              src={brand.logoUrl}
            />
          </span>
        </div>
        <div className="min-w-0 space-y-0.5 pt-1">
          <h1 className="truncate text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
            {label}
          </h1>
          <p className="text-sm text-foreground/60">@{handle}</p>
        </div>
      </div>

      {brand.description ? (
        <p className="max-w-prose text-base leading-7 text-foreground/80">
          {brand.description}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-2">
        <div className="w-full sm:w-72">
          <ProfileSignupCta handle={handle} referralCode={referralCode} />
        </div>
        {handle === GENFEED_BRAND_HANDLE ? null : (
          <SupportCreatorButton handle={handle} logoUrl={brand.logoUrl} />
        )}
        <div className="w-full sm:w-72">
          <ProfileSubscribe handle={handle} source="profile" />
        </div>
        <CopyLinkButton url={profileUrl} />
      </div>

      {links.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {links.map((link) => (
            <li key={link.id}>
              <Button
                asChild
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                <a
                  href={addUTMParameters(link.url, handle)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {link.label}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        {stats.length > 0 ? (
          <p className="text-sm text-foreground/60">
            {stats.map(([key, noun], index) => (
              <span key={key}>
                {index > 0 ? ' · ' : null}
                <span className="font-semibold text-foreground">
                  {counts[key]}
                </span>{' '}
                {counts[key] === 1 ? noun.slice(0, -1) : noun}
              </span>
            ))}
          </p>
        ) : (
          <span />
        )}
        <CreatorAccounts brand={brand} handle={handle} />
      </div>
      <ViewTracker id={brand.id} target="profile" />
    </header>
  );
}
