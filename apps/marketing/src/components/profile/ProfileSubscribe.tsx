import type { ProfileSubscribeProps } from '@props/content/creator.props';
import NewsletterSubscribeForm from '@web-components/newsletter/NewsletterSubscribeForm';

/**
 * Where a reader subscribes to a creator's newsletter by email: the profile
 * rail, the end of every article and every post page.
 */
export default function ProfileSubscribe({
  brandId,
  brandLabel,
  source,
  sourceRef,
}: ProfileSubscribeProps) {
  return (
    <NewsletterSubscribeForm
      brandId={brandId}
      description={
        brandLabel
          ? `Get new issues from ${brandLabel} by email.`
          : 'Get new issues by email.'
      }
      source={source}
      sourceRef={sourceRef}
      title="Subscribe"
    />
  );
}
