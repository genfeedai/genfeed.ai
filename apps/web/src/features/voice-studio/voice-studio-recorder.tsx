'use client';

import {
  ButtonVariant,
  CardVariant,
  VoiceProvider,
} from '@genfeedai/contracts';
import { formatDuration } from '@genfeedai/helpers/video-duration.helper';
import { getJsonApiErrorMessage } from '@genfeedai/services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Progress } from '@ui/primitives/progress';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import { Circle, Mic, Play, Square } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { VoiceSampleError } from '@/features/voice-studio/hooks/use-voice-studio';
import type {
  VoiceStudioProvider,
  VoiceStudioRecorderProps,
} from '@/features/voice-studio/props/voice-studio.props';
import {
  VOICE_SAMPLE_DEFAULT_NAME,
  VOICE_SAMPLE_MAX_SECONDS,
  VOICE_SAMPLE_MIN_SECONDS,
  VOICE_SAMPLE_RECOMMENDED_SECONDS,
} from '@/features/voice-studio/voice-studio.constants';
import { useAudioRecording } from '@/hooks/media/use-audio-recording/use-audio-recording';

const PROVIDER_LABELS: Record<VoiceStudioProvider, string> = {
  [VoiceProvider.ELEVENLABS]: 'ElevenLabs',
  [VoiceProvider.HEYGEN]: 'HeyGen',
};

/**
 * Records a clean voice sample with the browser's voice processing off,
 * then clones it in the chosen account. A script keeps the read natural
 * and long enough.
 */
