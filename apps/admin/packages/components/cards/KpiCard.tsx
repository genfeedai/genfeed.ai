'use client';

import Card from '@ui/card/Card';
import type { ComponentType } from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon?: ComponentType<{ className?: string }>;
  colorClass?: string;
  description?: string;
}

export default function KpiCard({
  title,
  value,
  icon: Icon,
  colorClass = 'text-foreground',
  description,
}: KpiCardProps) {
  return (
    <Card>
      <div className="p-6">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-foreground/60">{title}</span>
          {Icon && <Icon className="h-5 w-5 text-foreground/40" />}
        </div>
        <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
        {description && (
          <p className="mt-1 text-xs text-foreground/50">{description}</p>
        )}
      </div>
    </Card>
  );
}
