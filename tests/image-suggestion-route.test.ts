import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/media/suggestion/route";
import { AuthError } from "@/features/auth/service/security";
import { RemoteResourceError } from "@/features/media/service/remote-resource";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  limit: vi.fn(),
  sourceLimit: vi.fn(),
  list: vi.fn(),
  image: vi.fn(),
}));
vi.mock("@/features/auth/actions/get-auth", () => ({ getAuth: mocks.auth }));
vi.mock("@/features/auth/service/request-limit", () => ({
  limitSourceRequest: mocks.sourceLimit,
}));
vi.mock("@/features/auth/service/security", () => ({
  AuthError: class extends Error {},
  consumeRateLimit: mocks.limit,
}));
vi.mock("@/features/media/service/remote-image", () => ({
  suggestRemoteImage: mocks.image,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { wishlist: { findFirst: mocks.list } },
}));

const request = (
  body = JSON.stringify({
    listId: "list",
    url: "https://shop.example/product",
  }),
  origin = "http://localhost:3000",
) =>
  new Request("http://localhost:3000/api/media/suggestion", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body,
  });

beforeEach(() => {
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user", emailVerified: true } });
  mocks.list.mockResolvedValue({ id: "list" });
  mocks.image.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("image suggestion responses", () => {
  it("returns a private WebP preview or an empty no-image response", async () => {
    mocks.image.mockResolvedValueOnce({
      data: Buffer.from("prepared image"),
      contentType: "image/webp",
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("prepared image");
    expect((await POST(request())).status).toBe(204);
  });

  it("reports shop blocking as a lookup outcome with useful diagnostics", async () => {
    mocks.image.mockRejectedValueOnce(
      new RemoteResourceError("blocked", "Shop denied lookup", 429, "60"),
    );
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reason: "blocked",
      upstreamStatus: 429,
      retryAfter: "60",
    });
  });

  it.each(["too_large", "unsupported"] as const)(
    "reports %s without a generic 422",
    async (reason) => {
      mocks.image.mockRejectedValueOnce(
        new RemoteResourceError(reason, "Cannot use resource"),
      );
      const response = await POST(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ reason });
    },
  );

  it("distinguishes network failure from invalid URLs and account rate limits", async () => {
    mocks.image.mockRejectedValueOnce(new Error("Network failure"));
    const unavailable = await POST(request());
    expect(unavailable.status).toBe(200);
    expect(await unavailable.json()).toEqual({ reason: "unavailable" });
    mocks.image.mockRejectedValueOnce(
      new RemoteResourceError("invalid_url", "Private address"),
    );
    expect((await POST(request())).status).toBe(422);
    mocks.limit.mockRejectedValueOnce(new AuthError("Try later"));
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ reason: "rate_limited" });
  });

  it("rejects malformed and oversized requests before fetching a page", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request("x".repeat(4097)))).status).toBe(413);
    expect(mocks.image).not.toHaveBeenCalled();
  });

  it("requires the application origin, verified sign-in and list access", async () => {
    expect(
      (await POST(request(undefined, "https://other.example"))).status,
    ).toBe(403);
    mocks.auth.mockResolvedValueOnce({ user: null });
    expect((await POST(request())).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({
      user: { id: "user", emailVerified: false },
    });
    expect((await POST(request())).status).toBe(401);
    mocks.list.mockResolvedValueOnce(null);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.image).not.toHaveBeenCalled();
  });
});
