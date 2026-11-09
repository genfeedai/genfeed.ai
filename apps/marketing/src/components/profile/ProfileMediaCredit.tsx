import { getAppSignUpUrl } from '@data/app-links';
import { modelCatalogHref } from '@data/model-credits';
import type { ProfileMediaCreditProps } from '@props/content/profile.props';
import Link from 'next/link';

/** Under a profile image or video: what made it, and a way to make one. */
export default function ProfileMediaCredit({
  modelKey,
  modelLabel,
}: ProfileMediaCreditProps): React.ReactElement {
  return (
    <p className="flex flex-wrap items-center gap-x-2 px-1 pt-2 text-xs text-foreground/60">
      {modelKey && modelLabel ? (
        <span>
          Made with{' '}
          <Link
            className="font-medium text-foreground hover:text-primary"
            href={modelCatalogHref(modelKey)}
          >
            {modelLabel}
          </Link>
        </span>
      ) : null}
      <a
        className="font-medium text-foreground hover:text-primary"
        href={getAppSignUpUrl()}
      >
        Make your own
      </a>
    </p>
  );
}
