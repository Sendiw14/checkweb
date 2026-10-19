import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (tailwind-merge with the custom type scale)", () => {
  it("keeps a custom font-size utility next to a colour class", () => {
    expect(cn("text-metric", "text-success")).toBe("text-metric text-success");
    expect(cn("text-caption font-medium", "text-quiet")).toBe("text-caption font-medium text-quiet");
    expect(cn("text-small", "text-danger")).toBe("text-small text-danger");
  });
  it("still lets a later size override an earlier one, and a later colour override a colour", () => {
    expect(cn("text-small", "text-caption")).toBe("text-caption");
    expect(cn("text-lg", "text-title")).toBe("text-title");
    expect(cn("text-ink", "text-danger")).toBe("text-danger");
  });
});
