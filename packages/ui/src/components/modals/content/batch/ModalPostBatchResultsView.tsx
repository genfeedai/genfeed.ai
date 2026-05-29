'use client';

import { AlertCategory, ButtonVariant, PostStatus } from '@genfeedai/enums';
import { getPublisherPostsHref } from '@genfeedai/helpers/content/posts.helper';
import type { PlatformSubmissionStatus } from '@genfeedai/interfaces/modals/platform-submission-status.interface';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { PLATFORM_ICONS } from './batch-post.utils';

type ModalPostBatchResultsViewProps = {
  platformStatuses: PlatformSubmissionStatus[];
  onClose: () => void;
};

export default function ModalPostBatchResultsView({
  platformStatuses,
  onClose,
}: ModalPostBatchResultsViewProps) {
  const { push } = useRouter();

  return (
    <div className="h-full flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Submission Status</h2>

          <p className="text-foreground/70">
            {platformStatuses.filter((r) => r.status === 'completed').length} of{' '}
            {platformStatuses.length} platform
            {platformStatuses.length !== 1 ? 's' : ''} scheduled
            {platformStatuses.some(
              (r) => r.status === 'pending' || r.status === 'submitting',
            )
              ? ' (in progress…)'
              : ' successfully'}
          </p>
        </div>

        {/* Platform statuses */}
        <div className="space-y-2">
          {platformStatuses.map((status) => {
            const PlatformIcon =
              PLATFORM_ICONS[status.platform as keyof typeof PLATFORM_ICONS];

            const getStatusColor = () => {
              switch (status.status) {
                case 'completed':
                  return 'bg-success/10 border-success/20';
                case 'failed':
                  return 'bg-error/10 border-error/20';
                case 'submitting':
                  return 'bg-info/10 border-info/20';
                default:
                  return 'bg-background/50 border-white/[0.08]';
              }
            };

            const getIconColor = () => {
              switch (status.status) {
                case 'completed':
                  return 'text-success';
                case 'failed':
                  return 'text-error';
                case 'submitting':
                  return 'text-info';
                default:
                  return 'text-foreground/40';
              }
            };

            const getStatusBadge = () => {
              switch (status.status) {
                case 'completed':
                  return <Badge status="success">Completed</Badge>;
                case 'failed':
                  return <Badge status="error">Failed</Badge>;
                case 'submitting':
                  return <Badge status="info">Submitting…</Badge>;
                default:
                  return <Badge variant="ghost">Pending</Badge>;
              }
            };

            return (
              <div
                key={status.credentialId}
                className={`flex items-center gap-3 p-4 border transition-all ${getStatusColor()}`}
              >
                {PlatformIcon && (
                  <PlatformIcon className={`size-5 ${getIconColor()}`} />
                )}
                <div className="flex-1">
                  {status.handle && (
                    <p className="text-sm text-foreground/60">
                      @{status.handle}
                    </p>
                  )}
                  {status.error && (
                    <p className="text-sm text-error mt-1">{status.error}</p>
                  )}
                </div>
                {getStatusBadge()}
              </div>
            );
          })}
        </div>

        {/* Final confirmation - only show when all submissions complete */}
        {platformStatuses.length > 0 &&
          platformStatuses.every(
            (s) => s.status === 'completed' || s.status === 'failed',
          ) && (
            <div className="w-full space-y-4 pt-4 border-t border-white/[0.08]">
              <Alert type={AlertCategory.SUCCESS} className="w-full">
                <div className="space-y-1">
                  <p className="font-semibold">All posts have been created</p>
                  <p className="text-sm opacity-80">
                    {
                      platformStatuses.filter((s) => s.status === 'completed')
                        .length
                    }{' '}
                    post
                    {platformStatuses.filter((s) => s.status === 'completed')
                      .length !== 1
                      ? 's'
                      : ''}{' '}
                    waiting to be processed and will be published at the
                    scheduled time.
                  </p>
                </div>
              </Alert>

              <div className="flex w-full gap-2 justify-between">
                <Button
                  label="Close"
                  variant={ButtonVariant.GHOST}
                  onClick={onClose}
                />

                <Button
                  label="View Scheduled Posts"
                  variant={ButtonVariant.DEFAULT}
                  onClick={() => {
                    push(
                      `${EnvironmentService.apps.app}${getPublisherPostsHref({
                        status: PostStatus.SCHEDULED,
                      })}`,
                    );
                  }}
                />
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
