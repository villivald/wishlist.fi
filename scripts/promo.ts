import { config } from "dotenv";
import { parseArgs } from "node:util";
import { z } from "zod";

config({ path: [".env.local", ".env"], quiet: true });

const { issuePromo, listPromos, revokePromo } =
  await import("../src/features/premium/service/promotions");
const { prisma } = await import("../src/lib/prisma");

const help = `Promo administration (uses the configured database):
  npm run promo -- create --label "Trial" --days 30 --uses 1 --valid-for-days 7
  npm run promo -- create --label "Print campaign" --code WISHLIST30 --days 30 --uses 1000 --valid-for-days 365
  npm run promo -- list --page 1
  npm run promo -- revoke --id PROMO_ID

Create prints the code once. Save it privately; only its hash is stored.
Optional --code selects a public campaign code; omit it for a random private code.
Revoke stops new redemptions without removing previously granted access.`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean" },
      label: { type: "string" },
      code: { type: "string" },
      days: { type: "string" },
      uses: { type: "string" },
      "valid-for-days": { type: "string" },
      id: { type: "string" },
      page: { type: "string" },
    },
  });
  const command = positionals[0];
  const allowed =
    command === "create"
      ? ["label", "code", "days", "uses", "valid-for-days"]
      : command === "list"
        ? ["page"]
        : command === "revoke"
          ? ["id"]
          : [];

  if (values.help || !command) {
    console.log(help);
  } else if (
    positionals.length !== 1 ||
    Object.keys(values).some((key) => !allowed.includes(key))
  ) {
    throw new Error("Invalid arguments");
  } else if (command === "create") {
    const promo = await issuePromo({
      label: values.label,
      code: values.code,
      durationDays: Number(values.days),
      maxRedemptions: Number(values.uses),
      validForDays: Number(values["valid-for-days"]),
    });
    console.log(JSON.stringify(promo, null, 2));
  } else if (command === "list") {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(1000)
      .parse(values.page ?? 1);
    console.log(JSON.stringify(await listPromos(page), null, 2));
  } else if (command === "revoke") {
    const id = z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .parse(values.id);
    await revokePromo(id);
    console.log("Code revoked. Existing Premium periods are unchanged.");
  } else {
    throw new Error("Unknown command");
  }
} catch {
  console.error(
    "Promo operation failed. Check the arguments, database configuration, and migrations. Use --help for usage.",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
