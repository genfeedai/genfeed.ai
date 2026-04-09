import { useDropzone } from 'react-dropzone';
import Field from './field';

export interface DropzoneFieldProps {
  label?: string;
  file?: File | null;
  onDrop: (file: File) => void;
}

export default function DropzoneField({
  label,
  file,
  onDrop,
}: DropzoneFieldProps) {
  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1,
    multiple: false,
    onDrop: (acceptedFiles) => {
      const [acceptedFile] = acceptedFiles;
      if (acceptedFile) {
        onDrop(acceptedFile);
      }
    },
  });

  return (
    <Field label={label}>
      <div
        {...getRootProps({
          className: `file-uploader !max-w-full bg-primary/10 border-primary/10
            border-1 border-dashed p-4 text-center cursor-pointer`,
        })}
      >
        <input {...getInputProps()} />
        {file ? (
          <p>{`${file.name} - ${file.size} bytes`}</p>
        ) : (
          <p>Drop files here or click to upload</p>
        )}
      </div>
    </Field>
  );
}
