declare module 'archiver' {
  import type { WriteStream } from 'node:fs';
  import type { Readable } from 'node:stream';

  interface ArchiverEntryData {
    name: string;
  }

  interface ArchiverOptions {
    zlib?: {
      level?: number;
    };
  }

  interface ArchiverInstance {
    append(source: Readable | Buffer, data: ArchiverEntryData): void;
    finalize(): Promise<void>;
    pipe(destination: WriteStream): void;
  }

  export default function archiver(
    format: string,
    options?: ArchiverOptions,
  ): ArchiverInstance;
}
