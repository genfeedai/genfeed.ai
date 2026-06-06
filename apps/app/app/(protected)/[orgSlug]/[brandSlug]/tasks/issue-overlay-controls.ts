import { closeModal, openModal } from '@helpers/ui/modal/modal.helper';

export const ISSUE_OVERLAY_ID = 'issue-overlay';

export function openIssueOverlay(): void {
  openModal(ISSUE_OVERLAY_ID);
}

export function closeIssueOverlay(): void {
  closeModal(ISSUE_OVERLAY_ID);
}
