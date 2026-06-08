'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IEditorClip, IEditorTextOverlay } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import { ColorInput } from '@ui/primitives/color-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Slider } from '@ui/primitives/slider';
import { Textarea } from '@ui/primitives/textarea';

const FONT_OPTIONS = [
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Impact',
  'Comic Sans MS',
];

const PRESET_COLORS = [
  '#ffffff',
  '#000000',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  '#ffff00',
  '#ff00ff',
  '#00ffff',
  '#ff6600',
  '#9933ff',
];

interface EditorTextPropertiesProps {
  selectedTextClip: IEditorClip;
  onUpdateTextOverlay: (updates: Partial<IEditorTextOverlay>) => void;
}

function EditorTextProperties({
  selectedTextClip,
  onUpdateTextOverlay,
}: EditorTextPropertiesProps) {
  const overlay = selectedTextClip.textOverlay;
  if (!overlay) return null;

  return (
    <div className="border-t border-white/[0.08] p-3 space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase">
        Properties
      </h4>

      {/* Text content */}
      <div>
        <span className="text-xs text-muted-foreground block mb-1">Text</span>
        <Textarea
          value={overlay.text}
          onChange={(e) => onUpdateTextOverlay({ text: e.target.value })}
          className="w-full bg-background border border-white/[0.08] rounded px-2 py-1 text-sm resize-none"
          rows={2}
        />
      </div>

      {/* Font family */}
      <div>
        <span className="text-xs text-muted-foreground block mb-1">Font</span>
        <Select
          value={overlay.fontFamily || 'Arial'}
          onValueChange={(value) => onUpdateTextOverlay({ fontFamily: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a font" />
          </SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map((font) => (
              <SelectItem key={font} value={font}>
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Font size */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Size: {overlay.fontSize}px
        </label>
        <Slider
          min={12}
          max={120}
          step={1}
          value={[overlay.fontSize]}
          onValueChange={([fontSize]) => onUpdateTextOverlay({ fontSize })}
        />
      </div>

      {/* Font weight */}
      <div>
        <span className="text-xs text-muted-foreground block mb-1">Weight</span>
        <Select
          value={String(overlay.fontWeight || 700)}
          onValueChange={(value) =>
            onUpdateTextOverlay({ fontWeight: Number(value) })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a font weight" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="300">Light</SelectItem>
            <SelectItem value="400">Regular</SelectItem>
            <SelectItem value="600">Semi-Bold</SelectItem>
            <SelectItem value="700">Bold</SelectItem>
            <SelectItem value="900">Black</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Text color */}
      <div>
        <span className="text-xs text-muted-foreground block mb-1">Color</span>
        <div className="flex flex-wrap gap-1">
          {PRESET_COLORS.map((color) => (
            <Button
              withWrapper={false}
              variant={ButtonVariant.UNSTYLED}
              size={ButtonSize.XS}
              key={color}
              className={`size-6 rounded border ${
                overlay.color === color
                  ? 'border-primary ring-1 ring-primary'
                  : 'border-white/20'
              }`}
              style={{ backgroundColor: color }}
              onClick={() => onUpdateTextOverlay({ color })}
              tooltip={color}
              ariaLabel={`Set color ${color}`}
            />
          ))}
          <ColorInput
            value={overlay.color}
            onChange={(e) => onUpdateTextOverlay({ color: e.target.value })}
            className="size-6 rounded border-white/20 p-0"
            title="Custom color"
          />
        </div>
      </div>

      {/* Background color */}
      <div>
        <span className="text-xs text-muted-foreground block mb-1">
          Background
        </span>
        <div className="flex items-center gap-2">
          <ColorInput
            value={
              overlay.backgroundColor === 'transparent'
                ? '#000000'
                : overlay.backgroundColor || '#000000'
            }
            onChange={(e) =>
              onUpdateTextOverlay({ backgroundColor: e.target.value })
            }
            className="h-6 w-8 rounded border-white/20 p-0"
          />
          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            size={ButtonSize.XS}
            className={`text-xs px-2 py-0.5 rounded ${
              overlay.backgroundColor === 'transparent'
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}
            onClick={() =>
              onUpdateTextOverlay({ backgroundColor: 'transparent' })
            }
          >
            None
          </Button>
        </div>
      </div>

      {/* Position X */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          X Position: {overlay.position.x}%
        </label>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[overlay.position.x]}
          onValueChange={([x]) =>
            onUpdateTextOverlay({
              position: { x, y: overlay.position?.y ?? 50 },
            })
          }
        />
      </div>

      {/* Position Y */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Y Position: {overlay.position.y}%
        </label>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[overlay.position.y]}
          onValueChange={([y]) =>
            onUpdateTextOverlay({
              position: { x: overlay.position?.x ?? 50, y },
            })
          }
        />
      </div>
    </div>
  );
}

export default EditorTextProperties;
