import { Parser } from "htmlparser2";
import { publicRemoteUrl } from "./remote-resource";

const imageValues = (
  input: unknown,
  references: Map<string, unknown>,
  depth = 0,
): string[] => {
  if (depth > 4) return [];
  if (typeof input === "string")
    return references.has(input)
      ? imageValues(references.get(input), references, depth + 1)
      : input.startsWith("#")
        ? []
        : [input];
  if (Array.isArray(input))
    return input.flatMap((value) => imageValues(value, references, depth + 1));
  if (input && typeof input === "object") {
    const image = input as Record<string, unknown>;
    return imageValues(
      image.contentUrl ?? image.url ?? image["@id"],
      references,
      depth + 1,
    );
  }
  return [];
};

const structuredImages = (text: string) => {
  try {
    const queue: unknown[] = [JSON.parse(text)];
    const images: string[] = [];
    const references = new Map<string, unknown>();
    for (let index = 0; index < queue.length && index < 4096; index += 1) {
      const value = queue[index];
      if (!value || typeof value !== "object") continue;
      const node = value as Record<string, unknown>;
      if (typeof node["@id"] === "string" && (node.contentUrl || node.url))
        references.set(node["@id"], node);
      for (const child of Object.values(node)) {
        if (queue.length >= 4096) break;
        if (child && typeof child === "object") queue.push(child);
      }
    }
    for (const value of queue) {
      if (!value || typeof value !== "object") continue;
      const node = value as Record<string, unknown>;
      const types = [node["@type"]].flat();
      if (
        types.some(
          (type) =>
            typeof type === "string" &&
            /(?:^|[/#])(Product|ProductGroup|Book)$/.test(type),
        )
      ) {
        images.push(...imageValues(node.image, references));
      }
    }
    return images;
  } catch {
    return [];
  }
};

export const previewImageUrls = (html: string, pageUrl: URL) => {
  const openGraph: string[] = [];
  const twitter: string[] = [];
  const structured: string[] = [];
  const product: string[] = [];
  const linked: string[] = [];
  let json = "";
  let readingJson = false;
  let baseUrl: URL | undefined;
  const amazon =
    /(^|\.)amazon\.(de|com|co\.uk|fr|it|es|nl|se|pl|com\.be|ie)$/.test(
      pageUrl.hostname,
    );
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === "base" && attributes.href && !baseUrl) {
        try {
          baseUrl = publicRemoteUrl(attributes.href.trim(), pageUrl);
        } catch {
          /* Ignore unusable document bases. */
        }
      }
      if (name === "script") {
        readingJson = attributes.type?.toLowerCase() === "application/ld+json";
        json = "";
      }
      if (name === "meta" && attributes.content) {
        const property = (
          attributes.property ??
          attributes.name ??
          ""
        ).toLowerCase();
        if (
          ["og:image", "og:image:url", "og:image:secure_url"].includes(property)
        ) {
          openGraph.push(attributes.content);
        } else if (["twitter:image", "twitter:image:src"].includes(property)) {
          twitter.push(attributes.content);
        }
        if (attributes.itemprop?.split(/\s+/).includes("image"))
          product.push(attributes.content);
      }
      if (
        name === "link" &&
        attributes.rel?.split(/\s+/).includes("image_src") &&
        attributes.href
      ) {
        linked.push(attributes.href);
      }
      if (name === "img") {
        if (attributes.itemprop?.split(/\s+/).includes("image")) {
          product.push(attributes["data-src"] ?? attributes.src ?? "");
        }
        if (amazon && ["landingImage", "imgBlkFront"].includes(attributes.id)) {
          product.push(attributes["data-old-hires"] ?? "");
          try {
            const dynamic = JSON.parse(
              attributes["data-a-dynamic-image"] ?? "{}",
            );
            if (
              dynamic &&
              typeof dynamic === "object" &&
              !Array.isArray(dynamic)
            ) {
              product.push(...Object.keys(dynamic));
            }
          } catch {
            // Invalid optional image metadata does not invalidate the src fallback.
          }
          product.push(attributes.src ?? "");
        }
      }
    },
    ontext(text) {
      if (readingJson) json += text;
    },
    onclosetag(name) {
      if (name === "script" && readingJson) {
        structured.push(...structuredImages(json));
        readingJson = false;
      }
    },
  });
  parser.end(html);
  const seen = new Set<string>();
  return [...openGraph, ...structured, ...twitter, ...product, ...linked]
    .flatMap((input) => {
      try {
        if (!input.trim()) return [];
        const url = publicRemoteUrl(input.trim(), baseUrl ?? pageUrl);
        if (seen.has(url.href)) return [];
        seen.add(url.href);
        return [url];
      } catch {
        return [];
      }
    })
    .slice(0, 6);
};