export default function VoiceStudioRecorder({
  connectedProviders,
  hasBrand,
  onCreate,
  phase,
  voicesHref,
}: VoiceStudioRecorderProps) {
  const translate = useTranslations('pages.library.voiceStudio');
  const {
    clearRecordedFile,
    error: recordingError,
    isRecording,
    isSupported,
    recordedFile,
    startRecording,
    stopRecording,
  } = useAudioRecording({ hasVoiceProcessing: false });
  const [provider, setProvider] = useState<VoiceStudioProvider>(
    connectedProviders[0] ?? VoiceProvider.HEYGEN,
  );
  const [name, setName] = useState(VOICE_SAMPLE_DEFAULT_NAME);
  const [isBrandDefault, setIsBrandDefault] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isRecording) return;
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (isRecording && elapsedSeconds >= VOICE_SAMPLE_MAX_SECONDS)
      stopRecording();
  }, [elapsedSeconds, isRecording, stopRecording]);

  useEffect(
    () => () => {
      playbackRef.current?.pause();
    },
    [],
  );

  const isBusy = phase !== null;
  const isTooShort = elapsedSeconds < VOICE_SAMPLE_MIN_SECONDS;

  const handlePlayback = () => {
    if (!recordedFile) return;
    playbackRef.current?.pause();
    const url = URL.createObjectURL(recordedFile);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    playbackRef.current = audio;
    void audio.play();
  };

  const handleRetake = () => {
    playbackRef.current?.pause();
    clearRecordedFile();
    setElapsedSeconds(0);
    setSubmitError(null);
  };

  const handleCreate = async () => {
    if (!recordedFile) return;
    setSubmitError(null);
    try {
      const voice = await onCreate({
        isBrandDefault: hasBrand && isBrandDefault,
        name: name.trim() || VOICE_SAMPLE_DEFAULT_NAME,
        provider,
        recording: recordedFile,
      });
      setCreatedName(voice.metadataLabel ?? name);
    } catch (error: unknown) {
      if (error instanceof VoiceSampleError) {
        setSubmitError(
          translate(`errors.${error.problem}`, {
            minimum: VOICE_SAMPLE_MIN_SECONDS,
          }),
        );
        return;
      }
      logger.error('Voice clone failed', error);
      setSubmitError(getJsonApiErrorMessage(error, translate('errors.clone')));
    }
  };

  if (createdName)
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">
          <AlertDescription>
            {translate(
              hasBrand && isBrandDefault ? 'done.brandDefault' : 'done.saved',
              { name: createdName, provider: PROVIDER_LABELS[provider] },
            )}
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button asChild withWrapper={false}>
            <Link href={voicesHref}>{translate('done.voices')}</Link>
          </Button>
          <Button
            label={translate('done.again')}
            onClick={() => {
              setCreatedName(null);
              handleRetake();
            }}
            variant={ButtonVariant.SECONDARY}
          />
        </div>
      </div>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex flex-col gap-4">
        {connectedProviders.length > 1 ? (
          <Field label={translate('provider.label')}>
            <RadioGroup
              className="flex flex-wrap gap-4"
              onValueChange={(value) =>
                setProvider(value as VoiceStudioProvider)
              }
              value={provider}
            >
              {connectedProviders.map((option) => (
                <Label
                  className="flex cursor-pointer items-center gap-2 font-normal text-sm"
                  htmlFor={`voice-studio-${option}`}
                  key={option}
                >
                  <RadioGroupItem
                    id={`voice-studio-${option}`}
                    value={option}
                  />
                  <span>{PROVIDER_LABELS[option]}</span>
                </Label>
              ))}
            </RadioGroup>
          </Field>
        ) : null}
        <p className="text-muted-foreground text-sm">
          {translate('provider.account', {
            provider: PROVIDER_LABELS[provider],
          })}
        </p>

        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>{translate('tips.room')}</li>
          <li>{translate('tips.mic')}</li>
          <li>{translate('tips.pace')}</li>
          <li>
            {translate('tips.length', {
              recommended: formatDuration(VOICE_SAMPLE_RECOMMENDED_SECONDS),
              maximum: formatDuration(VOICE_SAMPLE_MAX_SECONDS),
            })}
          </li>
        </ul>

        {recordingError ? (
          <Alert variant="destructive">
            <AlertDescription>{recordingError}</AlertDescription>
          </Alert>
        ) : null}
        {!isSupported ? (
          <Alert variant="destructive">
            <AlertDescription>
              {translate('errors.unsupported')}
            </AlertDescription>
          </Alert>
        ) : null}
        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        {isRecording ? (
          <div className="flex items-center gap-2 font-medium text-sm tabular-nums">
            <Circle className="size-3.5 fill-destructive text-destructive" />
            {translate('record.elapsed', {
              elapsed: formatDuration(elapsedSeconds),
              recommended: formatDuration(VOICE_SAMPLE_RECOMMENDED_SECONDS),
            })}
          </div>
        ) : null}
        {isRecording && isTooShort ? (
          <p className="text-muted-foreground text-sm">
            {translate('record.keepGoing', {
              minimum: VOICE_SAMPLE_MIN_SECONDS,
            })}
          </p>
        ) : null}

        {recordedFile && !isRecording ? (
          <div className="flex flex-col gap-3">
            <Field label={translate('name.label')}>
              <Input
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </Field>
            {hasBrand ? (
              <Checkbox
                isChecked={isBrandDefault}
                label={translate('brandDefault')}
                onCheckedChange={(checked) =>
                  setIsBrandDefault(checked === true)
                }
              />
            ) : null}
          </div>
        ) : null}

        {isBusy ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">{translate(`phase.${phase}`)}</p>
            <Progress isIndeterminate />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {isRecording ? (
              <Button
                icon={<Square />}
                label={translate('record.stop')}
                onClick={stopRecording}
                variant={ButtonVariant.DESTRUCTIVE}
              />
            ) : recordedFile ? (
              <>
                <Button
                  icon={<Mic />}
                  label={translate('create')}
                  onClick={() => {
                    void handleCreate();
                  }}
                />
                <Button
                  icon={<Play />}
                  label={translate('record.listen')}
                  onClick={handlePlayback}
                  variant={ButtonVariant.SECONDARY}
                />
                <Button
                  label={translate('record.retake')}
                  onClick={handleRetake}
                  variant={ButtonVariant.GHOST}
                />
              </>
            ) : (
              <Button
                icon={<Circle />}
                isDisabled={!isSupported}
                label={translate('record.start')}
                onClick={() => {
                  setSubmitError(null);
                  void startRecording();
                }}
              />
            )}
          </div>
        )}
      </div>

      <section aria-label={translate('scriptLabel')}>
        <Card
          bodyClassName="max-h-96 overflow-y-auto"
          variant={CardVariant.INSET}
        >
          <p className="whitespace-pre-line text-lg leading-relaxed">
            {translate('script')}
          </p>
        </Card>
      </section>
    </div>
  );
}
