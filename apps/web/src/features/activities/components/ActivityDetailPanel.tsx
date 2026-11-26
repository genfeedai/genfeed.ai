'use client';

import { ContextSidebarHeaderSlot } from '@contexts/ui/context-sidebar-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import { formatShortDate } from '@genfeedai/helpers/formatting/date/short-date.helper';
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
  getActivityResultType,
  getActivitySourceLabel,
  getActivityStatus,
  getActivityValueFields,
  getActivityVideoUrl,
  getPostGroupLink,
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
  /** Bookkeeping a post row leaves to its technical details. */
  isBookkeeping?: boolean;
}

const PAST_YEAR_TIMESTAMP = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

/** Always carries the clock time, and the year once it is not this year. */
function formatTimestamp(value: string | undefined | null): string | undefined {
  if (!value || !Number.isFinite(new Date(value).getTime())) return undefined;
  const isCurrentYear =
    new Date(value).getUTCFullYear() === new Date().getUTCFullYear();
  return `${
    isCurrentYear
      ? formatShortDate(value, { timeZone: 'UTC' })
      : PAST_YEAR_TIMESTAMP.format(new Date(value))
  } UTC`;
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
  // A post row reads its network link from the post it stands for; its own
  // value only carries the state change.
  const postLink = activity.postGroup
    ? getPostGroupLink(activity)
    : fields.post;
  const status = getActivityStatus(activity);
  const markReadLabel = activity.isRead
    ? translate('markUnread')
    : translate('markRead');
  // Only a finished generation has an asset to show; running and failed rows
  // have nothing yet (or nothing worth showing).
  const isCompleted = status === 'completed';
  const videoUrl = isCompleted ? getActivityVideoUrl(activity) : undefined;
  // A post row shows the post's own media whatever state the post is in.
  const hasPostMedia = Boolean(activity.postGroup);
  const previewUrl =
    (isCompleted || hasPostMedia) && !videoUrl
      ? getActivityMediaPreviewUrl(activity, {
          getPreviewUrl: getActivityIngredientPreviewUrl,
          resultType: getActivityResultType(activity),
        })
      : undefined;

  // The facts a person reads: names and plain words, never ids.
  const facts: DetailFact[] = [
    {
      label: translate('detailStatus'),
      value: <ActivityStatusCell status={status} />,
    },
    ...(activity.postGroup?.steps ?? []).map((step) => ({
      label: translate('detailPostStep', {
        from: humanizeActivityToken(step.from) ?? step.from,
        to: humanizeActivityToken(step.to) ?? step.to,
      }),
      value: formatTimestamp(step.at),
    })),
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
      isBookkeeping: true,
      label: translate('detailKey'),
      value: humanizeActivityToken(activity.key),
    },
    {
      isBookkeeping: true,
      label: translate('detailSource'),
      value:
        getActivitySourceLabel(activity.source) ??
        humanizeActivityToken(activity.source),
    },
    {
      isBookkeeping: true,
      label: translate('detailOrigin'),
      value: humanizeActivityToken(activity.origin),
    },
    {
      isBookkeeping: true,
      label: translate('detailEntity'),
      value: humanizeActivityToken(activity.entityModel),
    },
    {
      label: translate('detailCredits'),
      value: getActivityCreditsDelta(activity),
    },
    {
      isBookkeeping: true,
      label: translate('detailCreated'),
      value: formatTimestamp(activity.createdAt),
    },
    {
      isBookkeeping: true,
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

        <FactList
          facts={
            activity.postGroup
              ? facts.filter((fact) => !fact.isBookkeeping)
              : facts
          }
        />

        {openHref || postLink ? (
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
            {postLink ? (
              <Button
                asChild
                ariaLabel={translate('detailViewOnNetwork', {
                  platform: getPostsPlatformLabel(postLink.platform),
                })}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              >
                <a
                  href={postLink.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {getPlatformIcon(postLink.platform, 'size-4') ?? (
                    <ExternalLink className="size-4" />
                  )}
                  {translate('detailView')}
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        <Collapsible>
          <CollapsibleTrigger
            className="py-0 text-2xs uppercase tracking-label text-muted-foreground hover:no-underline"
            data-testid="activity-technical-toggle"
          >
            {translate('detailTechnical')}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 flex flex-col gap-4">
            <FactList facts={technicalFacts} />
            {fields.raw ? (
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-2xs uppercase tracking-label text-muted-foreground">
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
