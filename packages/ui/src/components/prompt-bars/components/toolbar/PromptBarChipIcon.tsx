import type { PromptBarChipIconKind } from '@genfeedai/props/prompt-bars/prompt-bar-send-button.props';
import { SHELL_ICON_CLASS } from '@ui/constants/shell-chrome.constant';
import PromptBarAspectRatioIcon from '@ui/prompt-bars/components/toolbar/PromptBarAspectRatioIcon';
import {
  Clock3,
  Cpu,
  Hash,
  Images,
  Layers,
  MessageSquareQuote,
  Workflow,
} from 'lucide-react';
import type { ReactElement } from 'react';

const GLYPHS = {
  count: Hash,
  duration: Clock3,
  format: Images,
  intent: MessageSquareQuote,
  model: Cpu,
  output: Layers,
  source: Layers,
  workflow: Workflow,
} as const;

/**
 * The one glyph for each kind of setting on a prompt-bar chip: the same
 * concept wears the same icon in the Studio, Storyboard, Turbo, Motion and
 * every other bar. The aspect-ratio glyph is drawn from the ratio itself.
 */
export default function PromptBarChipIcon({
  kind,
  value,
}: {
  kind: PromptBarChipIconKind;
  /** The chip's current value; the aspect-ratio glyph takes its shape from it. */
  value: string;
}): ReactElement {
  if (kind === 'aspectRatio') {
    return <PromptBarAspectRatioIcon ratio={value} />;
  }
  const Glyph = GLYPHS[kind];
  return <Glyph aria-hidden="true" className={SHELL_ICON_CLASS} />;
}
