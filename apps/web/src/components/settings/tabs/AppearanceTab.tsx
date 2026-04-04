'use client';

import { InfoBox, SettingsField } from '@/components/ui/settings-section';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { type EdgeStyle, useSettingsStore } from '@/store/settingsStore';

const EDGE_STYLES: { value: EdgeStyle; label: string; description: string }[] = [
  { description: 'Smooth bezier curves', label: 'Curved', value: 'default' },
  { description: 'Right-angled with rounded corners', label: 'Smooth Step', value: 'smoothstep' },
  { description: 'Direct lines between nodes', label: 'Straight', value: 'straight' },
];

export function AppearanceTab() {
  const { edgeStyle, setEdgeStyle, showMinimap, setShowMinimap } = useSettingsStore();

  return (
    <div className="space-y-6">
      <SettingsField
        label="Show Minimap"
        description="Display a miniature overview of the workflow canvas"
        action={<ToggleSwitch checked={showMinimap} onCheckedChange={setShowMinimap} />}
      />

      <SettingsField
        label="Edge Style"
        description="How connections between nodes are drawn on the canvas."
      >
        <div className="mt-3 grid grid-cols-3 gap-3">
          {EDGE_STYLES.map((style) => (
            <button
              key={style.value}
              onClick={() => setEdgeStyle(style.value)}
              className={`rounded-lg border p-3 text-left transition ${
                edgeStyle === style.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="font-medium text-sm text-foreground">{style.label}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{style.description}</div>
            </button>
          ))}
        </div>
      </SettingsField>

      {/* Preview */}
      <InfoBox>
        <div className="relative h-20 w-[232px] mx-auto">
          <div className="absolute left-0 bottom-2 flex h-8 w-16 items-center justify-center rounded border border-border bg-background text-xs text-muted-foreground">
            Node A
          </div>
          <svg className="absolute left-16 top-0 text-primary" width="104" height="80">
            {edgeStyle === 'default' && (
              <path
                d="M 0 56 C 35 56, 69 24, 104 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            )}
            {edgeStyle === 'smoothstep' && (
              <path
                d="M 0 56 L 42 56 Q 52 56 52 46 L 52 34 Q 52 24 62 24 L 104 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            )}
            {edgeStyle === 'straight' && (
              <path d="M 0 56 L 104 24" fill="none" stroke="currentColor" strokeWidth="2" />
            )}
          </svg>
          <div className="absolute right-0 top-2 flex h-8 w-16 items-center justify-center rounded border border-border bg-background text-xs text-muted-foreground">
            Node B
          </div>
        </div>
      </InfoBox>
    </div>
  );
}
