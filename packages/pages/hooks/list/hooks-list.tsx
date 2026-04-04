'use client';

import Card from '@ui/card/Card';
import { HiOutlineBolt } from 'react-icons/hi2';

export default function HooksList() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10">
          <HiOutlineBolt className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Hook Performance</h1>
          <p className="text-muted-foreground">
            Analyze hook engagement and effectiveness
          </p>
        </div>
      </div>

      <Card className="p-6">
        <p className="text-muted-foreground text-center py-12">
          Hook performance metrics will be displayed here
        </p>
      </Card>
    </div>
  );
}
