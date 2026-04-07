'use client';

import type { IExtractedBrandData } from '@genfeedai/interfaces';
import Badge from '@ui/display/badge/Badge';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import type { ReactNode } from 'react';
import { HiOutlineGlobeAlt, HiOutlineSparkles } from 'react-icons/hi2';

export interface OnboardingStepReviewProps {
  data: IExtractedBrandData | null;
}

/** Bordered section card used within the review step */
function ReviewSection({
  icon: Icon,
  title,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="p-4 border border-white/[0.08]">
      <HStack gap={2} className="mb-3">
        {Icon && <Icon className="w-5 h-5 text-primary" />}
        <Text weight="medium">{title}</Text>
      </HStack>
      {children}
    </div>
  );
}

/** Label + value pair */
function DataField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Text as="p" size="sm" color="muted">
        {label}
      </Text>
      {children}
    </div>
  );
}

export default function OnboardingStepReview({
  data,
}: OnboardingStepReviewProps) {
  if (!data) {
    return (
      <div className="py-8 text-center">
        <Text color="muted">No data to display</Text>
      </div>
    );
  }

  return (
    <div className="py-4">
      <VStack gap={2} className="text-center mb-6">
        <Heading size="2xl">Here&apos;s what we found</Heading>
        <Text color="muted">Review your brand information below</Text>
      </VStack>

      <VStack gap={6}>
        {/* Company Info */}
        <ReviewSection title="Company Information">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.companyName && (
              <DataField label="Company Name">
                <Text weight="medium">{data.companyName}</Text>
              </DataField>
            )}
            {data.tagline && (
              <DataField label="Tagline">
                <Text weight="medium">{data.tagline}</Text>
              </DataField>
            )}
            {data.description && (
              <DataField label="Description" className="md:col-span-2">
                <Text as="p" size="sm">
                  {data.description}
                </Text>
              </DataField>
            )}
          </div>
        </ReviewSection>

        {/* Brand Colors */}
        {(data.primaryColor || data.secondaryColor) && (
          <ReviewSection title="Brand Colors">
            <HStack gap={4}>
              {data.primaryColor && (
                <HStack gap={2}>
                  <div
                    className="w-8 h-8 border border-white/[0.08]"
                    style={{ backgroundColor: data.primaryColor }}
                  />
                  <div>
                    <Text as="p" size="xs" color="muted">
                      Primary
                    </Text>
                    <Text as="p" size="sm" className="font-mono">
                      {data.primaryColor}
                    </Text>
                  </div>
                </HStack>
              )}
              {data.secondaryColor && (
                <HStack gap={2}>
                  <div
                    className="w-8 h-8 border border-white/[0.08]"
                    style={{ backgroundColor: data.secondaryColor }}
                  />
                  <div>
                    <Text as="p" size="xs" color="muted">
                      Secondary
                    </Text>
                    <Text as="p" size="sm" className="font-mono">
                      {data.secondaryColor}
                    </Text>
                  </div>
                </HStack>
              )}
            </HStack>
          </ReviewSection>
        )}

        {/* Brand Voice */}
        {data.brandVoice && (
          <ReviewSection
            icon={HiOutlineSparkles}
            title="Brand Voice (AI Generated)"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.brandVoice.tone && (
                <DataField label="Tone">
                  <Text weight="medium">{data.brandVoice.tone}</Text>
                </DataField>
              )}
              {data.brandVoice.voice && (
                <DataField label="Voice">
                  <Text weight="medium">{data.brandVoice.voice}</Text>
                </DataField>
              )}
              {data.brandVoice.audience && (
                <DataField label="Audience">
                  <Text weight="medium">{data.brandVoice.audience}</Text>
                </DataField>
              )}
            </div>

            {data.brandVoice.values && data.brandVoice.values.length > 0 && (
              <div className="mt-4">
                <Text as="p" size="sm" color="muted" className="mb-2">
                  Brand Values
                </Text>
                <div className="flex flex-wrap gap-2">
                  {data.brandVoice.values.map((value, index) => (
                    <Badge key={index} variant="primary">
                      {value}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {data.brandVoice.hashtags &&
              data.brandVoice.hashtags.length > 0 && (
                <div className="mt-4">
                  <Text as="p" size="sm" color="muted" className="mb-2">
                    Suggested Hashtags
                  </Text>
                  <div className="flex flex-wrap gap-2">
                    {data.brandVoice.hashtags.map((hashtag, index) => (
                      <Badge key={index} variant="ghost">
                        #{hashtag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
          </ReviewSection>
        )}

        {/* Social Links */}
        {data.socialLinks &&
          Object.keys(data.socialLinks).some(
            (k) => data.socialLinks?.[k as keyof typeof data.socialLinks],
          ) && (
            <ReviewSection icon={HiOutlineGlobeAlt} title="Social Links Found">
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.socialLinks).map(([platform, url]) => {
                  if (!url) {
                    return null;
                  }
                  return (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-sm rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors capitalize"
                    >
                      {platform}
                    </a>
                  );
                })}
              </div>
            </ReviewSection>
          )}

        <Text as="p" size="sm" color="muted" className="text-center">
          You can edit all of this later in your brand settings.
        </Text>
      </VStack>
    </div>
  );
}
