import { describe, expect, it } from "vitest";
import { detectImageType } from "@/server/storage/image-type";

const bytes = (...n: number[]) => Uint8Array.from(n);
const ascii = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

describe("detectImageType", () => {
  it("recognises JPEG, PNG and WebP by magic bytes", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toEqual({ ext: "jpg", mime: "image/jpeg" });
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({ ext: "png", mime: "image/png" });
    expect(detectImageType(Uint8Array.from([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")]))).toEqual({ ext: "webp", mime: "image/webp" });
  });
  it("rejects SVG, HTML, scripts, PDFs, GIFs and truncated data regardless of what the name claims", () => {
    for (const bad of [ascii("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), ascii("<!doctype html><script>"), ascii("%PDF-1.7"), ascii("GIF89a"), bytes(0xff, 0xd8), bytes(), ascii("RIFFxxxxWAVE")]) {
      expect(detectImageType(bad)).toBeNull();
    }
  });
});
