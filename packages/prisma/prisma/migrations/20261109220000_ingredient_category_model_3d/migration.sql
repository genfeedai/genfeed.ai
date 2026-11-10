-- 3D models (#9835): a textured GLB is an ingredient of its own category, so
-- the library can store and preview it like any other asset.
ALTER TYPE "IngredientCategory" ADD VALUE IF NOT EXISTS 'MODEL_3D';
