import { ButtonVariant } from '@genfeedai/contracts';
import { addUTMParameters } from '@helpers/utm/utm-builder.helper';
import type { CreatorRailProps } from '@props/content/creator.props';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { Button } from '@ui/primitives/button';
import ProfileSignupCta from '@web-components/profile/ProfileSignupCta';
import ProfileSocialLinks from '@web-components/profile/ProfileSocialLinks';
import ProfileSubscribe from '@web-components/profile/ProfileSubscribe';
import CopyLinkButton from './CopyLinkButton';
import ViewCount from './ViewCount';

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
        <div className="flex items-start gap-4">
          <BrandAvatar
            alt={`${label} logo`}
            name={label}
            size="xl"
            src={brand.logoUrl}
          />
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-semibold leading-tight text-foreground">
              {label}
            </h1>
            <p className="text-sm text-foreground/60">@{handle}</p>
            {brand.description ? (
              <p className="pt-1 text-sm leading-6 text-foreground/80">
                {brand.description}
              </p>
            ) : null}
          </div>
        </div>
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
        <ViewCount id={brand.id} target="profile" />
      </div>

      <div className="flex items-center gap-4">
        <ProfileSocialLinks handle={handle} socials={brand.socials} />
        <CopyLinkButton className="ml-auto" url={profileUrl} />
      </div>

      <ProfileSubscribe
        brandId={brand.id}
        brandLabel={label}
        source="profile"
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
    </div>
  );
}
