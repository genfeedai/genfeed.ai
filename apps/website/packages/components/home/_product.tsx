import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
import Image from 'next/image';

const PRODUCT_OUTPUTS = HOME_OUTPUT_CAROUSEL_ASSETS.slice(0, 5);

export default function HomeProduct(): React.ReactElement {
  return (
    <section className="gen-section-spacing-lg border-b border-edge/5">
      <div className="container mx-auto px-6">
        <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,0.72fr)_minmax(520px,1.28fr)] lg:gap-24 xl:gap-32">
          <div className="max-w-xl">
            <Text className="text-xs font-bold uppercase tracking-[0.16em] text-surface/72">
              The product
            </Text>
            <Heading
              as="h2"
              className="mt-5 text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-surface sm:text-6xl"
            >
              One brief. <span className="block">Every channel.</span>
            </Heading>
            <Text className="mt-7 max-w-lg text-base leading-7 text-surface/72 md:text-lg">
              Give Genfeed the idea, audience, and goal. It creates the
              coordinated campaign, keeps every output on-brand, and prepares
              each format for review.
            </Text>
          </div>

          <div
            className="rounded-xl bg-card p-3 shadow-border-strong sm:p-4"
            data-testid="home-product-workspace"
          >
            <div className="rounded-lg border border-edge/5 bg-background p-4 sm:p-5">
              <div className="flex items-center justify-between border-b border-edge/5 pb-4">
                <div>
                  <Text className="text-[11px] font-bold uppercase tracking-[0.14em] text-surface/55">
                    New campaign
                  </Text>
                  <Text className="mt-1 text-sm text-surface">
                    Hydrate. Brighten. Repeat.
                  </Text>
                </div>
                <span className="rounded-md border border-edge/5 px-3 py-1.5 text-[11px] font-semibold text-surface/72">
                  5 outputs ready
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
                {PRODUCT_OUTPUTS.map((item, index) => (
                  <figure
                    key={item.alt}
                    className={`relative overflow-hidden rounded-md bg-card ${
                      index === 0
                        ? 'col-span-2 aspect-[16/8] sm:col-span-3 sm:row-span-2 sm:aspect-auto'
                        : 'col-span-1 aspect-[4/5]'
                    }`}
                  >
                    <Image
                      alt={item.alt}
                      className="object-cover"
                      fill
                      sizes={
                        index === 0
                          ? '(max-width: 640px) 100vw, 40vw'
                          : '(max-width: 640px) 50vw, 160px'
                      }
                      src={item.src}
                    />
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
