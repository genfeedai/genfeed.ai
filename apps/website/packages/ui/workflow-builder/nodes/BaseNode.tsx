'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { BaseNodeProps } from '@props/automation/workflow-builder.props';
import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';

interface BaseNodeComponentProps extends BaseNodeProps {
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
}

function BaseNode({
  data,
  selected,
  isConnectable = true,
  bgColor,
  borderColor,
  icon,
}: BaseNodeComponentProps) {
  const { label, definition, config } = data;
  const inputs = definition?.inputs ?? {};
  const outputs = definition?.outputs ?? {};

  const inputKeys = Object.keys(inputs);
  const outputKeys = Object.keys(outputs);

  const configEntries = Object.entries(config);
  const visibleConfigEntries = configEntries.slice(0, 2);
  const hiddenCount = configEntries.length - 2;

  return (
    <div
      className={cn(
        'min-w-node border-2 shadow-lg transition-all',
        bgColor,
        borderColor,
        selected && 'ring-2 ring-primary ring-offset-2',
      )}
    >
      {/* Input Handles */}
      {inputKeys.map((key, index) => (
        <Handle
          key={`input-${key}`}
          type="target"
          position={Position.Left}
          id={key}
          isConnectable={isConnectable}
          style={{
            background: '#6b7280',
            height: 10,
            top: `${((index + 1) / (inputKeys.length + 1)) * 100}%`,
            width: 10,
          }}
          title={inputs[key].label}
        />
      ))}

      {/* Node Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2">
        <div className="text-lg">{icon}</div>
        <span className="font-medium text-sm">{label}</span>
      </div>

      {configEntries.length > 0 && (
        <div className="px-3 py-2 text-xs opacity-70">
          {visibleConfigEntries.map(([key, value]) => (
            <div key={key} className="truncate">
              {key}: {String(value)}
            </div>
          ))}
          {hiddenCount > 0 && (
            <div className="text-xs opacity-50">+{hiddenCount} more</div>
          )}
        </div>
      )}

      {/* Output Handles */}
      {outputKeys.map((key, index) => (
        <Handle
          key={`output-${key}`}
          type="source"
          position={Position.Right}
          id={key}
          isConnectable={isConnectable}
          style={{
            background: '#22c55e',
            height: 10,
            top: `${((index + 1) / (outputKeys.length + 1)) * 100}%`,
            width: 10,
          }}
          title={outputs[key].label}
        />
      ))}
    </div>
  );
}

export default memo(BaseNode);
