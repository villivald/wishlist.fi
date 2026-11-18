import { EventEmitter } from "node:events";
import type { IncomingMessage, RequestOptions } from "node:http";
import { Readable } from "node:stream";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewImageUrls } from "@/features/media/service/product-image-urls";
import { suggestRemoteImage } from "@/features/media/service/remote-image";
import {
  isPublicAddress,
  MAX_REMOTE_HTML_BYTES,
  publicLookup,
  publicRemoteUrl,
  readRemoteResource,
} from "@/features/media/service/remote-resource";
import { prepareImage } from "@/features/media/service/validation";
import { MAX_IMAGE_BYTES } from "@/features/media/types";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  request: vi.fn(),
  connect: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("node:https", () => ({ request: mocks.request }));
vi.mock("node:http2", () => ({ connect: mocks.connect }));

const remoteResponse = (
  contentType: string,
  body: Buffer | string,
  statusCode = 200,
  headers: Record<string, string> = {},
) => {
  mocks.request.mockImplementationOnce(
    (
      _url: URL,
      _options: RequestOptions,
      callback: (response: IncomingMessage) => void,
    ) => {
      const request = new EventEmitter();
      return Object.assign(request, {
        end() {
          const response = Object.assign(Readable.from([Buffer.from(body)]), {
            statusCode,
            headers: { "content-type": contentType, ...headers },
          });
          queueMicrotask(() => callback(response as IncomingMessage));
        },
      });
    },
  );
};

beforeEach(() => {
  mocks.request.mockReset();
  mocks.lookup.mockReset();
  mocks.connect.mockReset();
  mocks.connect.mockImplementation(() => {
    const session = Object.assign(new EventEmitter(), {
      alpnProtocol: "http/1.1",
      destroy: vi.fn(),
    });
    queueMicrotask(() => session.emit("connect"));
    return session;
  });
});

const remoteHttp2Response = (
  contentType: string,
  body: Buffer | string,
  status = 200,
  headers: Record<string, string> = {},
) => {
  const stream = Object.assign(Readable.from([Buffer.from(body)]), {
    end() {
      queueMicrotask(() =>
        stream.emit("response", {
          ":status": status,
          "content-type": contentType,
          ...headers,
        }),
      );
    },
  });
  const session = Object.assign(new EventEmitter(), {
    alpnProtocol: "h2",
    destroy: vi.fn(),
    request: vi.fn((_headers: Record<string, string>) => stream),
  });
  mocks.connect.mockImplementationOnce(() => {
    queueMicrotask(() => session.emit("connect"));
    return session;
  });
  return session;
};

