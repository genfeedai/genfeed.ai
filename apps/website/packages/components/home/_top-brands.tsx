import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { CardVariant } from '@genfeedai/enums';
import type { Brand } from '@models/organization/brand.model';
import { PublicService } from '@services/external/public.service';
import Card from '@ui/card/Card';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Image from 'next/image';
import Link from 'next/link';
import { HiArrowRight, HiCheckBadge, HiStar } from 'react-icons/hi2';
export default async function TopBrands() {
  let topBrands: Brand[] = [];

  try {
    topBrands = await PublicService.getInstance().findPublicBrands({
      isHighlighted: true,
      limit: ITEMS_PER_PAGE,
    });
  } catch {
    topBrands = [];
  }

  if (topBrands.length === 0) {
    return null; // Hide section when loading or empty
  }

  return (
    <div className="py-20 bg-background/50">
      <div className="container mx-auto px-4 md:px-8">
        <VStack className="text-center mb-12">
          <HStack className="inline-flex items-center gap-2 mb-4">
            <HiStar className="h-6 w-6 text-primary" />
            <Text className="text-sm font-semibold uppercase tracking-wide text-primary">
              Success Stories
            </Text>
          </HStack>
          <Heading size="2xl" className="text-3xl sm:text-4xl font-bold mb-4">
            See What&apos;s Possible
          </Heading>
          <Text as="p" className="text-lg text-foreground/70 max-w-2xl mx-auto">
            Real creators using Genfeed AI to scale their content.
          </Text>
        </VStack>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {topBrands.map((brand) => (
            <Link key={brand.slug} href={`/u/${brand.slug}`} className="group">
              <Card
                variant={CardVariant.DEFAULT}
                className="hover:border-primary/50 transition-all h-full"
                actions={
                  <div className="inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 h-8 px-3 text-sm gap-2 group-hover:gap-3 transition-all">
                    View Profile
                    <HiArrowRight />
                  </div>
                }
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="avatar">
                    <div className="w-12 h-12 bg-muted relative overflow-hidden">
                      {brand.logoUrl ? (
                        <Image
                          src={brand.logoUrl}
                          alt={brand.label}
                          fill
                          sizes="48px"
                          className="object-contain object-center"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">
                          {brand.label.charAt(0)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <HStack className="items-center gap-2">
                      <Heading size="lg" className="font-bold">
                        {brand.label}
                      </Heading>
                      <HiCheckBadge className="text-primary text-lg" />
                    </HStack>
                    <Text as="p" className="text-sm text-foreground/50">
                      @{brand.slug}
                    </Text>
                  </div>
                </div>

                {brand.description && (
                  <Text as="p" className="text-foreground/70 text-sm mb-4">
                    {brand.description}
                  </Text>
                )}
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
