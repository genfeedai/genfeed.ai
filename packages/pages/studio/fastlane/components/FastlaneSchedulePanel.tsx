'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  FastlaneAssetItem,
  FastlaneScheduleTarget,
  ICredential,
} from '@genfeedai/interfaces';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import DateTimePicker from '@ui/primitives/date-time-picker';
import { Textarea } from '@ui/primitives/textarea';
import type { ChangeEvent } from 'react';
import { useState } from 'react';
import type { ScheduleApprovedParams } from '../types';

const SHORT_FORM_PLATFORMS = ['tiktok', 'instagram', 'youtube'];

interface FastlaneSchedulePanelProps {
  assets: FastlaneAssetItem[];
  credentials: ICredential[];
  isScheduling: boolean;
  timezone: string;
  onSchedule: (params: ScheduleApprovedParams) => void;
}

interface CredentialTarget {
  credentialId: string;
  platform: string;
  isSelected: boolean;
  scheduledDate: string | undefined;
}

export default function FastlaneSchedulePanel({
  assets,
  credentials,
  isScheduling,
  timezone,
  onSchedule,
}: FastlaneSchedulePanelProps) {
  const approved = assets.filter(
    (a) => a.status === 'approved' && a.ingredientId,
  );

  const shortFormCreds = credentials.filter((c) =>
    SHORT_FORM_PLATFORMS.includes((c.platform as string).toLowerCase()),
  );

  // Caption edits keyed by ideaId
  const [captions, setCaptions] = useState<Record<string, string>>(() =>
    Object.fromEntries(approved.map((a) => [a.idea.id, a.idea.caption])),
  );

  // Credential targets: all selected by default, no scheduledDate = post now
  const [credTargets, setCredTargets] = useState<CredentialTarget[]>(() =>
    shortFormCreds.map((c) => ({
      credentialId: c.id,
      platform: (c.platform as string).toLowerCase(),
      isSelected: true,
      scheduledDate: undefined,
    })),
  );

  function updateCaption(ideaId: string, value: string) {
    setCaptions((prev) => ({ ...prev, [ideaId]: value }));
  }

  function toggleCredential(credentialId: string) {
    setCredTargets((prev) =>
      prev.map((t) =>
        t.credentialId === credentialId
          ? { ...t, isSelected: !t.isSelected }
          : t,
      ),
    );
  }

  function setScheduledDate(credentialId: string, date: Date | null) {
    setCredTargets((prev) =>
      prev.map((t) =>
        t.credentialId === credentialId
          ? { ...t, scheduledDate: date?.toISOString() ?? undefined }
          : t,
      ),
    );
  }

  function handleScheduleAll() {
    const selectedTargets: FastlaneScheduleTarget[] = credTargets
      .filter((t) => t.isSelected)
      .map((t) => ({
        credentialId: t.credentialId,
        platform: t.platform,
        scheduledDate: t.scheduledDate,
      }));

    if (selectedTargets.length === 0) return;

    onSchedule({
      assets: approved,
      targets: selectedTargets,
      captions,
      timezone,
    });
  }

  const selectedCredCount = credTargets.filter((t) => t.isSelected).length;

  if (approved.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <p className="text-sm text-muted-foreground">
          No approved assets to schedule.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">
      {/* Platform selection */}
      <div className="flex flex-col gap-3">
        <p className="gen-label">Publish to</p>
        {shortFormCreds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No short-form social accounts connected (TikTok, Instagram,
            YouTube).
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {credTargets.map((target) => {
              const cred = shortFormCreds.find(
                (c) => c.id === target.credentialId,
              );
              return (
                <div
                  key={target.credentialId}
                  className="gen-glass rounded-lg p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={target.isSelected ? 'default' : 'outline'}
                      >
                        {target.platform}
                      </Badge>
                      <span className="text-sm">
                        {cred?.externalHandle ?? target.credentialId}
                      </span>
                    </div>
                    <Button
                      variant={
                        target.isSelected
                          ? ButtonVariant.DEFAULT
                          : ButtonVariant.OUTLINE
                      }
                      size={ButtonSize.SM}
                      label={target.isSelected ? 'Selected' : 'Select'}
                      onClick={() => toggleCredential(target.credentialId)}
                    />
                  </div>
                  {target.isSelected && (
                    <DateTimePicker
                      label="Schedule date (leave empty to post now)"
                      value={target.scheduledDate}
                      onChange={(date) =>
                        setScheduledDate(target.credentialId, date)
                      }
                      minDate={new Date()}
                      timezone={timezone}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-asset captions */}
      <div className="flex flex-col gap-4">
        <p className="gen-label">Review captions</p>
        {approved.map((asset) => (
          <div
            key={asset.idea.id}
            className="gen-glass rounded-lg p-4 flex flex-col gap-3"
          >
            <div className="flex items-center gap-2">
              {(asset.thumbnailUrl ?? asset.ingredientUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.thumbnailUrl ?? asset.ingredientUrl}
                  alt={asset.idea.hook}
                  className="w-12 h-12 rounded-md object-cover shrink-0"
                />
              )}
              <div className="flex flex-col gap-1 min-w-0">
                <Badge variant="secondary">{asset.idea.format}</Badge>
                <p className="text-sm font-medium truncate">
                  {asset.idea.hook}
                </p>
              </div>
            </div>
            <label className="gen-label-sm text-muted-foreground">
              Caption
            </label>
            <Textarea
              value={captions[asset.idea.id] ?? asset.idea.caption}
              rows={3}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                updateCaption(asset.idea.id, e.target.value)
              }
            />
          </div>
        ))}
      </div>

      <Button
        variant={ButtonVariant.DEFAULT}
        label={`Schedule ${approved.length} post${approved.length !== 1 ? 's' : ''} to ${selectedCredCount} account${selectedCredCount !== 1 ? 's' : ''}`}
        isDisabled={selectedCredCount === 0}
        isLoading={isScheduling}
        onClick={handleScheduleAll}
      />
    </div>
  );
}
