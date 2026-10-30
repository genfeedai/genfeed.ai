const WEBSITE_URL = 'https://genfeed.ai';
const REPOSITORY_URL = 'https://github.com/genfeedai/genfeed.ai';

export function buildSoftwareApplicationJsonLd(description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    applicationCategory: 'MultimediaApplication',
    codeRepository: REPOSITORY_URL,
    description,
    downloadUrl: `${REPOSITORY_URL}/releases/latest`,
    isAccessibleForFree: true,
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    name: 'Genfeed',
    offers: {
      '@type': 'Offer',
      description: 'Self-hosted Community build, AGPL-3.0',
      price: '0',
      priceCurrency: 'USD',
    },
    operatingSystem: 'Web, Docker, macOS',
    publisher: { '@type': 'Organization', name: 'Genfeed', url: WEBSITE_URL },
    url: WEBSITE_URL,
  };
}
