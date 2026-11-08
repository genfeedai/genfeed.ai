import { CardVariant } from '@genfeedai/contracts';
import { creatorProfilePath } from '@genfeedai/contracts/constants';
import type { CommunityCreatorCardProps } from '@props/content/creator.props';
import Card from '@ui/card/Card';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import Link from 'next/link';

/** A creator on the community page: who they are, linking to their profile. */
export default function CommunityCreatorCard({
  brand,
}: CommunityCreatorCardProps): React.ReactElement {
  const label = brand.label?.trim() || `@${brand.slug}`;

  return (
    <Link className="group block h-full" href={creatorProfilePath(brand.slug)}>
      <Card isInteractive variant={CardVariant.BORDERED} className="h-full">
        <div className="mb-3 flex items-center gap-3">
          <BrandAvatar
            alt={`${label} logo`}
            name={label}
            size="lg"
            src={brand.logoUrl}
          />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-foreground transition-colors group-hover:text-primary">
              {label}
            </h3>
            <p className="truncate text-sm text-foreground/60">@{brand.slug}</p>
          </div>
        </div>
        {brand.description ? (
          <p className="line-clamp-3 text-sm text-foreground/70">
            {brand.description}
          </p>
        ) : null}
      </Card>
    </Link>
  );
}
