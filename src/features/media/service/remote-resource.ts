import ipaddr from "ipaddr.js";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { connect } from "node:http2";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { type Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { MAX_IMAGE_BYTES } from "../types";

export const MAX_REMOTE_HTML_BYTES = 4 * 1024 * 1024;
export const REMOTE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/jpg",
]);

type ResourceFailure = "invalid_url" | "blocked" | "too_large" | "unsupported";
export class RemoteResourceError extends Error {
  constructor(
    public readonly reason: ResourceFailure,
    message: string,
    public readonly upstreamStatus?: number,
    public readonly retryAfter?: string,
  ) {
    super(message);
  }
}

export const isPublicAddress = (address: string) => {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.parse(address);
  return (
    parsed.range() === "unicast" &&
    (parsed.kind() === "ipv4" || parsed.match(ipaddr.parseCIDR("2000::/3")))
  );
};

export const publicRemoteUrl = (input: string, base?: URL) => {
  if (input.length > 2048 || /[\u0000-\u0020\u007f]/.test(input)) {
    throw new RemoteResourceError("invalid_url", "Invalid remote URL");
  }
  let url: URL;
  try {
    url = new URL(input, base);
  } catch {
    throw new RemoteResourceError("invalid_url", "Invalid remote URL");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    (!hostname.includes(".") && !isIP(hostname)) ||
    (isIP(hostname) && !isPublicAddress(hostname))
  ) {
    throw new RemoteResourceError("invalid_url", "Invalid remote URL");
  }
  url.hash = "";
  return url;
};

// Resolve only at connection time and give the socket the validated addresses.
// A separate preflight DNS check followed by a normal fetch permits DNS rebinding.
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  void lookup(hostname, { all: true, verbatim: true }).then(
    (addresses) => {
      if (
        !addresses.length ||
        addresses.some(({ address }) => !isPublicAddress(address))
      ) {
        callback(
          new RemoteResourceError("invalid_url", "Non-public remote address"),
          "",
        );
        return;
      }
      const eligible = options.family
        ? addresses.filter(({ family }) => family === options.family)
        : addresses;
      if (!eligible.length) {
        callback(new Error("No usable remote address"), "");
        return;
      }
      if (options.all) callback(null, eligible);
      else callback(null, eligible[0].address, eligible[0].family);
    },
    (error: Error) => callback(error, ""),
  );
};

type ResponseHeaders = Record<string, string | string[] | number | undefined>;
type RemoteResult =
  { redirect: string } | { body: Buffer; contentType: string; image: boolean };

const requestHeaders = (imageOnly: boolean, referrer?: URL) => ({
  accept: imageOnly
    ? "image/webp,image/png,image/jpeg,image/avif,image/gif;q=0.8"
    : "text/html,application/xhtml+xml,image/*;q=0.8",
  "accept-encoding": "gzip, deflate, br",
  "accept-language": "en-GB,en;q=0.9,fi;q=0.8",
  "user-agent": "Wishlist-Image-Preview/1.0",
  ...(imageOnly && referrer ? { referer: `${referrer.origin}/` } : {}),
});

const consumeResponse = async (
  stream: Readable,
  status: number,
  headers: ResponseHeaders,
  imageOnly: boolean,
  signal: AbortSignal,
): Promise<RemoteResult> => {
  try {
    if (
      [301, 302, 303, 307, 308].includes(status) &&
      typeof headers.location === "string"
    ) {
      return { redirect: headers.location };
    }
    if (status !== 200) {
      throw new RemoteResourceError(
        [401, 403, 429, 503].includes(status) ? "blocked" : "unsupported",
        "The remote site did not provide the resource",
        status,
        typeof headers["retry-after"] === "string"
          ? headers["retry-after"]
          : undefined,
      );
    }
    const contentType = String(headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const generic = [
      "",
      "application/octet-stream",
      "binary/octet-stream",
    ].includes(contentType);
    const image =
      REMOTE_IMAGE_TYPES.has(contentType) ||
      generic ||
      (imageOnly && contentType === "text/plain");
    const limit = image ? MAX_IMAGE_BYTES : MAX_REMOTE_HTML_BYTES;
    if (
      imageOnly
        ? !image
        : !image &&
          !["text/html", "application/xhtml+xml"].includes(contentType)
    ) {
      throw new RemoteResourceError(
        "unsupported",
        "Unsupported remote response",
      );
    }
    if (Number(headers["content-length"] ?? 0) > limit) {
      throw new RemoteResourceError("too_large", "Remote response too large");
    }
    const encoding = String(
      headers["content-encoding"] ?? "identity",
    ).toLowerCase();
    const decoder =
      encoding === "gzip"
        ? createGunzip()
        : encoding === "br"
          ? createBrotliDecompress()
          : encoding === "deflate"
            ? createInflate()
            : null;
    if (!decoder && encoding !== "identity") {
      throw new RemoteResourceError(
        "unsupported",
        "Unsupported response encoding",
      );
    }
    const chunks: Buffer[] = [];
    let encodedSize = 0;
    let decodedSize = 0;
    const wireLimit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        encodedSize += chunk.length;
        callback(
          encodedSize > limit
            ? new RemoteResourceError("too_large", "Remote response too large")
            : null,
          chunk,
        );
      },
    });
    const collector = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        decodedSize += chunk.length;
        if (decodedSize > limit) {
          callback(
            new RemoteResourceError("too_large", "Remote response too large"),
          );
          return;
        }
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    await pipeline(
      [stream, wireLimit, ...(decoder ? [decoder] : []), collector],
      { signal },
    );
    return { body: Buffer.concat(chunks), contentType, image };
  } finally {
    stream.destroy();
  }
};

