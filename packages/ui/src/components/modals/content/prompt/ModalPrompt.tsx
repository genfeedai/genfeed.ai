import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/enums';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { ModalPromptProps } from '@genfeedai/props/modals/modal.props';
import { ClipboardService } from '@genfeedai/services/core/clipboard.service';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { HiDocumentDuplicate, HiSparkles } from 'react-icons/hi2';

export default function ModalPrompt({
  originalPrompt,
  enhancedPrompt,
  style,
  mood,
  camera,
  fontFamily,
  blacklists,
  sounds,
  onClose,
  onUsePrompt,
  error,
  isOpen,
  openKey,
}: ModalPromptProps) {
  const clipboardService = ClipboardService.getInstance();
  const shouldAutoOpen =
    isOpen ?? Boolean(originalPrompt || enhancedPrompt || error);
  useModalAutoOpen(ModalEnum.PROMPT, { isOpen: shouldAutoOpen, openKey });

  const handleCopy = async (text: string) =>
    await clipboardService.copyToClipboard(text);

  const closeModalPrompt = () => {
    closeModal(ModalEnum.PROMPT);
    onClose?.();
  };

  const handleUsePrompt = () => {
    if (onUsePrompt) {
      // Use enhanced prompt if available, otherwise use original
      const textToUse = enhancedPrompt || originalPrompt || '';

      onUsePrompt({
        blacklists,
        camera,
        fontFamily,
        mood,
        sounds,
        style,
        text: textToUse,
      });

      closeModalPrompt();
    }
  };

  const rows = [
    {
      copyValue: originalPrompt,
      label: 'Original Prompt',
      value: originalPrompt || 'No prompt available.',
    },
    { label: 'Style', value: style || 'None' },
    { label: 'Mood', value: mood || 'None' },
    { label: 'Camera', value: camera || 'None' },
    { label: 'Font Family', value: fontFamily || 'None' },
    {
      label: 'Blacklists',
      value:
        blacklists && blacklists.length > 0 ? blacklists.join(', ') : 'None',
    },
    {
      label: 'Sounds',
      value: sounds && sounds.length > 0 ? sounds.join(', ') : 'None',
    },
  ];

  return (
    <Modal id={ModalEnum.PROMPT} title="Prompt Details" error={error}>
      <div className="space-y-6">
        {/* First row (Original Prompt) full width */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold">{rows[0].label}</h4>
            {rows[0].copyValue && (
              <Button
                label={<HiDocumentDuplicate />}
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.XS}
                tooltip="Copy prompt"
                onClick={() => handleCopy(rows[0].copyValue || '')}
              />
            )}
          </div>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {rows[0].value}
          </p>
        </div>

        {/* Remaining rows in two columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.slice(1).map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">{row.label}</h4>
                {row.copyValue && (
                  <Button
                    label={<HiDocumentDuplicate />}
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.XS}
                    tooltip="Copy prompt"
                    onClick={() => handleCopy(row.copyValue || '')}
                  />
                )}
              </div>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {row.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <ModalActions>
        <Button
          label="Close"
          variant={ButtonVariant.SECONDARY}
          onClick={closeModalPrompt}
        />

        {onUsePrompt && (
          <Button
            label="Use Prompt"
            variant={ButtonVariant.DEFAULT}
            onClick={handleUsePrompt}
            icon={<HiSparkles />}
          />
        )}
      </ModalActions>
    </Modal>
  );
}
