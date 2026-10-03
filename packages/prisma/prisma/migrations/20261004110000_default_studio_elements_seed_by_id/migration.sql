-- Make the platform default seed safe to re-run after a key rename (#6038).
--
-- 20261004100000_default_studio_elements derives each seeded id from the
-- ORIGINAL catalog key but checks existence by the row's CURRENT key. A
-- superadmin who renames a default (anime -> anime-v2) leaves the original key
-- missing while its deterministic primary key stays occupied, so re-running
-- that seed would insert a row with an id that already exists and fail.
--
-- This migration repeats the same catalog with existence decided by the
-- deterministic id OR the key among platform rows (soft-deleted included):
--   * a renamed, edited, deactivated or deleted default is never re-inserted,
--     overwritten or resurrected;
--   * a catalog entry whose key is missing and whose id is free is inserted;
--   * re-running inserts nothing.
-- Data-only and idempotent. The earlier migration has already run, so it is
-- left untouched.

-- elements_styles
INSERT INTO "elements_styles" ("id", "organizationId", "key", "label", "description", "isDeleted", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'c' || substr(md5('elements_styles:' || seed."key"), 1, 24), NULL, seed."key", seed."label", seed."description", false, true, seed."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('photoreal', 'Photoreal', 'Lifelike photography with natural textures, light and depth.', 0),
  ('cinematic', 'Cinematic', 'Film-grade framing, color grading and dramatic lighting.', 10),
  ('3d-animated', '3D Animated', 'Polished 3D animation with stylized characters and soft global lighting.', 20),
  ('anime', 'Anime', 'Japanese animation look with clean linework and expressive color.', 30),
  ('comic', 'Comic', 'Comic-book panels with bold inks, halftones and punchy color.', 40),
  ('pixel-art', 'Pixel Art', 'Retro low-resolution pixel graphics with a limited palette.', 50),
  ('oil-painting', 'Oil Painting', 'Rich brushstrokes and layered pigment like a classical oil canvas.', 60),
  ('watercolor', 'Watercolor', 'Soft translucent washes with bleeding edges on textured paper.', 70),
  ('cyberpunk', 'Cyberpunk', 'Neon-soaked futuristic cityscapes with high-tech, low-life grit.', 80),
  ('fantasy', 'Fantasy', 'Epic, magical worlds with painterly detail and mythic atmosphere.', 90),
  ('sketch', 'Sketch', 'Hand-drawn pencil or ink sketch with visible construction lines.', 100),
  ('minimalist', 'Minimalist', 'Clean composition, simple shapes and generous negative space.', 110),
  ('vintage', 'Vintage', 'Faded film tones, grain and the look of mid-century photographs.', 120),
  ('digital-art', 'Digital Art', 'Crisp digital illustration with vivid color and polished rendering.', 130),
  ('noir', 'Noir', 'High-contrast black and white with deep shadows and moody tension.', 140)
) AS seed("key", "label", "description", "sortOrder")
WHERE NOT EXISTS (
  SELECT 1 FROM "elements_styles" existing
  WHERE existing."id" = 'c' || substr(md5('elements_styles:' || seed."key"), 1, 24)
    OR (existing."organizationId" IS NULL AND existing."key" = seed."key")
);

-- elements_moods
INSERT INTO "elements_moods" ("id", "organizationId", "key", "label", "description", "isDeleted", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'c' || substr(md5('elements_moods:' || seed."key"), 1, 24), NULL, seed."key", seed."label", seed."description", false, true, seed."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('dreamy', 'Dreamy', 'Soft, floating and surreal, like a half-remembered dream.', 0),
  ('gritty', 'Gritty', 'Raw, rough and unpolished with a hard edge.', 10),
  ('ethereal', 'Ethereal', 'Delicate, glowing and otherworldly.', 20),
  ('nostalgic', 'Nostalgic', 'Warm and wistful, evoking the past.', 30),
  ('futuristic', 'Futuristic', 'Sleek, technological and forward-looking.', 40),
  ('mysterious', 'Mysterious', 'Shadowy and intriguing, hiding more than it shows.', 50),
  ('peaceful', 'Peaceful', 'Calm, quiet and unhurried.', 60),
  ('energetic', 'Energetic', 'Fast, vibrant and full of motion.', 70),
  ('moody', 'Moody', 'Brooding and atmospheric with deep emotion.', 80),
  ('dramatic', 'Dramatic', 'Heightened emotion and strong contrast.', 90),
  ('whimsical', 'Whimsical', 'Playful, quirky and lighthearted.', 100),
  ('tense', 'Tense', 'Uneasy and suspenseful with building pressure.', 110),
  ('joyful', 'Joyful', 'Bright, happy and celebratory.', 120),
  ('epic', 'Epic', 'Grand in scale, heroic and awe-inspiring.', 130)
) AS seed("key", "label", "description", "sortOrder")
WHERE NOT EXISTS (
  SELECT 1 FROM "elements_moods" existing
  WHERE existing."id" = 'c' || substr(md5('elements_moods:' || seed."key"), 1, 24)
    OR (existing."organizationId" IS NULL AND existing."key" = seed."key")
);

-- elements_scenes
INSERT INTO "elements_scenes" ("id", "organizationId", "key", "label", "description", "isDeleted", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'c' || substr(md5('elements_scenes:' || seed."key"), 1, 24), NULL, seed."key", seed."label", seed."description", false, true, seed."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('studio', 'Studio', 'Controlled studio set with a clean backdrop.', 0),
  ('indoor', 'Indoor', 'A generic interior space with natural room lighting.', 10),
  ('cozy-interior', 'Cozy Interior', 'A warm, lived-in home interior.', 20),
  ('outdoor', 'Outdoor', 'Open-air setting under natural light.', 30),
  ('urban-street', 'Urban Street', 'City street with buildings, signs and foot traffic.', 40),
  ('city-skyline', 'City Skyline', 'Wide view of a city skyline at a distance.', 50),
  ('nature', 'Nature', 'Unspoiled landscape with plants and open sky.', 60),
  ('forest', 'Forest', 'Dense woodland with dappled light through the trees.', 70),
  ('beach', 'Beach', 'Sandy shoreline with waves and open horizon.', 80),
  ('desert', 'Desert', 'Dry dunes and wide, sun-baked horizons.', 90),
  ('underwater', 'Underwater', 'Submerged scene with light rays and floating particles.', 100),
  ('space', 'Space', 'Deep space, planets and starfields.', 110),
  ('industrial', 'Industrial', 'Factories, warehouses and raw metal.', 120),
  ('abstract', 'Abstract', 'Non-literal shapes, color and texture.', 130)
) AS seed("key", "label", "description", "sortOrder")
WHERE NOT EXISTS (
  SELECT 1 FROM "elements_scenes" existing
  WHERE existing."id" = 'c' || substr(md5('elements_scenes:' || seed."key"), 1, 24)
    OR (existing."organizationId" IS NULL AND existing."key" = seed."key")
);

-- elements_cameras
INSERT INTO "elements_cameras" ("id", "organizationId", "key", "label", "description", "isDeleted", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'c' || substr(md5('elements_cameras:' || seed."key"), 1, 24), NULL, seed."key", seed."label", seed."description", false, true, seed."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('eye-level', 'Eye Level', 'Neutral framing at the subject eye line.', 0),
  ('close-up', 'Close-up', 'Tight framing that fills the frame with the subject.', 10),
  ('wide-angle', 'Wide Angle', 'Expansive framing that captures the whole environment.', 20),
  ('establishing', 'Establishing Shot', 'Wide opening shot that sets location and context.', 30),
  ('portrait', 'Portrait', 'Flattering head-and-shoulders framing.', 40),
  ('macro', 'Macro', 'Extreme close detail on very small subjects.', 50),
  ('telephoto', 'Telephoto', 'Compressed perspective from a long distance.', 60),
  ('low-angle', 'Low Angle', 'Shot from below to make the subject feel powerful.', 70),
  ('high-angle', 'High Angle', 'Shot from above to make the subject feel small.', 80),
  ('dutch-angle', 'Dutch Angle', 'Tilted horizon for unease and energy.', 90),
  ('drone', 'Drone', 'Aerial view from a flying camera.', 100),
  ('tilt-shift', 'Tilt-Shift', 'Selective focus that makes scenes look like miniatures.', 110),
  ('fisheye', 'Fisheye', 'Ultra-wide spherical distortion.', 120)
) AS seed("key", "label", "description", "sortOrder")
WHERE NOT EXISTS (
  SELECT 1 FROM "elements_cameras" existing
  WHERE existing."id" = 'c' || substr(md5('elements_cameras:' || seed."key"), 1, 24)
    OR (existing."organizationId" IS NULL AND existing."key" = seed."key")
);

-- elements_lenses
INSERT INTO "elements_lenses" ("id", "organizationId", "key", "label", "description", "isDeleted", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'c' || substr(md5('elements_lenses:' || seed."key"), 1, 24), NULL, seed."key", seed."label", seed."description", false, true, seed."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('35mm', '35mm', 'Natural wide-normal view, versatile for storytelling.', 0),
  ('50mm', '50mm', 'Classic standard lens close to human vision.', 10),
  ('85mm-portrait', '85mm Portrait', 'Flattering compression with creamy background blur.', 20),
  ('24mm-wide', '24mm Wide', 'Wide view with moderate perspective stretch.', 30),
  ('14mm-ultra-wide', '14mm Ultra Wide', 'Dramatic ultra-wide perspective.', 40),
  ('135mm-telephoto', '135mm Telephoto', 'Strong compression and shallow depth of field.', 50),
  ('100mm-macro', '100mm Macro', 'Sharp close-focus detail.', 60),
  ('anamorphic', 'Anamorphic', 'Widescreen cinema look with oval bokeh and horizontal flares.', 70),
  ('vintage-prime', 'Vintage Prime', 'Soft, characterful glass with gentle flare and falloff.', 80),
  ('fisheye', 'Fisheye', 'Curved ultra-wide distortion.', 90),
  ('tilt-shift', 'Tilt-Shift', 'Shifted focal plane for miniature effects.', 100)
) AS seed("key", "label", "description", "sortOrder")
WHERE NOT EXISTS (
  SELECT 1 FROM "elements_lenses" existing
  WHERE existing."id" = 'c' || substr(md5('elements_lenses:' || seed."key"), 1, 24)
    OR (existing."organizationId" IS NULL AND existing."key" = seed."key")
);

-- elements_lightings
INSERT INTO "elements_lightings" ("id", "organizationId", "key", "label", "description", "isDeleted", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'c' || substr(md5('elements_lightings:' || seed."key"), 1, 24), NULL, seed."key", seed."label", seed."description", false, true, seed."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('natural', 'Natural', 'Soft available daylight.', 0),
  ('golden-hour', 'Golden Hour', 'Warm low sun with long, glowing light.', 10),
  ('studio', 'Studio', 'Clean controlled studio lighting.', 20),
  ('soft', 'Soft', 'Diffused, flattering light with gentle shadows.', 30),
  ('dramatic', 'Dramatic', 'Strong directional light and deep shadow.', 40),
  ('cinematic', 'Cinematic', 'Motivated, contrasty light shaped like a film set.', 50),
  ('neon', 'Neon', 'Colorful glowing signage and saturated accents.', 60),
  ('backlit', 'Backlit', 'Light from behind creating glow and silhouette.', 70),
  ('rim-light', 'Rim Light', 'Bright edge light separating the subject from the background.', 80),
  ('high-key', 'High Key', 'Bright, low-contrast and airy.', 90),
  ('low-key', 'Low Key', 'Dark, high-contrast with sculpted highlights.', 100),
  ('candlelight', 'Candlelight', 'Warm flickering low light.', 110),
  ('moonlight', 'Moonlight', 'Cool, silvery night light.', 120),
  ('fluorescent', 'Fluorescent', 'Flat, slightly green overhead light.', 130)
) AS seed("key", "label", "description", "sortOrder")
WHERE NOT EXISTS (
  SELECT 1 FROM "elements_lightings" existing
  WHERE existing."id" = 'c' || substr(md5('elements_lightings:' || seed."key"), 1, 24)
    OR (existing."organizationId" IS NULL AND existing."key" = seed."key")
);

-- elements_camera_movements
INSERT INTO "elements_camera_movements" ("id", "organizationId", "key", "label", "description", "isDeleted", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'c' || substr(md5('elements_camera_movements:' || seed."key"), 1, 24), NULL, seed."key", seed."label", seed."description", false, true, seed."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('static', 'Static', 'Locked-off camera with no movement.', 0),
  ('pan-left', 'Pan Left', 'Camera rotates left on a fixed position.', 10),
  ('pan-right', 'Pan Right', 'Camera rotates right on a fixed position.', 20),
  ('tilt-up', 'Tilt Up', 'Camera tilts upward.', 30),
  ('tilt-down', 'Tilt Down', 'Camera tilts downward.', 40),
  ('dolly-in', 'Dolly In', 'Camera glides toward the subject.', 50),
  ('dolly-out', 'Dolly Out', 'Camera glides away from the subject.', 60),
  ('tracking', 'Tracking', 'Camera follows the subject alongside its motion.', 70),
  ('orbit', 'Orbit', 'Camera circles around the subject.', 80),
  ('crane-up', 'Crane Up', 'Camera rises smoothly like on a crane.', 90),
  ('handheld', 'Handheld', 'Organic, slightly shaky handheld feel.', 100),
  ('zoom-in', 'Zoom In', 'Lens zooms in on the subject.', 110),
  ('zoom-out', 'Zoom Out', 'Lens zooms out to reveal more.', 120),
  ('drone-flyover', 'Drone Flyover', 'Aerial pass moving over the scene.', 130),
  ('whip-pan', 'Whip Pan', 'Fast pan that blurs into a transition.', 140)
) AS seed("key", "label", "description", "sortOrder")
WHERE NOT EXISTS (
  SELECT 1 FROM "elements_camera_movements" existing
  WHERE existing."id" = 'c' || substr(md5('elements_camera_movements:' || seed."key"), 1, 24)
    OR (existing."organizationId" IS NULL AND existing."key" = seed."key")
);

-- elements_sounds
INSERT INTO "elements_sounds" ("id", "organizationId", "key", "label", "description", "isDeleted", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT 'c' || substr(md5('elements_sounds:' || seed."key"), 1, 24), NULL, seed."key", seed."label", seed."description", false, true, seed."sortOrder", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('cinematic-score', 'Cinematic Score', 'Sweeping film-style score.', 0),
  ('ambient', 'Ambient', 'Soft atmospheric pads and textures.', 10),
  ('upbeat-electronic', 'Upbeat Electronic', 'Driving, bright electronic beat.', 20),
  ('orchestral', 'Orchestral', 'Full orchestra with strings and brass.', 30),
  ('lofi', 'Lo-fi', 'Relaxed, dusty lo-fi beats.', 40),
  ('acoustic', 'Acoustic', 'Warm acoustic guitar and organic instruments.', 50),
  ('dramatic-tension', 'Dramatic Tension', 'Low drones and rising suspense.', 60),
  ('epic-percussion', 'Epic Percussion', 'Big drums and trailer-style hits.', 70),
  ('retro-synth', 'Retro Synth', 'Analog synthwave sound.', 80),
  ('nature-ambience', 'Nature Ambience', 'Birds, wind, water and open air.', 90),
  ('city-ambience', 'City Ambience', 'Traffic, crowds and urban hum.', 100),
  ('silence', 'Silence', 'No music or sound design.', 110)
) AS seed("key", "label", "description", "sortOrder")
WHERE NOT EXISTS (
  SELECT 1 FROM "elements_sounds" existing
  WHERE existing."id" = 'c' || substr(md5('elements_sounds:' || seed."key"), 1, 24)
    OR (existing."organizationId" IS NULL AND existing."key" = seed."key")
);
