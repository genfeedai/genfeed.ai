import { ButtonVariant } from '@genfeedai/contracts';
import { addUTMParameters } from '@helpers/utm/utm-builder.helper';
import type { CreatorRailProps } from '@props/content/creator.props';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { Button } from '@ui/primitives/button';
import ProfileSignupCta from '@web-components/profile/ProfileSignupCta';
import ProfileSocialLinks from '@web-components/profile/ProfileSocialLinks';
import ProfileSubscribe from '@web-components/profile/ProfileSubscribe';
import CopyLinkButton from './CopyLinkButton';

const MEMBER_SINCE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});

const STAT_LABELS = [
  ['articles', 'articles'],
  ['posts', 'posts'],
  ['videos', 'videos'],
  ['images', 'images'],
] as const;

/** Who the creator is, how to follow them, and what they have published. */
export default function CreatorRail({
  brand,
  counts,
  handle,
  profileUrl,
  referralCode,
}: CreatorRailProps): React.ReactElement {
  const label = brand.label?.trim() || `@${handle}`;
  const stats = STAT_LABELS.filter(([key]) => counts[key] > 0);
  const links = brand.links ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <BrandAvatar
          alt={`${label} logo`}
          name={label}
          size="2xl"
          src={brand.logoUrl}
        />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{label}</h1>
          <p className="text-sm text-foreground/60">@{handle}</p>
        </div>
        {brand.description ? (
          <p className="text-sm leading-6 text-foreground/80">
            {brand.description}
          </p>
        ) : null}
        {stats.length > 0 ? (
          <p className="text-sm text-foreground/60">
            {stats.map(([key, noun], index) => (
              <span key={key}>
                {index > 0 ? ' · ' : null}
                <span className="font-semibold text-foreground">
                  {counts[key]}
                </span>{' '}
                {noun}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <ProfileSubscribe brandId={brand.id} />
        <CopyLinkButton className="w-full" url={profileUrl} />
      </div>

      <ProfileSocialLinks
        handle={handle}
        instagramUrl={brand.instagramUrl}
        tiktokUrl={brand.tiktokUrl}
        twitterUrl={brand.twitterUrl}
        youtubeUrl={brand.youtubeUrl}
      />

      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((link) => (
            <li key={link.id}>
              <Button
                asChild
                className="w-full"
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

      <ProfileSignupCta handle={handle} referralCode={referralCode} />

      {brand.createdAt ? (
        <p className="text-xs text-foreground/50">
          On Genfeed since{' '}
          {MEMBER_SINCE_FORMAT.format(new Date(brand.createdAt))}
        </p>
      ) : null}
    </div>
  );
}
