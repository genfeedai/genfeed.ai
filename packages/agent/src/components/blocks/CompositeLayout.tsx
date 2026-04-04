'use client';

import DynamicBlockGrid from '@genfeedai/agent/components/blocks/DynamicBlockGrid';
import type { CompositeBlock } from '@genfeedai/interfaces';
import type { ReactElement } from 'react';

interface CompositeLayoutProps {
  block: CompositeBlock;
}

function CompositeLayout({ block }: CompositeLayoutProps): ReactElement {
  const isRow = block.layout === 'row';

  return (
    <div className={isRow ? 'flex gap-4' : 'flex flex-col gap-4'}>
      <DynamicBlockGrid blocks={block.blocks} />
    </div>
  );
}

export default CompositeLayout;