describe("HTTP compatibility and response limits", () => {
  it("uses HTTP/2 with checked DNS, no cookies, and closes each session", async () => {
    const session = remoteHttp2Response("text/html", "<html>Product</html>");
    const result = await readRemoteResource(
      new URL("https://shop.example/item?a=1"),
      false,
      AbortSignal.timeout(1000),
    );
    expect(result.body.toString()).toBe("<html>Product</html>");
    expect(mocks.connect.mock.calls[0][1]).toMatchObject({
      lookup: publicLookup,
      settings: { enablePush: false },
    });
    expect(session.request).toHaveBeenCalledWith(
      expect.objectContaining({ ":path": "/item?a=1" }),
    );
    expect(session.request.mock.calls[0][0]).not.toHaveProperty("cookie");
    expect(session.destroy).toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("falls back to HTTP/1.1 when the server does not negotiate HTTP/2", async () => {
    remoteResponse("text/html", "<html>Legacy shop</html>");
    expect(
      (
        await readRemoteResource(
          new URL("https://shop.example/item"),
          false,
          AbortSignal.timeout(1000),
        )
      ).body.toString(),
    ).toContain("Legacy shop");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls[0][1].lookup).toBe(publicLookup);
  });

  it.each([
    ["gzip", gzipSync],
    ["br", brotliCompressSync],
    ["deflate", deflateSync],
  ] as const)(
    "decodes %s pages larger than the old 1 MB limit",
    async (encoding, compress) => {
      const body = `<html>${" ".repeat(1700000)}</html>`;
      remoteHttp2Response("text/html", compress(body), 200, {
        "content-encoding": encoding,
      });
      expect(
        (
          await readRemoteResource(
            new URL("https://shop.example/item"),
            false,
            AbortSignal.timeout(1000),
          )
        ).body.toString(),
      ).toBe(body);
    },
  );

  it("bounds decompressed data and rejects truncated compressed bodies", async () => {
    remoteHttp2Response(
      "text/html",
      gzipSync(Buffer.alloc(MAX_REMOTE_HTML_BYTES + 1)),
      200,
      { "content-encoding": "gzip" },
    );
    await expect(
      readRemoteResource(
        new URL("https://shop.example/item"),
        false,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow("too large");
    remoteHttp2Response(
      "text/html",
      gzipSync("<html>Product</html>").subarray(0, 12),
      200,
      { "content-encoding": "gzip" },
    );
    await expect(
      readRemoteResource(
        new URL("https://shop.example/item"),
        false,
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow();
  });

  it("checks HTTP/2 redirects and reports shop blocking without retrying it", async () => {
    remoteHttp2Response("text/html", "", 302, {
      location: "http://127.0.0.1/private",
    });
    await expect(
      suggestRemoteImage(
        "https://shop.example/item",
        AbortSignal.timeout(1000),
      ),
    ).rejects.toMatchObject({ reason: "invalid_url" });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    remoteHttp2Response("text/html", "Too many requests", 429, {
      "retry-after": "60",
    });
    await expect(
      suggestRemoteImage(
        "https://shop.example/item",
        AbortSignal.timeout(1000),
      ),
    ).rejects.toMatchObject({
      reason: "blocked",
      upstreamStatus: 429,
      retryAfter: "60",
    });
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });

  it("cancels a stalled HTTP/2 connection", async () => {
    const session = Object.assign(new EventEmitter(), { destroy: vi.fn() });
    mocks.connect.mockReturnValueOnce(session);
    const controller = new AbortController();
    const pending = suggestRemoteImage(
      "https://shop.example/item",
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(session.destroy).toHaveBeenCalled();
  });

  it("handles a session closing before a request can start", async () => {
    const session = remoteHttp2Response("text/html", "");
    session.request.mockImplementationOnce(() => {
      throw new Error("Session closed");
    });
    await expect(
      suggestRemoteImage(
        "https://shop.example/item",
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow("Session closed");
    expect(session.destroy).toHaveBeenCalled();
  });

  it("falls back once when HTTP/2 fails at the protocol level", async () => {
    mocks.connect.mockImplementationOnce(() => {
      const session = Object.assign(new EventEmitter(), { destroy: vi.fn() });
      queueMicrotask(() =>
        session.emit(
          "error",
          Object.assign(new Error("Protocol failure"), {
            code: "ERR_HTTP2_ERROR",
          }),
        ),
      );
      return session;
    });
    remoteResponse("text/html", "<html>HTTP/1 works</html>");
    expect(
      await suggestRemoteImage(
        "https://shop.example/item",
        AbortSignal.timeout(1000),
      ),
    ).toBeNull();
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("does not wait for the overall timeout when a session closes without a response", async () => {
    mocks.connect.mockImplementationOnce(() => {
      const session = Object.assign(new EventEmitter(), { destroy: vi.fn() });
      queueMicrotask(() => session.emit("close"));
      return session;
    });
    remoteResponse("text/html", "<html>Fallback</html>");
    expect(
      await suggestRemoteImage(
        "https://shop.example/item",
        AbortSignal.timeout(1000),
      ),
    ).toBeNull();
  });

  it("accepts mislabeled raster images after inspecting their bytes and sends only the page origin as referrer", async () => {
    remoteResponse(
      "text/html",
      '<meta property="og:image" content="https://cdn.example/image">',
    );
    const source = await sharp({
      create: { width: 30, height: 20, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    remoteResponse("application/octet-stream", source);
    const result = await suggestRemoteImage(
      "https://shop.example/item?private-token=do-not-forward",
      AbortSignal.timeout(1000),
    );
    expect(result!.data.equals(source)).toBe(true);
    expect(mocks.request.mock.calls[1][1].headers.referer).toBe(
      "https://shop.example/",
    );
  });
});

describe("remote image network boundaries", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "::ffff:127.0.0.1",
    "::ffff:8.8.8.8",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "64:ff9b::7f00:1",
    "invalid",
  ])("blocks non-public or transition address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "accepts public address %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );

  it.each([
    "file:///etc/passwd",
    "ftp://example.com/image",
    "http://localhost/",
    "http://127.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://[::1]/",
    "http://user:password@example.com/",
    "https://example.com:8080/",
    "http://example.com/\nprivate",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => publicRemoteUrl(url)).toThrow();
  });

  it("pins the checked DNS answers to the socket and rejects mixed public/private answers", async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }]);
    const result = await new Promise((resolve) =>
      publicLookup("shop.example", {}, (...args) => resolve(args)),
    );
    expect(result).toEqual([null, "1.1.1.1", 4]);
    mocks.lookup.mockResolvedValueOnce([
      { address: "1.1.1.1", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    const callback = vi.fn();
    publicLookup("shop.example", { all: true }, callback);
    await vi.waitFor(() => expect(callback).toHaveBeenCalled());
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(callback.mock.calls[0][1]).toBe("");
  });

  it("does not follow a redirect into an internal service", async () => {
    remoteResponse("text/html", "", 302, {
      location: "http://169.254.169.254/latest/meta-data",
    });
    await expect(
      suggestRemoteImage(
        "https://shop.example/item",
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("bounds redirect chains, body sizes, and rejected media types", async () => {
    for (let index = 0; index < 4; index += 1)
      remoteResponse("text/html", "", 302, { location: `/redirect-${index}` });
    await expect(
      suggestRemoteImage(
        "https://shop.example/item",
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow("redirects");
    remoteResponse("image/png", Buffer.alloc(MAX_IMAGE_BYTES + 1));
    await expect(
      suggestRemoteImage(
        "https://shop.example/image",
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow("too large");
    remoteResponse("text/html", Buffer.alloc(MAX_REMOTE_HTML_BYTES + 1));
    await expect(
      suggestRemoteImage(
        "https://shop.example/item",
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow("too large");
    remoteResponse("image/svg+xml", "<svg/>");
    await expect(
      suggestRemoteImage(
        "https://shop.example/image",
        AbortSignal.timeout(1000),
      ),
    ).rejects.toThrow("Unsupported");
  });
});

describe("product image discovery", () => {
  it("resolves document base URLs and referenced JSON-LD image objects", () => {
    const urls = previewImageUrls(
      `<base href="https://cdn.example/photos/">
      <script type="application/ld+json">{"@graph":[{"@type":"Product","image":{"@id":"#photo"}},{"@id":"#photo","@type":"ImageObject","contentUrl":"one.jpg"}]}</script>`,
      new URL("https://shop.example/item"),
    );
    expect(urls.map((url) => url.href)).toEqual([
      "https://cdn.example/photos/one.jpg",
    ]);
  });
  it("finds product images in JSON-LD graphs while skipping organisation logos and broken scripts", () => {
    const html = `<script type="application/ld+json">not JSON</script>
      <script type="application/ld+json">${JSON.stringify({
        "@graph": [
          { "@type": "Organization", image: "/logo.png" },
          {
            "@type": ["Thing", "Product"],
            image: [
              { "@type": "ImageObject", contentUrl: "/product.png" },
              "https://cdn.example/other.png",
            ],
          },
        ],
      })}</script>`;
    expect(
      previewImageUrls(html, new URL("https://shop.example/item")).map(
        (url) => url.href,
      ),
    ).toEqual([
      "https://shop.example/product.png",
      "https://cdn.example/other.png",
    ]);
  });

  it("finds Amazon's main product image without selecting unrelated page images", () => {
    const html = `<img src="/logo.png"><img id="landingImage" src="/small.jpg" data-old-hires="https://images.example/main.jpg"
      data-a-dynamic-image='{&quot;https://images.example/main.jpg&quot;:[1000,1000],&quot;https://images.example/medium.jpg&quot;:[500,500]}'>`;
    expect(
      previewImageUrls(html, new URL("https://www.amazon.de/dp/example")).map(
        (url) => url.href,
      ),
    ).toEqual([
      "https://images.example/main.jpg",
      "https://images.example/medium.jpg",
      "https://www.amazon.de/small.jpg",
    ]);
    expect(
      previewImageUrls(html, new URL("https://amazon.de.evil.example/item")),
    ).toEqual([]);
  });

  it("supports microdata, linked preview images and normalized deduplication", () => {
    expect(
      previewImageUrls(
        `<meta property="og:image" content="/one.jpg"><meta property="og:image:url" content="https://shop.example/one.jpg">
      <img itemprop="image" data-src="/two.jpg"><link rel="image_src" href="/three.jpg">`,
        new URL("https://shop.example/item"),
      ).map((url) => url.href),
    ).toEqual([
      "https://shop.example/one.jpg",
      "https://shop.example/two.jpg",
      "https://shop.example/three.jpg",
    ]);
  });
  it("parses escaped and relative metadata, prefers Open Graph and skips unsafe candidates", () => {
    const urls = previewImageUrls(
      `
      <!-- <meta property="og:image" content="https://wrong.example/comment.png"> -->
      <script>const example = '<meta property="og:image" content="https://wrong.example/script.png">';</script>
      <meta name="twitter:image" content="https://cdn.example/twitter.png">
      <meta CONTENT='/photo.jpg?a=1&amp;b=2' PROPERTY='og:image'>
      <meta property="og:image" content="http://127.0.0.1/private">
      <meta property="og:image:url" content="/photo.jpg?a=1&amp;b=2">
    `,
      new URL("https://shop.example/product"),
    );
    expect(urls.map((url) => url.href)).toEqual([
      "https://shop.example/photo.jpg?a=1&b=2",
      "https://cdn.example/twitter.png",
    ]);
  });

  it("preserves preview bytes until the normal save pipeline sanitizes and encodes them", async () => {
    const image = await sharp({
      create: { width: 120, height: 80, channels: 3, background: "blue" },
    })
      .withMetadata()
      .png()
      .toBuffer();
    remoteResponse("text/html", "", 302, { location: "/products/camera" });
    remoteResponse(
      "text/html; charset=utf-8",
      '<meta property="og:image" content="../camera.png">',
    );
    remoteResponse("image/png", image);
    const result = await suggestRemoteImage(
      "https://shop.example/item",
      AbortSignal.timeout(1000),
    );
    expect(result).toMatchObject({ width: 120, height: 80 });
    expect(result!.data.equals(image)).toBe(true);
    expect(result!.contentType).toBe("image/png");
    const saved = await prepareImage(result!.data, false);
    expect((await sharp(saved.data).metadata()).format).toBe("webp");
    expect((await sharp(saved.data).metadata()).exif).toBeUndefined();
    expect(mocks.request.mock.calls[2][0].href).toBe(
      "https://shop.example/camera.png",
    );
    expect(mocks.request.mock.calls[0][1]).toMatchObject({
      agent: false,
      lookup: publicLookup,
    });
    expect(mocks.request.mock.calls[0][1].headers).not.toHaveProperty("Cookie");
  });

  it("tries the next candidate after an unusable image and returns no suggestion for missing metadata", async () => {
    remoteResponse(
      "text/html",
      '<meta property="og:image" content="/invalid.png"><meta name="twitter:image" content="/valid.png">',
    );
    remoteResponse("image/png", "not an image");
    remoteResponse(
      "image/png",
      await sharp({
        create: { width: 10, height: 10, channels: 3, background: "blue" },
      })
        .png()
        .toBuffer(),
    );
    expect(
      await suggestRemoteImage(
        "https://shop.example/item",
        AbortSignal.timeout(1000),
      ),
    ).not.toBeNull();
    remoteResponse(
      "text/html",
      "<html><head><title>No image</title></head></html>",
    );
    expect(
      await suggestRemoteImage(
        "https://shop.example/other",
        AbortSignal.timeout(1000),
      ),
    ).toBeNull();
  });

  it("tries the next image after an individual timeout without cancelling the lookup", async () => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const shortenedTimeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => timeout(5));
    try {
      remoteResponse(
        "text/html",
        '<meta property="og:image" content="/slow.png"><meta name="twitter:image" content="/valid.png">',
      );
      mocks.request.mockImplementationOnce(
        (_url: URL, options: RequestOptions) => {
          const request = Object.assign(new EventEmitter(), {
            end() {
              options.signal?.addEventListener(
                "abort",
                () => request.emit("error", options.signal?.reason),
                { once: true },
              );
            },
          });
          return request;
        },
      );
      remoteResponse(
        "image/png",
        await sharp({
          create: { width: 10, height: 10, channels: 3, background: "blue" },
        })
          .png()
          .toBuffer(),
      );
      const controller = new AbortController();
      expect(
        await suggestRemoteImage(
          "https://shop.example/item",
          controller.signal,
        ),
      ).not.toBeNull();
      expect(controller.signal.aborted).toBe(false);
    } finally {
      shortenedTimeout.mockRestore();
    }
  });
});
