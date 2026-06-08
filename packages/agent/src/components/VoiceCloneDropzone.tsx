import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import type { ReactElement, RefObject } from 'react';
import { HiCloudArrowUp, HiMicrophone, HiMusicalNote } from 'react-icons/hi2';

type CardStatus = 'idle' | 'uploading' | 'cloning' | 'done' | 'error';

type VoiceCloneDropzoneProps = {
  file: File | null;
  status: CardStatus;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClone: () => void;
};

export function VoiceCloneDropzone({
  file,
  status,
  fileInputRef,
  onDrop,
  onDragOver,
  onFileChange,
  onClone,
}: VoiceCloneDropzoneProps): ReactElement {
  return (
    <>
      {/* Audio dropzone */}
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            fileInputRef.current?.click();
          }
        }}
        className="mb-3 flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-border p-6 transition-colors hover:border-primary/50 hover:bg-muted/50"
      >
        <HiCloudArrowUp className="mb-2 size-8 text-muted-foreground" />
        {file ? (
          <div className="flex items-center gap-2">
            <HiMusicalNote className="size-4 text-rose-500" />
            <span className="text-xs font-medium text-foreground">
              {file.name}
            </span>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-xs font-medium text-foreground">
              Drop audio file here
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              or click to browse (MP3, WAV, M4A)
            </p>
          </div>
        )}
        <Input
          inputRef={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={onFileChange}
          className="hidden"
        />
      </Button>

      {/* Clone button */}
      <Button
        variant={ButtonVariant.DEFAULT}
        onClick={onClone}
        isDisabled={!file || status === 'uploading' || status === 'cloning'}
        isLoading={status === 'uploading'}
        className="w-full"
      >
        <HiMicrophone className="size-4" />
        {status === 'uploading' ? 'Uploading…' : 'Clone New Voice'}
      </Button>
    </>
  );
}
