import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { pageSize } from "@/utils/pagination";

export const peopleOrderedByName = async (search: string, page: number) => {
  const schema =
    new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "public";

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("Invalid database schema");
  }

  const users = Prisma.raw(`"${schema}"."User"`);
  const lists = Prisma.raw(`"${schema}"."Wishlist"`);
  const pattern = `%${search}%`;

  // Order by the name shown on the card before paginating, including username fallbacks.
  return prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT person."id"
    FROM ${users} AS person
    WHERE person."emailVerified" = true
      AND EXISTS (
        SELECT 1 FROM ${lists} AS list
        WHERE list."ownerId" = person."id"
          AND list."publication" = 'PUBLISHED'
          AND list."visibility" = 'PUBLIC'
          AND list."archivedAt" IS NULL
      )
      AND (person."name" ILIKE ${pattern} OR person."username" ILIKE ${pattern})
    ORDER BY LOWER(COALESCE(person."name", person."username")), person."username"
    LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}
  `);
};
