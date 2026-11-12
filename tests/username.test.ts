import { describe, expect, it } from "vitest";
import { usernameSchema } from "@/features/auth/service/schemas";
import { suggestUsername } from "@/features/auth/utils/username";

describe("optional email username suggestions", () => {
  it.each([
    ["maxim.villivald@gmail.com", "maxim-villivald"],
    ["Ada.Lovelace+shopping@example.test", "ada-lovelace"],
    ["Müller@example.test", "muller"],
    ["--reader__@example.test", "reader"],
    [`${"a".repeat(45)}@example.test`, "a".repeat(40)],
  ])("normalizes %s into an allowed username", (email, expected) => {
    expect(suggestUsername(email)).toBe(expected);
    expect(usernameSchema.safeParse(expected).success).toBe(true);
  });

  it.each(["", "a@example.test", "你好@example.test", "+tag@example.test"])(
    "offers no invalid suggestion for %s",
    (email) => expect(suggestUsername(email)).toBeUndefined(),
  );
});
