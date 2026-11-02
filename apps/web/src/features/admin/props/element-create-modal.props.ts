import type { ModalCreateProps } from '@genfeedai/props/modals/modal.props';
import type { ELEMENT_CREATE_MODAL_CONFIG } from '@/components/modals/elements/shared/element-create-modal.config';

export interface ElementCreateModalProps extends ModalCreateProps {
  modalId: keyof typeof ELEMENT_CREATE_MODAL_CONFIG;
}
