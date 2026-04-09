'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardVariant,
  ModalEnum,
} from '@genfeedai/enums';
import type { IErrorDebugInfo } from '@genfeedai/interfaces/modals/error-debug.interface';
import { Pre } from '@genfeedai/ui';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { ClipboardService } from '@services/core/clipboard.service';
import {
  clearErrorDebugInfo,
  getErrorDebugInfo,
  subscribe,
} from '@services/core/error-debug-store';
import Card from '@ui/card/Card';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { HiChevronDown, HiChevronRight } from 'react-icons/hi2';

interface ErrorSectionProps {
  children?: ReactNode;
  title: string;
  isExpanded?: boolean;
  onToggle?: () => void;
}

function ErrorSection({
  children,
  title,
  isExpanded,
  onToggle,
}: ErrorSectionProps) {
  return (
    <Card
      variant={CardVariant.DEFAULT}
      className="rounded-lg border-destructive/30 bg-destructive/10 text-red-50 hover:border-destructive/30"
      bodyClassName="gap-0 p-4"
    >
      {onToggle ? (
        <Button
          withWrapper={false}
          variant={ButtonVariant.UNSTYLED}
          onClick={onToggle}
          className="flex w-full items-center gap-2 text-left text-red-50"
        >
          {isExpanded ? (
            <HiChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <HiChevronRight className="h-4 w-4 shrink-0" />
          )}
          <h3 className="font-semibold">{title}</h3>
        </Button>
      ) : (
        <h3 className="mb-2 font-semibold">{title}</h3>
      )}

      {children}
    </Card>
  );
}

export default function ModalErrorDebug() {
  const clipboardService = ClipboardService.getInstance();
  const preClassName =
    'mt-2 max-h-48 overflow-y-auto border-destructive/20 bg-black/30 text-red-50';

  const [errorInfo, setErrorInfo] = useState<IErrorDebugInfo | null>(null);
  const [isResponseExpanded, setIsResponseExpanded] = useState(false);
  const [isStackExpanded, setIsStackExpanded] = useState(false);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const existing = getErrorDebugInfo();
    if (existing) {
      setErrorInfo(existing);
    }
    return subscribe((info) => setErrorInfo(info));
  }, []);

  // Called when Close button is clicked - initiates the close
  const handleCancel = () => {
    closeModal(ModalEnum.ERROR_DEBUG);
  };

  // Called by Modal's onClose after modal is closed - cleanup state
  const handleModalClosed = () => {
    setErrorInfo(null);
    clearErrorDebugInfo();
    setIsResponseExpanded(false);
    setIsStackExpanded(false);
    setIsContextExpanded(false);
  };

  const handleCopy = async () =>
    await clipboardService.copyToClipboard(errorInfo?.message || '');

  return (
    <Modal
      id={ModalEnum.ERROR_DEBUG}
      title="Error Debug Information (Beta)"
      isError
      error={errorInfo?.message}
      onClose={handleModalClosed}
      modalBoxClassName="rounded-lg border-destructive/50 bg-[#17080a] text-red-50 shadow-[0_24px_80px_rgba(127,29,29,0.45)]"
    >
      {errorInfo && (
        <>
          <div className="space-y-4 text-red-50">
            <ErrorSection title="Request Details">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {errorInfo.url && (
                  <>
                    <span className="text-red-200/70">URL</span>
                    <span className="font-mono truncate" title={errorInfo.url}>
                      {errorInfo.url}
                    </span>
                  </>
                )}

                {errorInfo.method && (
                  <>
                    <span className="text-red-200/70">Method</span>
                    <span className="font-mono uppercase">
                      {errorInfo.method}
                    </span>
                  </>
                )}

                {errorInfo.status && (
                  <>
                    <span className="text-red-200/70">Status</span>
                    <span className="font-mono">
                      {errorInfo.status} {errorInfo.statusText || ''}
                    </span>
                  </>
                )}

                {errorInfo.errorCode && (
                  <>
                    <span className="text-red-200/70">Error Code</span>
                    <span className="font-mono">{errorInfo.errorCode}</span>
                  </>
                )}

                <span className="text-red-200/70">Timestamp</span>
                <span className="font-mono">{errorInfo.timestamp}</span>
              </div>
            </ErrorSection>

            {errorInfo.response?.data !== undefined ? (
              <ErrorSection
                title="Response Data"
                isExpanded={isResponseExpanded}
                onToggle={() => setIsResponseExpanded(!isResponseExpanded)}
              >
                {isResponseExpanded && (
                  <Pre variant="debug" size="xs" className={preClassName}>
                    {JSON.stringify(errorInfo.response.data, null, 2)}
                  </Pre>
                )}
              </ErrorSection>
            ) : null}

            {errorInfo.stack && (
              <ErrorSection
                title="Stack Trace"
                isExpanded={isStackExpanded}
                onToggle={() => setIsStackExpanded(!isStackExpanded)}
              >
                {isStackExpanded && (
                  <Pre variant="debug" size="xs" className={preClassName}>
                    {errorInfo.stack}
                  </Pre>
                )}
              </ErrorSection>
            )}

            {errorInfo.context && Object.keys(errorInfo.context).length > 0 && (
              <ErrorSection
                title="Additional Context"
                isExpanded={isContextExpanded}
                onToggle={() => setIsContextExpanded(!isContextExpanded)}
              >
                {isContextExpanded && (
                  <Pre variant="debug" size="xs" className={preClassName}>
                    {JSON.stringify(errorInfo.context, null, 2)}
                  </Pre>
                )}
              </ErrorSection>
            )}
          </div>

          <ModalActions className="mt-4">
            {errorInfo.errorCode === 'ERROR_BOUNDARY' && errorInfo.onRetry && (
              <Button
                label="Try Again"
                variant={ButtonVariant.DEFAULT}
                size={ButtonSize.LG}
                className="md:h-9 md:px-4 md:py-2 bg-warning text-warning-foreground hover:bg-warning/90"
                onClick={() => {
                  errorInfo.onRetry?.();
                  handleCancel();
                }}
              />
            )}

            <Button
              label="Copy"
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.LG}
              className="border-destructive/30 bg-destructive/10 text-red-50 hover:bg-destructive/20 md:h-9 md:px-4 md:py-2"
              onClick={handleCopy}
            />

            <Button
              label="Reload"
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.LG}
              className="border-destructive/30 bg-destructive/10 text-red-50 hover:bg-destructive/20 md:h-9 md:px-4 md:py-2"
              onClick={() => {
                handleCancel();
                router.refresh();
              }}
            />
          </ModalActions>
        </>
      )}
    </Modal>
  );
}
