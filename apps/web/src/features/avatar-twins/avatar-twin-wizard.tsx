'use client';

import { AvatarTwinStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Container from '@ui/layout/container/Container';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Skeleton } from '@ui/primitives/skeleton';
import { Stepper } from '@ui/primitives/stepper';
import { UserRound } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AVATAR_TWIN_DEFAULT_NAME } from '@/features/avatar-twins/avatar-twin.constants';
import AvatarTwinConnectStep from '@/features/avatar-twins/avatar-twin-connect-step';
import AvatarTwinProgress from '@/features/avatar-twins/avatar-twin-progress';
import AvatarTwinRecorder from '@/features/avatar-twins/avatar-twin-recorder';
import { useAvatarTwinEnrollment } from '@/features/avatar-twins/hooks/use-avatar-twin-enrollment';

const STEP = { CONNECT: 0, CONSENT: 2, DONE: 3, RECORD: 1 } as const;

/**
 * Record yourself, train a twin in your own HeyGen account, give consent on
 * HeyGen's page, done. The step follows the stored enrollment, so a reload
 * or a closed tab resumes where the person left off.
 */
export default function AvatarTwinWizard() {
  const translate = useTranslations('pages.library.avatarTwin');
  const pathname = usePathname();
  const { href, orgHref } = useOrgUrl();
  const {
    connectionState,
    isLoading,
    isRetaking,
    loadError,
    openConsent,
    recheckConnection,
    remove,
    setIsRetaking,
    submit,
    submitPhase,
    twin,
    uploadProgress,
  } = useAvatarTwinEnrollment();

  const isConnected = connectionState === 'connected';
  const isRecording = !twin || isRetaking;
  const currentStep = !isConnected
    ? STEP.CONNECT
    : isRecording || twin.status === AvatarTwinStatus.FAILED
      ? STEP.RECORD
      : twin.status === AvatarTwinStatus.READY
        ? STEP.DONE
        : STEP.CONSENT;

  const steps = [
    { id: 'connect', label: translate('steps.connect') },
    { id: 'record', label: translate('steps.record') },
    { id: 'consent', label: translate('steps.consent') },
    { id: 'done', label: translate('steps.done') },
  ];

  const renderStep = () => {
    if (isLoading) return <Skeleton className="h-64 w-full" />;
    if (loadError)
      return (
        <Alert variant="destructive">
          <AlertDescription>{translate('loadError')}</AlertDescription>
        </Alert>
      );
    if (!isConnected)
      return (
        <AvatarTwinConnectStep
          connectHref={orgHref(APP_ROUTES.SETTINGS.INTEGRATIONS)}
          isInvalid={connectionState === 'invalid'}
          onRecheck={() => {
            void recheckConnection();
          }}
        />
      );
    if (isRecording)
      return (
        <AvatarTwinRecorder
          onCancel={twin ? () => setIsRetaking(false) : undefined}
          onSubmit={(recording) => submit(recording, AVATAR_TWIN_DEFAULT_NAME)}
          submitPhase={submitPhase}
          uploadProgress={uploadProgress}
        />
      );
    return (
      <AvatarTwinProgress
        libraryHref={href(APP_ROUTES.LIBRARY.AVATARS)}
        onOpenConsent={() => openConsent(twin.id, pathname)}
        onRemove={() => remove(twin.id)}
        onRetake={() => setIsRetaking(true)}
        twin={twin}
      />
    );
  };

  return (
    <Container icon={UserRound} label={translate('title')}>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <p className="text-muted-foreground text-sm">{translate('subtitle')}</p>
        <Stepper currentStep={currentStep} steps={steps} />
        {renderStep()}
      </div>
    </Container>
  );
}
