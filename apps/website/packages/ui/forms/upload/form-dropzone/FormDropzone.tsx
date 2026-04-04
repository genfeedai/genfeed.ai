import type { FormDropzoneProps } from '@props/forms/form.props';
import FormControl from '@ui/forms/base/form-control/FormControl';
import { useDropzone } from 'react-dropzone';

export default function FormDropzone({
  label,
  file,
  onDrop,
}: FormDropzoneProps) {
  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png'] },
    maxFiles: 1,
    multiple: false,
    onDrop: (accepted) => {
      if (accepted && accepted.length > 0) {
        onDrop(accepted[0]);
      }
    },
  });

  return (
    <FormControl label={label}>
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
    </FormControl>
  );
}
