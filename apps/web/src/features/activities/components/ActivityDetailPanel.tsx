'use client';

import { ContextSidebarHeaderSlot } from '@contexts/ui/context-sidebar-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import { getPostsPlatformLabel } from '@helpers/content/posts.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { ClipboardService } from '@services/core/clipboard.service';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionRow,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { Pre } from '@ui/primitives/pre';
import { Check, Circle, Copy, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import {
  getActivityCreditsDelta,
  getActivityIngredientPreviewUrl,
  getActivityMediaPreviewUrl,
  getActivitySourceLabel,
  getActivityStatus,
  getActivityValueFields,
  getActivityVideoUrl,
  humanizeActivityToken,
} from '@/features/activities/activities-list.utils';
import ActivityPostPreviewCard from '@/features/activities/components/ActivityPostPreviewCard';
import ActivityStatusCell from '@/features/activities/components/ActivityStatusCell';

interface ActivityDetailPanelProps {
  activity: IActivity;
  /** Where the activity's subject lives; omitted when the viewer cannot open it. */
  openHref?: string;
  /** Where the post's remix opens; omitted when there is nothing to remix. */
  remixHref?: string;
  onToggleRead: (id: string) => void;
}

interface DetailFact {
  label: string;
  value: ReactNode;
  isMono?: boolean;
}

function formatTimestamp(value: string | undefined | null): string | undefined {
  if (!value || !Number.isFinite(new Date(value).getTime())) return undefined;
  return `${new Date(value).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;
}

function FactList({ facts }: { facts: DetailFact[] }) {
  return (
    <DefinitionList variant="properties">
      {facts
        .filter((fact) => fact.value)
        .map((fact) => (
          <DefinitionRow key={fact.label}>
            <DefinitionTerm variant="muted">{fact.label}</DefinitionTerm>
            <DefinitionDetail
              className={
                fact.isMono ? 'break-all font-mono text-xs' : undefined
              }
            >
              {fact.value}
            </DefinitionDetail>
          </DefinitionRow>
        ))}
    </DefinitionList>
  );
}

/**
 * The activity's detail inside the right context sidebar: who and what it
 * belongs to, how it ended, and the stored value. The shell rail owns the
 * title; read/unread sits beside its close control. In the admin it never
 * links into the user's own account, which an operator cannot open.
 */
export default function ActivityDetailPanel({
  activity,
  openHref,
  remixHref,
  onToggleRead,
}: ActivityDetailPanelProps) {
  const translate = useTranslations('pages.activities');
  const [failedPreviewSrc, setFailedPreviewSrc] = useState<string | null>(null);

  const fields = getActivityValueFields(activity);
  const status = getActivityStatus(activity);
  const markReadLabel = activity.isRead
    ? translate('markUnread')
    : translate('markRead');
  // Only a finished generation has an asset to show; running and failed rows
  // have nothing yet (or nothing worth showing).
  const isCompleted = status === 'completed';
  const videoUrl = isCompleted ? getActivityVideoUrl(activity) : undefined;
  const previewUrl =
    isCompleted && !videoUrl
      ? getActivityMediaPreviewUrl(activity, {
          getPreviewUrl: getActivityIngredientPreviewUrl,
        })
      : undefined;

  // The facts a person reads: names and plain words, never ids.
  const facts: DetailFact[] = [
    {
      label: translate('detailStatus'),
      value: <ActivityStatusCell status={status} />,
    },
    {
      label: translate('detailUser'),
      value: activity.userLabel ?? activity.user?.email,
    },
    {
      label: translate('detailOrganization'),
      value: activity.organizationLabel,
    },
    { label: translate('detailBrand'), value: activity.brandLabel },
    {
      label: translate('detailKey'),
      value: humanizeActivityToken(activity.key),
    },
    {
      label: translate('detailSource'),
      value:
        getActivitySourceLabel(activity.source) ??
        humanizeActivityToken(activity.source),
    },
    {
      label: translate('detailOrigin'),
      value: humanizeActivityToken(activity.origin),
    },
    {
      label: translate('detailEntity'),
      value: humanizeActivityToken(activity.entityModel),
    },
    {
      label: translate('detailCredits'),
      value: getActivityCreditsDelta(activity),
    },
    {
      label: translate('detailCreated'),
      value: formatTimestamp(activity.createdAt),
    },
    {
      label: translate('detailUpdated'),
      value: formatTimestamp(activity.updatedAt),
    },
    {
      label: translate('detailStarted'),
      value: formatTimestamp(fields?.startedAt),
    },
    {
      label: translate('detailFinished'),
      value: formatTimestamp(fields?.completedAt),
    },
  ];

  // The ids behind those names, for support and debugging.
  const technicalFacts: DetailFact[] = [
    { isMono: true, label: translate('detailUserId'), value: activity.userId },
    {
      isMono: true,
      label: translate('detailOrganizationId'),
      value: activity.organizationId,
    },
    {
      isMono: true,
      label: translate('detailBrandId'),
      value: activity.brandId,
    },
    {
      isMono: true,
      label: translate('detailActor'),
      value: activity.actorUserId,
    },
    {
      isMono: true,
      label: translate('detailEntityId'),
      value: activity.entityId,
    },
    {
      isMono: true,
      label: translate('detailResult'),
      value: fields?.resultId
        ? `${fields.resultType ?? 'result'} ${fields.resultId}`
        : undefined,
    },
    {
      isMono: true,
      label: translate('detailKeyRaw'),
      value: activity.key,
    },
  ];

  return (
    <div className="flex flex-col" data-testid="activity-detail-panel">
      <ContextSidebarHeaderSlot>
        <Button
          ariaLabel={markReadLabel}
          data-testid="activity-toggle-read"
          icon={
            activity.isRead ? (
              <Circle className="size-4" />
            ) : (
              <Check className="size-4" />
            )
          }
          onClick={() => onToggleRead(activity.id)}
          size={ButtonSize.ICON}
          tooltip={markReadLabel}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </ContextSidebarHeaderSlot>

      <div className="flex flex-col gap-5 p-4">
        {videoUrl ? (
          <VideoPlayer
            ariaLabel={activity.label || translate('detailPreviewAlt')}
            className="aspect-video w-full overflow-hidden bg-card"
            mediaClassName="object-contain"
            src={videoUrl}
          />
        ) : previewUrl && failedPreviewSrc !== previewUrl ? (
          <div className="relative aspect-video w-full overflow-hidden bg-card">
            <Image
              alt={activity.label || translate('detailPreviewAlt')}
              className="object-contain"
              fill
              onError={() => setFailedPreviewSrc(previewUrl)}
              sizes="(min-width: 640px) 32rem, 100vw"
              src={previewUrl}
              unoptimized
            />
          </div>
        ) : null}

        {activity.preview ? (
          <ActivityPostPreviewCard
            preview={activity.preview}
            remixHref={remixHref}
          />
        ) : null}

        {fields.error ? (
          <Alert variant="destructive">{fields.error}</Alert>
        ) : null}

        <FactList facts={facts} />

        {openHref || fields.post ? (
          <div className="flex flex-wrap gap-2">
            {openHref ? (
              <Button
                asChild
                icon={<ExternalLink className="size-3.5" />}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                <Link href={openHref}>{translate('detailOpen')}</Link>
              </Button>
            ) : null}
            {fields.post ? (
              <Button
                asChild
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                <a
                  href={fields.post.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {getPlatformIcon(fields.post.platform, 'size-4') ?? (
                    <ExternalLink className="size-4" />
                  )}
                  {translate('detailViewOnNetwork', {
                    platform: getPostsPlatformLabel(fields.post.platform),
                  })}
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        <Collapsible>
          <CollapsibleTrigger
            className="py-0 text-2xs uppercase tracking-wider text-muted-foreground hover:no-underline"
            data-testid="activity-technical-toggle"
          >
            {translate('detailTechnical')}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 flex flex-col gap-4">
            <FactList facts={technicalFacts} />
            {fields.raw ? (
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-2xs uppercase tracking-wider text-muted-foreground">
                    {translate('detailValue')}
                  </h3>
                  <Button
                    icon={<Copy className="size-3.5" />}
                    onClick={() =>
                      void ClipboardService.getInstance().copyToClipboard(
                        fields.raw,
                      )
                    }
                    size={ButtonSize.SM}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                  >
                    {translate('copyValue')}
                  </Button>
                </div>
                <Pre className="max-h-72 overflow-y-auto" variant="debug">
                  {fields.raw}
                </Pre>
              </section>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
