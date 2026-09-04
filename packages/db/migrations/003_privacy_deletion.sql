BEGIN;
SET search_path TO thiqah, public;

-- NULL is allowed by PostgreSQL CHECK constraints unless the expression is explicitly false.
-- We only relax NOT NULL so completed/cancelled customer records can be anonymized safely.
ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN contact_phone DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN contact_name DROP NOT NULL;

COMMIT;
