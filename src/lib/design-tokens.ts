/**
 * Single source of truth for raw design values. globals.css mirrors these as CSS
 * variables; tests/unit/contrast.test.ts verifies the combinations we actually use.
 */
export const TOKENS = {
  color: {
    // surfaces
    surface: "#FFFFFF",
    cloud: "#F8FAFC",
    subtle: "#F1F5F9",
    line: "#E4E7EC",
    // control borders need 3:1 on white (WCAG 1.4.11), so they are darker than hairlines
    inputBorder: "#8A94A6",
    // text
    ink: "#172B4D",
    body: "#344054",
    quiet: "#667085",
    faint: "#98A2B3",
    // brand
    brand: "#2457C5",
    brandDeep: "#1D429A",
    brandSoft: "#EFF6FF",
    teal: "#0F766E",
    tealSoft: "#E0F2F1",
    // status
    success: "#166534",
    successSoft: "#ECFDF3",
    warning: "#92400E",
    warningSoft: "#FFFAEB",
    danger: "#B42318",
    dangerSoft: "#FEF3F2",
  },
  /** 4px base unit; Tailwind's --spacing is 0.25rem. */
  spacingUnitPx: 4,
  radius: { sm: 6, md: 8, lg: 12, xl: 16 },
  motion: {
    duration: { instant: 0.12, fast: 0.18, base: 0.24, slow: 0.4 },
    ease: { out: [0.2, 0.8, 0.2, 1], inOut: [0.65, 0, 0.35, 1], spring: { type: "spring", stiffness: 420, damping: 34 } },
  },
  breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1440 },
} as const;
