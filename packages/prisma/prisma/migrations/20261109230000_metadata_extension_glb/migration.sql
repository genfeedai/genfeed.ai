-- 3D models (#9835): a rendered model is stored as a GLB file.
ALTER TYPE "MetadataExtension" ADD VALUE IF NOT EXISTS 'GLB';
