BEGIN;

ALTER TABLE "Wishlist" DROP CONSTRAINT "Wishlist_theme_check";

UPDATE "Wishlist"
SET "theme" = CASE "theme"
  WHEN 'mosaic' THEN 'geometry'
  WHEN 'sunrise' THEN 'cosmic'
END
WHERE "theme" IN ('mosaic', 'sunrise');

-- Finish deferred ownership checks before changing the table constraint.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_theme_check"
  CHECK ("theme" IN ('classic', 'botanical', 'festive', 'minimal', 'birthday', 'wedding', 'playful', 'geometry', 'cosmic'));

COMMIT;
