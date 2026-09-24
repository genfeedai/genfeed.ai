import { getProviderBrands } from '@genfeedai/helpers';
import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

const EYEBROW_CLASS =
  'text-xs font-bold uppercase tracking-widest text-surface/72';

/**
 * The providers wall.
 *
 * Every tile is derived from the model catalog at build time, so this section
 * is a view of what the app can actually run — not a second list that drifts
 * from it. Adding a provider anywhere in `MODEL_KEYS` adds it here.
 */
export default function HomeProviders(): React.ReactElement {
  const brands = getProviderBrands();
  const modelCount = brands.reduce(
    (total, brand) => total + brand.modelCount,
    0,
  );

  return (
    <section
      id="providers"
      className="gen-section-spacing border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <div className="flex flex-col mb-10 max-w-3xl gap-4" data-reveal="up">
          <Text className={EYEBROW_CLASS}>Providers</Text>
          <Heading
            id="home-providers-heading"
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Every model, one workspace.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            {modelCount} models from {brands.length} providers — Higgsfield,
            Replicate, fal.ai and the rest — behind a single brief. Bring your
            own keys or run on ours.
          </Text>
        </div>

        <ul
          aria-labelledby="home-providers-heading"
          className="grid grid-cols-2 gap-px bg-edge/5 sm:grid-cols-3 lg:grid-cols-4"
        >
          {brands.map((brand) => {
            const Icon = getModelBrandIcon(brand.iconKey);

            return (
              <li
                key={brand.slug}
                className="flex flex-col gap-3 bg-background p-6"
                data-reveal="up"
              >
                <div className="flex items-center gap-3">
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
                  <Heading
                    as="h3"
                    className="truncate text-base font-semibold text-surface"
                  >
                    {brand.label}
                  </Heading>
                </div>

                <Text className="text-sm text-surface/72">
                  {brand.modelCount}{' '}
                  {brand.modelCount === 1 ? 'model' : 'models'}
                </Text>

                {brand.categories.length > 0 && (
                  <Text className="text-xs uppercase tracking-widest text-surface/45">
                    {brand.categories.join(' · ')}
                  </Text>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
