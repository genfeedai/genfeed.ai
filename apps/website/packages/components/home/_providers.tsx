import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { getProviderBrands } from '@genfeedai/helpers';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';

const EYEBROW_CLASS =
  'text-xs font-bold uppercase tracking-widest text-surface/72';

const FEATURED_PROVIDER_COUNT = 5;

/**
 * The homepage teaser for the model catalog.
 *
 * The full, grouped list lives at `/models`. This section only states the
 * value and names the providers with the most models, derived from the same
 * catalog (`MODEL_KEYS`) so counts and names can never drift from it.
 */
export default function HomeProviders(): React.ReactElement {
  const brands = getProviderBrands();
  const modelCount = brands.reduce(
    (total, brand) => total + brand.modelCount,
    0,
  );
  const featuredBrands = brands.slice(0, FEATURED_PROVIDER_COUNT);

  return (
    <section
      id="providers"
      className="gen-section-spacing border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <div
          className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between"
          data-reveal="up"
        >
          <div className="flex max-w-3xl flex-col gap-4">
            <Text className={EYEBROW_CLASS}>Models</Text>
            <Heading
              id="home-providers-heading"
              as="h2"
              className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
            >
              Your models, one workspace.
            </Heading>
            <Text className="max-w-2xl text-base leading-7 gen-text-muted">
              {modelCount} models from {brands.length} providers behind a single
              brief. Bring your own keys or run on ours.
            </Text>
          </div>

          <ButtonTracked
            asChild
            size={ButtonSize.PUBLIC}
            trackingData={{ action: 'see_all_models' }}
            trackingName="home_providers_click"
            variant={ButtonVariant.SECONDARY}
          >
            <Link href="/models">See all models</Link>
          </ButtonTracked>
        </div>

        <ul
          aria-labelledby="home-providers-heading"
          className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-4 border-t border-edge/5 pt-8"
        >
          {featuredBrands.map((brand) => {
            const Icon = getModelBrandIcon(brand.iconKey);

            return (
              <li
                key={brand.slug}
                className="flex items-center gap-3"
                data-reveal="up"
              >
                {Icon ? (
                  <Icon aria-hidden className="size-6 shrink-0" />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center text-sm font-semibold"
                  >
                    {brand.label.charAt(0)}
                  </span>
                )}
                <Text className="text-base font-semibold text-surface">
                  {brand.label}
                </Text>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
