'use client';

import { ComponentSize } from '@genfeedai/enums';
import type {
  TemplateMetadata,
  TemplatePerformance,
} from '@genfeedai/interfaces/content/template-ui.interface';
import Badge from '@ui/display/badge/Badge';
import { VStack } from '@ui/layout/stack';
import { Text } from '@ui/typography/text';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { DetailCard, MetadataRow } from './template-detail-helpers';

type Props = {
  metadata: TemplateMetadata;
  performance: TemplatePerformance;
  createdAt: Date;
  updatedAt: Date;
};

export default function TemplateSidebar({
  metadata,
  performance,
  createdAt,
  updatedAt,
}: Props) {
  return (
    <VStack gap={6}>
      {/* Metadata Card */}
      <DetailCard title="Metadata">
        <VStack gap={2} className="text-sm">
          {metadata?.version && (
            <MetadataRow label="Version">{metadata.version}</MetadataRow>
          )}
          {metadata?.author && (
            <MetadataRow label="Author">{metadata.author}</MetadataRow>
          )}
          {metadata?.estimatedTime && (
            <MetadataRow label="Estimated Time">
              {metadata.estimatedTime} minutes
            </MetadataRow>
          )}
          {metadata?.requiredFeatures &&
            metadata.requiredFeatures.length > 0 && (
              <div>
                <Text size="sm" weight="medium">
                  Required Features:{' '}
                </Text>
                <div className="flex flex-wrap gap-2 mt-1">
                  {metadata.requiredFeatures.map((feature) => (
                    <Badge
                      key={feature}
                      variant="ghost"
                      size={ComponentSize.SM}
                    >
                      {feature}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          {metadata?.compatiblePlatforms &&
            metadata.compatiblePlatforms.length > 0 && (
              <div>
                <Text size="sm" weight="medium">
                  Compatible Platforms:{' '}
                </Text>
                <div className="flex flex-wrap gap-2 mt-1">
                  {metadata.compatiblePlatforms.map((platform) => (
                    <Badge
                      key={platform}
                      variant="ghost"
                      size={ComponentSize.SM}
                    >
                      {platform}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
        </VStack>
      </DetailCard>

      {/* Performance Card */}
      <DetailCard title="Performance">
        <VStack gap={2} className="text-sm">
          {performance?.usageCount !== undefined && (
            <MetadataRow label="Usage Count">
              {performance.usageCount}
            </MetadataRow>
          )}
          {performance?.rating !== undefined && (
            <MetadataRow label="Rating">
              {performance.rating.toFixed(1)} / 5.0
            </MetadataRow>
          )}
          {performance?.reviews !== undefined && (
            <MetadataRow label="Reviews">{performance.reviews}</MetadataRow>
          )}
          {performance?.avgEngagement !== undefined && (
            <MetadataRow label="Avg Engagement">
              {performance.avgEngagement.toFixed(1)}
            </MetadataRow>
          )}
          {performance?.avgReach !== undefined && (
            <MetadataRow label="Avg Reach">
              {performance.avgReach.toFixed(1)}
            </MetadataRow>
          )}
          {performance?.successRate !== undefined && (
            <MetadataRow label="Success Rate">
              {(performance.successRate * 100).toFixed(1)}%
            </MetadataRow>
          )}
        </VStack>
      </DetailCard>

      {/* Timestamps */}
      <DetailCard title="Timestamps">
        <VStack gap={2} className="text-sm">
          {createdAt && (
            <MetadataRow label="Created">
              <ClientFormattedDate value={createdAt} />
            </MetadataRow>
          )}
          {updatedAt && (
            <MetadataRow label="Updated">
              <ClientFormattedDate value={updatedAt} />
            </MetadataRow>
          )}
        </VStack>
      </DetailCard>
    </VStack>
  );
}
