import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import NewsletterComposerPanel from '@pages/content/composer/newsletter-composer-panel';

export const generateMetadata = createPageMetadata('Compose Newsletter');

export default function ComposeNewsletterRoute() {
  return <NewsletterComposerPanel />;
}
