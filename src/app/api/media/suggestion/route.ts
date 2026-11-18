import { z } from "zod";
import { getAuth } from "@/features/auth/actions/get-auth";
import { limitSourceRequest } from "@/features/auth/service/request-limit";
import { AuthError, consumeRateLimit } from "@/features/auth/service/security";
import { suggestRemoteImage } from "@/features/media/service/remote-image";
import { RemoteResourceError } from "@/features/media/service/remote-resource";
import { manageableLists } from "@/features/wishlist/service/access";
import { wishlistIdSchema } from "@/features/wishlist/service/schemas";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 30;

const inputSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  listId: wishlistIdSchema,
});
const headers = {
  "Cache-Control": "private, no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

export const POST = async (request: Request) => {
  const origin = process.env.APP_URL;
  if (!origin || request.headers.get("origin") !== new URL(origin).origin) {
    return new Response(null, { status: 403, headers });
  }
  const { user } = await getAuth();
  if (!user?.emailVerified) return new Response(null, { status: 401, headers });

  try {
    await limitSourceRequest("image-suggestion", 100);
    await consumeRateLimit("image-suggestion", user.id, 60, 60 * 60 * 1000);
    const reader = request.body?.getReader();
    if (!reader) return new Response(null, { status: 400, headers });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return new Response(null, { status: 413, headers });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const parsed = inputSchema.safeParse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    if (!parsed.success) return new Response(null, { status: 400, headers });
    const list = await prisma.wishlist.findFirst({
      where: { id: parsed.data.listId, ...manageableLists(user.id) },
      select: { id: true },
    });
    if (!list) return new Response(null, { status: 403, headers });

    const image = await suggestRemoteImage(
      parsed.data.url,
      AbortSignal.any([request.signal, AbortSignal.timeout(18_000)]),
    );
    return image
      ? new Response(new Uint8Array(image.data), {
          headers: { ...headers, "Content-Type": image.contentType },
        })
      : new Response(null, { status: 204, headers });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return new Response(null, { status: 400, headers });
    }
    if (error instanceof AuthError) {
      return Response.json(
        { reason: "rate_limited" },
        { status: 429, headers },
      );
    }
    if (error instanceof RemoteResourceError) {
      return Response.json(
        {
          reason: error.reason,
          upstreamStatus: error.upstreamStatus,
          retryAfter: error.retryAfter,
        },
        { status: error.reason === "invalid_url" ? 422 : 200, headers },
      );
    }
    return Response.json({ reason: "unavailable" }, { headers });
  }
};
