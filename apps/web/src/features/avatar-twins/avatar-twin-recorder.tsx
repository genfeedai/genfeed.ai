'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import { formatDuration } from '@genfeedai/helpers/video-duration.helper';
import Card from '@ui/card/Card';
import CameraPreview from '@ui/display/camera-preview/CameraPreview';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { Camera, Circle, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  AVATAR_TWIN_MAX_BYTES,
  AVATAR_TWIN_MAX_SECONDS,
  AVATAR_TWIN_MIN_SECONDS,
  AVATAR_TWIN_RECOMMENDED_SECONDS,
} from '@/features/avatar-twins/avatar-twin.constants';
import type { AvatarTwinRecorderProps } from '@/features/avatar-twins/props/avatar-twin.props';
import { useVideoRecording } from '@/hooks/media/use-video-recording/use-video-recording';

/**
 * Records the training take: live camera preview beside a script to read,
 * a timer against the recommended length, retake, and submit.
 */
export default function AvatarTwinRecorder({
  onCancel,
  onSubmit,
  submitPhase,
  uploadProgress,
}: AvatarTwinRecorderProps) {
  const translate = useTranslations('pages.library.avatarTwin');
  const {
    discard,
    elapsedSeconds,
    error,
    isRecording,
    isSupported,
    openCamera,
    recording,
    start,
    stop,
    stream,
  } = useVideoRecording({ maxSeconds: AVATAR_TWIN_MAX_SECONDS });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isSubmitting = submitPhase !== null;
  const isTooShort = elapsedSeconds < AVATAR_TWIN_MIN_SECONDS;
  const isTooLarge = !!recording && recording.size > AVATAR_TWIN_MAX_BYTES;
  const hasReachedMax = elapsedSeconds >= AVATAR_TWIN_MAX_SECONDS;
  const recordingError = isSupported ? error : 'unsupported';

  const handleSubmit = async () => {
    if (!recording) return;
    setSubmitError(null);
    try {
      await onSubmit(recording);
    } catch (cause: unknown) {
      setSubmitError(
        cause instanceof Error && cause.message
          ? cause.message
          : translate('errors.submit'),
      );
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-3">
        <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted">
          {stream ? (
            <CameraPreview
              label={translate('record.previewLabel')}
              stream={stream}
            />
          ) : (
            <div className="flex size-full items-center justify-center">
              <Button
                icon={<Camera />}
                isDisabled={!isSupported}
                label={translate('record.enableCamera')}
                onClick={() => {
                  void openCamera();
                }}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          )}
          {isRecording ? (
            <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 font-medium text-sm tabular-nums">
              <Circle className="size-3 fill-destructive text-destructive" />
              {translate('record.elapsed', {
                elapsed: formatDuration(elapsedSeconds),
                recommended: formatDuration(AVATAR_TWIN_RECOMMENDED_SECONDS),
              })}
            </div>
          ) : null}
        </div>

        {recordingError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {translate(`errors.${recordingError}`)}
            </AlertDescription>
          </Alert>
        ) : null}
        {isTooLarge ? (
          <Alert variant="destructive">
            <AlertDescription>{translate('errors.tooLarge')}</AlertDescription>
          </Alert>
        ) : null}
        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}
        {recording && hasReachedMax ? (
          <Alert variant="info">
            <AlertDescription>
              {translate('record.maxReached')}
            </AlertDescription>
          </Alert>
        ) : null}
        {isRecording && isTooShort ? (
          <p className="text-muted-foreground text-sm">
            {translate('record.tooShort', { minimum: AVATAR_TWIN_MIN_SECONDS })}
          </p>
        ) : null}
        {recording && isTooShort ? (
          <Alert variant="warning">
            <AlertDescription>
              {translate('record.takeTooShort', {
                minimum: AVATAR_TWIN_MIN_SECONDS,
              })}
            </AlertDescription>
          </Alert>
        ) : null}

        {isSubmitting ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">{translate(`submit.${submitPhase}`)}</p>
            <Progress
              isIndeterminate={submitPhase === 'starting'}
              value={uploadProgress}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {isRecording ? (
              <Button
                icon={<Square />}
                label={translate('record.stop')}
                onClick={stop}
                variant={ButtonVariant.DESTRUCTIVE}
              />
            ) : recording ? (
              <>
                <Button
                  isDisabled={isTooLarge || isTooShort}
                  label={translate('record.use')}
                  onClick={() => {
                    void handleSubmit();
                  }}
                />
                <Button
                  label={translate('record.retake')}
                  onClick={discard}
                  variant={ButtonVariant.SECONDARY}
                />
              </>
            ) : (
              <Button
                icon={<Circle />}
                isDisabled={!isSupported}
                label={translate('record.start')}
                onClick={() => {
                  void start();
                }}
              />
            )}
            {onCancel && !isRecording ? (
              <Button
                label={translate('record.cancel')}
                onClick={onCancel}
                variant={ButtonVariant.GHOST}
              />
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm">{translate('record.intro')}</p>
        <p className="text-muted-foreground text-sm">
          {translate('record.onlyYou')}
        </p>
        <section aria-label={translate('record.scriptLabel')}>
          <Card
            bodyClassName="max-h-80 overflow-y-auto"
            variant={CardVariant.INSET}
          >
            <p className="text-lg leading-relaxed">
              {translate('record.script')}
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
