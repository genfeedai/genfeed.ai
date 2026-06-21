import type { MoodBoard } from '@genfeedai/prisma';

export class MoodBoardEntity implements MoodBoard {
  id!: string;
  brandId!: string;
  organizationId!: string;
  layout!: MoodBoard['layout'];
  metadata!: MoodBoard['metadata'];
  isDeleted!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  [key: string]: unknown;

  constructor(partial: Partial<MoodBoard> = {}) {
    Object.assign(this, partial);
  }
}
