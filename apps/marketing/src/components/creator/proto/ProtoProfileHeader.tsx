import { ButtonVariant } from '@genfeedai/contracts';
import { GENFEED_BRAND_HANDLE } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers';
import type { CreatorHeaderProps } from '@props/content/creator.props';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import ProfileSignupCta from '@web-components/profile/ProfileSignupCta';
import ProfileSubscribe from '@web-components/profile/ProfileSubscribe';
import CopyLinkButton from '../CopyLinkButton';
import CreatorAccounts from '../CreatorAccounts';
import SupportCreatorButton from '../SupportCreatorButton';

export type ProtoDirection = 'a' | 'b' | 'c';

const STAT_LABELS = [
  ['posts', 'posts'],
  ['images', 'images'],
  ['videos', 'videos'],
  ['articles', 'articles'],
] as const;

/**
 * Only the picture overlaps the banner. The name block stays in normal flow
 * below it, so the banner (a positioned box that paints over static content)
 * can never cover the name again.
 */
function ProfileAvatar({
  brand,
  label,
}: Pick<CreatorHeaderProps, 'brand'> & { label: string }) {
  return (
    <div className="relative z-10 w-fit shrink-0 rounded-2xl bg-background p-1.5">
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
  );
}

function Identity({
  centered = false,
  handle,
  label,
}: {
  centered?: boolean;
  handle: string;
  label: string;
}) {
  return (
    <div className={cn('min-w-0', centered && 'text-center')}>
      <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
        {label}
      </h1>
      <p className="text-sm text-foreground/60">@{handle}</p>
    </div>
  );
}

function Stats({
  centered = false,
  counts,
}: Pick<CreatorHeaderProps, 'counts'> & { centered?: boolean }) {
  const stats = STAT_LABELS.filter(([key]) => counts[key] > 0);

  if (stats.length === 0) {
    return null;
  }

  return (
    <p className={cn('text-sm text-foreground/60', centered && 'text-center')}>
      {stats.map(([key, noun], index) => (
        <span key={key}>
          {index > 0 ? ' · ' : null}
          <span className="font-semibold text-foreground">{counts[key]}</span>{' '}
          {counts[key] === 1 ? noun.slice(0, -1) : noun}
        </span>
      ))}
    </p>
  );
}

/**
 * One primary action (Join Genfeed), then Subscribe, Support and the link as
 * quiet secondary controls. Every direction uses the same four; they only
 * change where the row sits.
 */
function Actions({
  className,
  handle,
  logoUrl,
  referralCode,
  profileUrl,
}: {
  className?: string;
  handle: string;
  logoUrl?: string;
  profileUrl: string;
  referralCode: string | null;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
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
          logoUrl={logoUrl}
        />
      )}
      <CopyLinkButton url={profileUrl} />
    </div>
  );
}

/**
 * Direction A: the classic profile. Picture left, actions right on desktop;
 * on a phone the name and bio come before the actions.
 */
function DirectionA(props: CreatorHeaderProps & { label: string }) {
  const { brand, counts, handle, label, profileUrl, referralCode } = props;

  return (
    <header className="grid gap-4 px-1 sm:grid-cols-[auto_1fr] sm:gap-x-4 sm:gap-y-3">
      <div className="-mt-12 sm:-mt-16">
        <ProfileAvatar brand={brand} label={label} />
      </div>
      <Actions
        className="order-3 sm:order-2 sm:justify-end sm:pt-3"
        handle={handle}
        logoUrl={brand.logoUrl}
        profileUrl={profileUrl}
        referralCode={referralCode}
      />
      <div className="order-2 space-y-3 sm:order-3 sm:col-span-2">
        <Identity handle={handle} label={label} />
        {brand.description ? (
          <p className="max-w-prose text-base leading-7 text-foreground/80">
            {brand.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <Stats counts={counts} />
          <CreatorAccounts brand={brand} handle={handle} />
        </div>
      </div>
    </header>
  );
}

/** Direction B: centred, for readers who land from a link in a social bio. */
function DirectionB(props: CreatorHeaderProps & { label: string }) {
  const { brand, counts, handle, label, profileUrl, referralCode } = props;

  return (
    <header className="flex flex-col items-center gap-4 px-1 text-center">
      <div className="-mt-14 sm:-mt-20">
        <ProfileAvatar brand={brand} label={label} />
      </div>
      <Identity centered handle={handle} label={label} />
      {brand.description ? (
        <p className="max-w-prose text-base leading-7 text-foreground/80">
          {brand.description}
        </p>
      ) : null}
      <Stats centered counts={counts} />
      <Actions
        className="justify-center"
        handle={handle}
        logoUrl={brand.logoUrl}
        profileUrl={profileUrl}
        referralCode={referralCode}
      />
      <CreatorAccounts brand={brand} handle={handle} />
    </header>
  );
}

/** Direction C: a side rail on desktop. The header scrolls with the rail. */
function RailHeader(props: CreatorHeaderProps & { label: string }) {
  const { brand, counts, handle, label, profileUrl, referralCode } = props;

  return (
    <header className="space-y-4 px-1">
      <div className="-mt-12 sm:-mt-16">
        <ProfileAvatar brand={brand} label={label} />
      </div>
      <Identity handle={handle} label={label} />
      {brand.description ? (
        <p className="text-base leading-7 text-foreground/80">
          {brand.description}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <ProfileSignupCta
          handle={handle}
          label="Join Genfeed"
          referralCode={referralCode}
        />
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 [&_button]:w-full">
          <ProfileSubscribe
            handle={handle}
            layout="compact"
            source="profile"
            variant={ButtonVariant.SECONDARY}
          />
          {handle === GENFEED_BRAND_HANDLE ? (
            <span />
          ) : (
            <SupportCreatorButton
              handle={handle}
              label="Support"
              logoUrl={brand.logoUrl}
            />
          )}
          <CopyLinkButton url={profileUrl} />
        </div>
      </div>
      <Stats counts={counts} />
      <CreatorAccounts brand={brand} handle={handle} />
    </header>
  );
}

export function ProtoProfileHeader({
  direction,
  ...props
}: CreatorHeaderProps & { direction: ProtoDirection }): React.ReactElement {
  const label = props.brand.label?.trim() || `@${props.handle}`;

  return (
    <>
      {direction === 'a' ? <DirectionA {...props} label={label} /> : null}
      {direction === 'b' ? <DirectionB {...props} label={label} /> : null}
      {direction === 'c' ? <RailHeader {...props} label={label} /> : null}
    </>
  );
}
