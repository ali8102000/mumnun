-- Store the three dimensions already collected by the rating dialog.
ALTER TABLE public.ratings
  ADD COLUMN IF NOT EXISTS professionalism integer,
  ADD COLUMN IF NOT EXISTS punctuality integer,
  ADD COLUMN IF NOT EXISTS quality integer;

DO $$
BEGIN
  ALTER TABLE public.ratings
    ADD CONSTRAINT ratings_professionalism_range
    CHECK (professionalism IS NULL OR professionalism BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.ratings
    ADD CONSTRAINT ratings_punctuality_range
    CHECK (punctuality IS NULL OR punctuality BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.ratings
    ADD CONSTRAINT ratings_quality_range
    CHECK (quality IS NULL OR quality BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
