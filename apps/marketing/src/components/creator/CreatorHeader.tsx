import { ButtonVariant } from '@genfeedai/contracts';
import { GENFEED_BRAND_HANDLE } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers';
import type { CreatorHeaderProps } from '@props/content/creator.props';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import ProfileSignupCta from '@web-components/profile/ProfileSignupCta';
import ProfileSubscribe from '@web-components/profile/ProfileSubscribe';
import CopyLinkButton from './CopyLinkButton';
import CreatorAccounts from './CreatorAccounts';
import SupportCreatorButton from './SupportCreatorButton';
import ViewTracker from './ViewTracker';

/**
 * Who the creator is, how to follow them, and what they have published.
 *
 * The picture overlaps the banner above; nothing else does. The banner is a
 * positioned box and paints over static content pulled up under it, so the
 * name, bio and actions sit in normal flow beside the picture, below the
 * banner's edge. On a phone the bio and actions drop under the picture.
 */
export default function CreatorHeader({
  brand,
  handle,
  hasBanner,
  profileUrl,
  referralCode,
}: CreatorHeaderProps): React.ReactElement {
  const label = brand.label?.trim() || `@${handle}`;

  return (
    <header className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 px-1 sm:gap-x-6">
      <div
        className={cn(
          'relative z-10 w-fit rounded-2xl bg-background p-1.5 sm:row-span-3',
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

      <div className="min-w-0 self-start pt-1">
        <h1 className="break-words text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          {label}
        </h1>
        <p className="text-sm text-foreground/60">@{handle}</p>
      </div>

      {brand.description ? (
        <p className="col-span-2 max-w-prose text-base leading-7 text-foreground/80 sm:col-span-1 sm:col-start-2">
          {brand.description}
        </p>
      ) : null}

      {/* One primary action. Subscribe, Support and the link stay secondary. */}
      <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:col-start-2">
        <div className="w-full sm:w-auto sm:min-w-44">
          <ProfileSignupCta
            handle={handle}
            label="Join Genfeed"
            referralCode={referralCode}
          />
        </div>
        <ProfileSubscribe
          handle={handle}
          layout="compact"
          source="profile"
          variant={ButtonVariant.SECONDARY}
        />
        {handle === GENFEED_BRAND_HANDLE ? null : (
          <SupportCreatorButton
            handle={handle}
            label="Support"
            logoUrl={brand.logoUrl}
          />
        )}
        <CopyLinkButton url={profileUrl} />
      </div>

      <div className="col-span-2 flex flex-wrap items-center justify-end gap-x-8 gap-y-3 pt-1">
        <CreatorAccounts brand={brand} handle={handle} />
      </div>
      <ViewTracker id={brand.id} target="profile" />
    </header>
  );
}