const requestHttp1 = (
  url: URL,
  imageOnly: boolean,
  signal: AbortSignal,
  referrer?: URL,
) =>
  new Promise<RemoteResult>((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(
      url,
      {
        agent: false,
        lookup: publicLookup,
        signal,
        maxHeaderSize: 16 * 1024,
        headers: requestHeaders(imageOnly, referrer),
      },
      (response) => {
        void consumeResponse(
          response,
          response.statusCode ?? 0,
          response.headers,
          imageOnly,
          signal,
        ).then(resolve, reject);
      },
    );
    request.on("error", reject);
    request.end();
  });

// Some storefronts reject HTTP/1.1 requests but serve the same public page over HTTP/2.
// Each lookup uses a fresh session and the same validated DNS lookup as HTTP/1.1.
const requestHttps = (
  url: URL,
  imageOnly: boolean,
  signal: AbortSignal,
  referrer?: URL,
) =>
  new Promise<RemoteResult>((resolve, reject) => {
    signal.throwIfAborted();
    const session = connect(url.origin, {
      lookup: publicLookup,
      settings: { enablePush: false, maxHeaderListSize: 16 * 1024 },
      maxHeaderListPairs: 128,
    });
    let settled = false;
    const abort = () => finish(signal.reason);
    const finish = (error?: unknown, result?: RemoteResult) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      session.destroy();
      if (error) reject(error);
      else if (result) resolve(result);
    };
    signal.addEventListener("abort", abort, { once: true });
    session.once("error", finish);
    session.once("close", () => {
      if (!settled)
        finish(
          Object.assign(new Error("Remote session closed"), {
            code: "ERR_HTTP2_SESSION_CLOSED",
          }),
        );
    });
    session.once("connect", () => {
      if (signal.aborted) {
        abort();
        return;
      }
      if (session.alpnProtocol !== "h2") {
        settled = true;
        signal.removeEventListener("abort", abort);
        session.destroy();
        void requestHttp1(url, imageOnly, signal, referrer).then(
          resolve,
          reject,
        );
        return;
      }
      try {
        const stream = session.request({
          ":method": "GET",
          ":path": `${url.pathname}${url.search}`,
          ...requestHeaders(imageOnly, referrer),
        });
        stream.once("error", finish);
        stream.once("response", (headers) => {
          void consumeResponse(
            stream,
            Number(headers[":status"]),
            headers,
            imageOnly,
            signal,
          ).then((result) => finish(undefined, result), finish);
        });
        stream.end();
      } catch (error) {
        finish(error);
      }
    });
  });

export const readRemoteResource = async (
  input: URL,
  imageOnly: boolean,
  signal: AbortSignal,
  referrer?: URL,
) => {
  let url = input;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    signal.throwIfAborted();
    const checked = publicRemoteUrl(url.href);
    let result: RemoteResult;
    try {
      result = await (url.protocol === "https:" ? requestHttps : requestHttp1)(
        checked,
        imageOnly,
        signal,
        referrer,
      );
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error ? error.code : "";
      if (
        url.protocol !== "https:" ||
        signal.aborted ||
        ![
          "ERR_HTTP2_ERROR",
          "ERR_HTTP2_STREAM_ERROR",
          "ERR_HTTP2_SESSION_CLOSED",
          "ERR_HTTP2_GOAWAY_SESSION",
        ].includes(String(code))
      )
        throw error;
      result = await requestHttp1(checked, imageOnly, signal, referrer);
    }
    if (!("redirect" in result)) return { ...result, url };
    url = publicRemoteUrl(result.redirect, url);
  }
  throw new RemoteResourceError("unsupported", "Too many remote redirects");
};
