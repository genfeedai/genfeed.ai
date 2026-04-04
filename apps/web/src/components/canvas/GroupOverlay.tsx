'use client';

import type { WorkflowNode } from '@genfeedai/types';
import { useNodes, useReactFlow, useViewport, ViewportPortal } from '@xyflow/react';
import { clsx } from 'clsx';
import { Lock, Palette, Trash2, Unlock } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { GroupColor, NodeGroup } from '@/types/groups';
import { DEFAULT_GROUP_COLORS, GROUP_COLORS } from '@/types/groups';

const HEADER_HEIGHT = 32;

export interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate bounds for a group of nodes
 * Uses a Map for O(1) node lookup instead of O(n) filter
 */
function calculateGroupBounds(
  nodeIds: string[],
  nodeMap: Map<string, WorkflowNode>
): GroupBounds | null {
  if (nodeIds.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let foundAny = false;

  for (const nodeId of nodeIds) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    foundAny = true;
    const width = node.measured?.width ?? 200;
    const height = node.measured?.height ?? 100;

    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + width);
    maxY = Math.max(maxY, node.position.y + height);
  }

  if (!foundAny) return null;

  const padding = 24;
  return {
    height: maxY - minY + padding * 2 + HEADER_HEIGHT,
    width: maxX - minX + padding * 2,
    x: minX - padding,
    y: minY - padding - HEADER_HEIGHT,
  };
}

interface GroupBackgroundProps {
  group: NodeGroup;
  bounds: GroupBounds;
}

/**
 * Group background - renders BELOW nodes
 * Uses flow coordinates directly (ViewportPortal handles transform)
 */
function GroupBackground({ group, bounds }: GroupBackgroundProps) {
  const colors = GROUP_COLORS[group.color ?? 'purple'];

  return (
    <div
      className={clsx(
        'absolute rounded-lg border-2 border-dashed',
        colors.bg,
        colors.border,
        group.isLocked && 'opacity-60'
      )}
      style={{
        height: bounds.height,
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
      }}
    />
  );
}

interface GroupControlsProps {
  group: NodeGroup;
  bounds: GroupBounds;
  nodeMap: Map<string, WorkflowNode>;
  zoom: number;
}

/**
 * Group controls (header with drag, buttons) - renders ABOVE nodes
 * Uses flow coordinates directly (ViewportPortal handles transform)
 */
function GroupControls({ group, bounds, nodeMap, zoom }: GroupControlsProps) {
  const { setNodes } = useReactFlow();
  const { toggleGroupLock, deleteGroup, setGroupColor, setDirty, renameGroup } = useWorkflowStore();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const nodeStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Update edit name when group name changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditName(group.name);
    }
  }, [group.name, isEditing]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };

    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker]);

  const handleNameSubmit = useCallback(() => {
    if (editName.trim() && editName !== group.name) {
      renameGroup(group.id, editName.trim());
    } else {
      setEditName(group.name);
    }
    setIsEditing(false);
  }, [editName, group.name, group.id, renameGroup]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleNameSubmit();
      } else if (e.key === 'Escape') {
        setEditName(group.name);
        setIsEditing(false);
      }
    },
    [handleNameSubmit, group.name]
  );

  // Handle drag start on group header
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (group.isLocked) return;
      // Don't start drag if clicking on buttons or inputs
      if (
        (e.target as HTMLElement).closest('button') ||
        (e.target as HTMLElement).closest('input')
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      // Save initial positions of all nodes in group using O(1) Map lookup
      const positions = new Map<string, { x: number; y: number }>();
      for (const nodeId of group.nodeIds) {
        const node = nodeMap.get(nodeId);
        if (node) {
          positions.set(nodeId, { x: node.position.x, y: node.position.y });
        }
      }
      nodeStartPositionsRef.current = positions;
    },
    [group.isLocked, group.nodeIds, nodeMap]
  );

  // Handle drag move and end
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      // Convert screen delta to flow coordinates (divide by zoom)
      const deltaX = (e.clientX - dragStartRef.current.x) / zoom;
      const deltaY = (e.clientY - dragStartRef.current.y) / zoom;

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const startPos = nodeStartPositionsRef.current.get(node.id);
          if (!startPos) return node;
          return {
            ...node,
            position: {
              x: startPos.x + deltaX,
              y: startPos.y + deltaY,
            },
          };
        })
      );
    };

    const handleMouseUp = () => {
      setDirty(true);
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, zoom, setNodes, setDirty]);

  const colors = GROUP_COLORS[group.color ?? 'purple'];

  const handleColorSelect = (color: GroupColor) => {
    setGroupColor(group.id, color);
    setShowColorPicker(false);
  };

  return (
    <>
      {/* Group Header - draggable */}
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'absolute flex items-center justify-between px-3 rounded-t-lg select-none pointer-events-auto',
          colors.bg,
          colors.border,
          'border-2 border-b-0 border-dashed',
          !group.isLocked && 'cursor-grab',
          isDragging && 'cursor-grabbing',
          group.isLocked && 'opacity-60'
        )}
        style={{
          height: HEADER_HEIGHT,
          left: bounds.x,
          top: bounds.y,
          width: bounds.width,
        }}
      >
        {/* Editable Name */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleKeyDown}
            className={clsx(
              'flex-1 bg-transparent border-none outline-none text-sm font-medium px-0 py-0',
              colors.text
            )}
            style={{ minWidth: 0 }}
          />
        ) : (
          <span
            className={clsx('font-medium truncate cursor-text', colors.text)}
            style={{ fontSize: 14 }}
            onClick={() => setIsEditing(true)}
          >
            {group.name}
          </span>
        )}
        <div className="flex items-center gap-1">
          {/* Color Picker */}
          <div className="relative" ref={colorPickerRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowColorPicker(!showColorPicker);
              }}
              className={clsx('p-1 rounded hover:bg-white/10 transition-colors', colors.text)}
              title="Change group color"
            >
              <Palette className="w-4 h-4" />
            </button>
            {showColorPicker && (
              <div className="absolute top-8 right-0 z-50 bg-card border border-border rounded-lg shadow-lg p-2 flex gap-1 flex-wrap w-[120px]">
                {DEFAULT_GROUP_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleColorSelect(color);
                    }}
                    className={clsx(
                      'w-6 h-6 rounded-md border-2 transition-transform hover:scale-110',
                      GROUP_COLORS[color].bg,
                      color === group.color ? 'border-white' : 'border-transparent'
                    )}
                    title={color}
                  />
                ))}
              </div>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleGroupLock(group.id);
            }}
            className={clsx('p-1 rounded hover:bg-white/10 transition-colors', colors.text)}
            title={group.isLocked ? 'Unlock group' : 'Lock group'}
          >
            {group.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteGroup(group.id);
            }}
            className={clsx('p-1 rounded hover:bg-white/10 transition-colors', colors.text)}
            title="Delete group"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Lock Badge */}
      {group.isLocked && (
        <div
          className={clsx(
            'absolute px-2 py-0.5 rounded text-xs font-medium pointer-events-none',
            colors.bg,
            colors.text
          )}
          style={{
            left: bounds.x + 12,
            top: bounds.y + HEADER_HEIGHT + 8,
          }}
        >
          LOCKED
        </div>
      )}
    </>
  );
}

