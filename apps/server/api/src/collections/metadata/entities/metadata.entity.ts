import { BaseEntity } from '@api/entities/base.entity';
import type { Metadata } from '@genfeedai/prisma';

export class MetadataEntity extends BaseEntity implements Metadata {
  declare readonly promptId: string | null;

  declare readonly label: string;
  declare readonly description: string;
  declare readonly externalId: Metadata['externalId'];
  declare readonly externalProvider: Metadata['externalProvider'];

  declare readonly result: string;
  declare readonly error: Metadata['error'];
  declare readonly assistant: string;
  declare readonly model: string;
  declare readonly style: Metadata['style'];
  declare readonly extension: Metadata['extension'];
  declare readonly width: number;
  declare readonly height: number;
  declare readonly duration: number;
  declare readonly size: number;
  declare readonly seed: Metadata['seed'];
  declare readonly hasAudio: boolean;
  declare readonly fps: Metadata['fps'];
  declare readonly resolution: Metadata['resolution'];
  declare readonly tags: string[];

  // Template tracking fields
  declare readonly promptTemplate: Metadata['promptTemplate'];
  declare readonly templateVersion: Metadata['templateVersion'];
}
