'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';

interface EditorTextPanelHeaderProps {
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onAddText: () => void;
}

function EditorTextPanelHeader({
  isExpanded,
  onToggleExpanded,
  onAddText,
}: EditorTextPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.08]">
      <Button
        withWrapper={false}
        variant={ButtonVariant.UNSTYLED}
        size={ButtonSize.SM}
        className="flex items-center gap-1 text-sm font-medium"
        onClick={onToggleExpanded}
      >
        <span
          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        >
          ▸
        </span>
        Text Overlays
      </Button>
      <Button
        withWrapper={false}
        variant={ButtonVariant.GHOST}
        size={ButtonSize.XS}
        onClick={onAddText}
        tooltip="Add text layer"
      >
        + Add Text
      </Button>
    </div>
  );
}

export default EditorTextPanelHeader;