/**
 * Renders group backgrounds BELOW nodes (z-index: -1)
 * Must be placed inside ReactFlow component
 *
 * Optimization: Computes bounds once per group using a shared nodeMap
 */
function GroupBackgroundsPortalComponent() {
  const { groups } = useWorkflowStore();
  const nodes = useNodes() as WorkflowNode[];

  // Create node lookup Map once - O(n) instead of O(n²) for all groups
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Pre-compute all bounds once
  const groupBounds = useMemo(() => {
    const result = new Map<string, GroupBounds>();
    for (const group of groups) {
      const bounds = calculateGroupBounds(group.nodeIds, nodeMap);
      if (bounds) {
        result.set(group.id, bounds);
      }
    }
    return result;
  }, [groups, nodeMap]);

  if (groups.length === 0) return null;

  return (
    <ViewportPortal>
      <div style={{ left: 0, pointerEvents: 'none', position: 'absolute', top: 0, zIndex: -1 }}>
        {groups.map((group) => {
          const bounds = groupBounds.get(group.id);
          if (!bounds) return null;
          return <GroupBackground key={group.id} group={group} bounds={bounds} />;
        })}
      </div>
    </ViewportPortal>
  );
}

/**
 * Renders group headers/controls ABOVE nodes (z-index: 1000)
 * Must be placed inside ReactFlow component
 *
 * Optimization: Computes bounds once per group using a shared nodeMap
 */
function GroupControlsOverlayComponent() {
  const { groups } = useWorkflowStore();
  const nodes = useNodes() as WorkflowNode[];
  const { zoom } = useViewport();

  // Create node lookup Map once - O(n) instead of O(n²) for all groups
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Pre-compute all bounds once
  const groupBounds = useMemo(() => {
    const result = new Map<string, GroupBounds>();
    for (const group of groups) {
      const bounds = calculateGroupBounds(group.nodeIds, nodeMap);
      if (bounds) {
        result.set(group.id, bounds);
      }
    }
    return result;
  }, [groups, nodeMap]);

  if (groups.length === 0) return null;

  return (
    <ViewportPortal>
      <div style={{ left: 0, pointerEvents: 'none', position: 'absolute', top: 0, zIndex: 1000 }}>
        {groups.map((group) => {
          const bounds = groupBounds.get(group.id);
          if (!bounds) return null;
          return (
            <GroupControls
              key={group.id}
              group={group}
              bounds={bounds}
              nodeMap={nodeMap}
              zoom={zoom}
            />
          );
        })}
      </div>
    </ViewportPortal>
  );
}

export const GroupBackgroundsPortal = memo(GroupBackgroundsPortalComponent);
export const GroupControlsOverlay = memo(GroupControlsOverlayComponent);

// Legacy export for backwards compatibility - combines both portals
function GroupOverlayComponent() {
  return (
    <>
      <GroupBackgroundsPortal />
      <GroupControlsOverlay />
    </>
  );
}

export const GroupOverlay = memo(GroupOverlayComponent);
