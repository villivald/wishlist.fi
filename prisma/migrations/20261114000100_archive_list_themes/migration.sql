ALTER TABLE "Wishlist"
  DROP CONSTRAINT "Wishlist_theme_check",
  ADD CONSTRAINT "Wishlist_theme_check"
    CHECK ("theme" IN ('classic', 'botanical', 'festive', 'minimal', 'birthday', 'wedding', 'playful', 'mosaic', 'sunrise'));
