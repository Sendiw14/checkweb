import { describe, expect, it } from "vitest";
import { TOKENS } from "@/lib/design-tokens";

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
export const ratio = (a: string, b: string) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
};

const c = TOKENS.color;

/** [foreground, background, minimum ratio, note]. 4.5 = WCAG AA body text, 3 = large text / UI components. */
const PAIRS: [string, string, number, string][] = [
  [c.ink, c.surface, 4.5, "headings on white"],
  [c.ink, c.cloud, 4.5, "headings on cloud"],
  [c.ink, c.subtle, 4.5, "headings on alt surface"],
  [c.body, c.surface, 4.5, "body on white"],
  [c.body, c.cloud, 4.5, "body on cloud"],
  [c.body, c.subtle, 4.5, "body on alt surface"],
  [c.quiet, c.surface, 4.5, "secondary on white"],
  [c.quiet, c.cloud, 4.5, "secondary on cloud"],
  [c.quiet, c.subtle, 4.5, "secondary on alt surface"],
  [c.quiet, c.brandSoft, 4.5, "secondary on soft blue"],
  [c.body, c.tealSoft, 4.5, "body on soft teal"],
  [c.brand, c.surface, 4.5, "links/brand text on white"],
  [c.brand, c.brandSoft, 4.5, "brand text on soft blue"],
  [c.surface, c.brand, 4.5, "white text on primary button"],
  [c.surface, c.brandDeep, 4.5, "white text on pressed primary"],
  [c.teal, c.surface, 4.5, "teal text on white"],
  [c.teal, c.tealSoft, 4.5, "teal text on soft teal"],
  [c.success, c.successSoft, 4.5, "success text on success surface"],
  [c.warning, c.warningSoft, 4.5, "warning text on warning surface"],
  [c.danger, c.dangerSoft, 4.5, "error text on error surface"],
  [c.success, c.surface, 4.5, "success text on white"],
  [c.warning, c.surface, 4.5, "warning text on white"],
  [c.danger, c.surface, 4.5, "error text on white"],
  [c.surface, c.danger, 4.5, "white on destructive button"],
  // Non-text UI: borders of inputs must reach 3:1 against their surface (WCAG 1.4.11).
  [c.inputBorder, c.surface, 3, "form control border"],
  [c.brand, c.surface, 3, "focus ring"],
];

describe("design token contrast (WCAG 2.2 AA)", () => {
  for (const [fg, bg, min, note] of PAIRS) {
    it(`${note}: ${fg} on ${bg} >= ${min}:1`, () => {
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min);
    });
  }

  it("documents combinations that must not be used for text", () => {
    // Use `body` (not `quiet`) on the soft teal surface.
    expect(ratio(c.quiet, c.tealSoft)).toBeLessThan(4.5);
    // #98A2B3 is the specified "muted" colour. It is fine for decoration/disabled UI only.
    expect(ratio(c.faint, c.surface)).toBeLessThan(4.5);
  });
});
