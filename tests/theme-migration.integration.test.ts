import { readFile } from "node:fs/promises";
import pg from "pg";
import { expect, it } from "vitest";
import { listThemeIds } from "@/features/premium/themes";
import { assertTestDatabase } from "../e2e/environment";

assertTestDatabase(process.env);

it("migrates saved draft themes and accepts every current theme without weakening the constraint", async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    // This connection-local table shadows Wishlist without modifying saved lists.
    await client.query(`CREATE TEMP TABLE "Wishlist" (
      id TEXT PRIMARY KEY,
      theme VARCHAR(20) NOT NULL DEFAULT 'classic',
      CONSTRAINT "Wishlist_theme_check" CHECK (theme IN (
        'classic', 'botanical', 'festive', 'minimal', 'birthday', 'wedding',
        'playful', 'mosaic', 'sunrise'
      ))
    )`);
    await client.query(`INSERT INTO "Wishlist" (id, theme) VALUES
      ('existing-mosaic', 'mosaic'), ('existing-sunrise', 'sunrise'),
      ('existing-botanical', 'botanical'), ('existing-classic', 'classic')`);
    await client.query(`CREATE FUNCTION pg_temp.review_theme_owner()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`);
    await client.query(`CREATE CONSTRAINT TRIGGER "Wishlist_owner_admin"
      AFTER UPDATE ON "Wishlist" DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION pg_temp.review_theme_owner()`);
    const migration = await readFile(
      new URL(
        "../prisma/migrations/20261114000200_final_archive_list_themes/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await client.query(migration);
    expect(
      (await client.query('SELECT * FROM "Wishlist" ORDER BY id')).rows,
    ).toEqual([
      { id: "existing-botanical", theme: "botanical" },
      { id: "existing-classic", theme: "classic" },
      { id: "existing-mosaic", theme: "geometry" },
      { id: "existing-sunrise", theme: "cosmic" },
    ]);
    for (const theme of listThemeIds) {
      await client.query('INSERT INTO "Wishlist" (id, theme) VALUES ($1, $2)', [
        `new-${theme}`,
        theme,
      ]);
    }
    for (const theme of ["mosaic", "sunrise", "unsupported"]) {
      await expect(
        client.query('INSERT INTO "Wishlist" (id, theme) VALUES ($1, $2)', [
          `invalid-${theme}`,
          theme,
        ]),
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "Wishlist_theme_check",
      });
    }
  } finally {
    await client.end();
  }
});
