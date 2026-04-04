'use client';

import type { CubicBezier } from '@genfeedai/types';
import { useCallback, useRef, useState } from 'react';
import { EASING_PRESETS } from '@/lib/easing/presets';

interface BezierCurveEditorProps {
  value: CubicBezier;
  onChange: (curve: CubicBezier) => void;
}

export function BezierCurveEditor({ value, onChange }: BezierCurveEditorProps) {
  const [dragging, setDragging] = useState<1 | 2 | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [x1, y1, x2, y2] = value;

  // Convert bezier coordinates (0-1) to SVG coordinates (0-200)
  const toSvg = (v: number) => v * 200;
  const fromSvg = useCallback((v: number) => Math.max(0, Math.min(1, v / 200)), []);

  const handleMouseDown = useCallback((point: 1 | 2) => {
    setDragging(point);
  }, []);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!dragging || !svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      const x = fromSvg(event.clientX - rect.left);
      const y = 1 - fromSvg(event.clientY - rect.top);

      if (dragging === 1) {
        onChange([x, y, x2, y2]);
      } else {
        onChange([x1, y1, x, y]);
      }
    },
    [dragging, x1, y1, x2, y2, onChange, fromSvg]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Generate path for the bezier curve
  const pathD = `M 0 200 C ${toSvg(x1)} ${200 - toSvg(y1)}, ${toSvg(x2)} ${200 - toSvg(y2)}, 200 0`;

  // Control point lines
  const line1 = `M 0 200 L ${toSvg(x1)} ${200 - toSvg(y1)}`;
  const line2 = `M 200 0 L ${toSvg(x2)} ${200 - toSvg(y2)}`;

  return (
    <div className="space-y-3">
      {/* SVG Editor */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-2">
        <svg
          ref={svgRef}
          viewBox="0 0 200 200"
          className="w-full aspect-square cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Grid */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--border)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="200" height="200" fill="url(#grid)" />

          {/* Diagonal reference */}
          <line x1="0" y1="200" x2="200" y2="0" stroke="var(--border)" strokeDasharray="4 4" />

          {/* Control point lines */}
          <path d={line1} stroke="var(--primary)" strokeWidth="1" opacity="0.5" />
          <path d={line2} stroke="var(--primary)" strokeWidth="1" opacity="0.5" />

          {/* Bezier curve */}
          <path d={pathD} fill="none" stroke="var(--primary)" strokeWidth="2" />

          {/* Start and end points */}
          <circle cx="0" cy="200" r="4" fill="var(--foreground)" />
          <circle cx="200" cy="0" r="4" fill="var(--foreground)" />

          {/* Control points (draggable) */}
          <circle
            cx={toSvg(x1)}
            cy={200 - toSvg(y1)}
            r={dragging === 1 ? 8 : 6}
            fill="var(--accent)"
            className="cursor-grab"
            onMouseDown={() => handleMouseDown(1)}
          />
          <circle
            cx={toSvg(x2)}
            cy={200 - toSvg(y2)}
            r={dragging === 2 ? 8 : 6}
            fill="var(--accent)"
            className="cursor-grab"
            onMouseDown={() => handleMouseDown(2)}
          />
        </svg>
      </div>

      {/* Values */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div>
          <label className="text-[var(--muted-foreground)]">X1</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={x1.toFixed(2)}
            onChange={(e) => onChange([parseFloat(e.target.value), y1, x2, y2])}
            className="w-full px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded"
          />
        </div>
        <div>
          <label className="text-[var(--muted-foreground)]">Y1</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={y1.toFixed(2)}
            onChange={(e) => onChange([x1, parseFloat(e.target.value), x2, y2])}
            className="w-full px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded"
          />
        </div>
        <div>
          <label className="text-[var(--muted-foreground)]">X2</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={x2.toFixed(2)}
            onChange={(e) => onChange([x1, y1, parseFloat(e.target.value), y2])}
            className="w-full px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded"
          />
        </div>
        <div>
          <label className="text-[var(--muted-foreground)]">Y2</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={y2.toFixed(2)}
            onChange={(e) => onChange([x1, y1, x2, parseFloat(e.target.value)])}
            className="w-full px-2 py-1 bg-[var(--card)] border border-[var(--border)] rounded"
          />
        </div>
      </div>

      {/* Quick Presets */}
      <div>
        <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Quick Presets</label>
        <div className="flex flex-wrap gap-1">
          {Object.entries(EASING_PRESETS)
            .slice(0, 6)
            .map(([name, curve]) => (
              <button
                key={name}
                onClick={() => onChange(curve)}
                className="px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded hover:border-[var(--primary)] transition"
              >
                {name.replace(/([A-Z])/g, ' $1').trim()}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
