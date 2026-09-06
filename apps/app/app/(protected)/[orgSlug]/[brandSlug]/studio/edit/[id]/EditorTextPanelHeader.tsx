import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { EditorTextPanelHeaderProps } from '@props/studio/editor-text-panel-header.props';
import { Button } from '@ui/primitives/button';

function EditorTextPanelHeader({
  isExpanded,
  onToggleExpanded,
  onAddText,
}: EditorTextPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border">
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
