import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

export interface SplitImageResult {
  index: number;
  buffer: Buffer;
  width: number;
  height: number;
}

@Injectable()
export class ImagesSplitService {
  constructor(private readonly loggerService: LoggerService) {}

  /**
   * Split a contact sheet image into individual frames based on grid dimensions.
   *
   * @param buffer - Source image buffer
   * @param gridRows - Number of rows in the grid (2-4)
   * @param gridCols - Number of columns in the grid (2-4)
   * @param borderInset - Pixels to crop inward from each cell edge to remove borders (default: 10)
   * @returns Array of frame buffers with metadata
   */
  public async splitImage(
    buffer: Buffer,
    gridRows: number,
    gridCols: number,
    borderInset = 10,
  ): Promise<SplitImageResult[]> {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Unable to read image dimensions');
    }

    const cellWidth = Math.floor(metadata.width / gridCols);
    const cellHeight = Math.floor(metadata.height / gridRows);

    // Validate that border inset doesn't exceed half the cell dimensions
    const maxInset = Math.min(cellWidth / 2, cellHeight / 2) - 1;
    const safeInset = Math.min(borderInset, maxInset);

    this.loggerService.log(
      `Splitting ${metadata.width}x${metadata.height} image into ${gridRows}x${gridCols} grid`,
      'ImagesSplitService',
    );
    this.loggerService.log(
      `Cell size: ${cellWidth}x${cellHeight}, border inset: ${safeInset}px`,
      'ImagesSplitService',
    );

    const frames: SplitImageResult[] = [];

    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const index = row * gridCols + col;

        // Calculate position with border inset
        const left = col * cellWidth + safeInset;
        const top = row * cellHeight + safeInset;
        const width = cellWidth - safeInset * 2;
        const height = cellHeight - safeInset * 2;

        try {
          const frameBuffer = await sharp(buffer)
            .extract({ height, left, top, width })
            .jpeg({ quality: 95 })
            .toBuffer();

          frames.push({
            buffer: frameBuffer,
            height,
            index,
            width,
          });

          this.loggerService.log(
            `Extracted frame ${index + 1}/${gridRows * gridCols} (${width}x${height})`,
            'ImagesSplitService',
          );
        } catch (error: unknown) {
          this.loggerService.error(
            `Failed to extract frame ${index + 1}`,
            error instanceof Error ? error.stack : String(error),
            'ImagesSplitService',
          );
          throw error instanceof Error ? error : new Error(String(error));
        }
      }
    }

    this.loggerService.log(
      `Successfully split image into ${frames.length} frames`,
      'ImagesSplitService',
    );

    return frames;
  }
}
