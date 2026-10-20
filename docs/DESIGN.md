# Design notes

White-first, calm, and precise: the interface should feel like a trustworthy instrument, not a marketing page.
Public pages explain; staff pages are dense but quiet. Tokens live in one place (`src/app/globals.css`, mirrored
for tests in `src/lib/design-tokens.ts`) and everything else consumes them.

## Palette (as specified) and the two deliberate additions

| Role | Token | Value |
|---|---|---|
| Surfaces | `surface` / `cloud` / `subtle` / `line` | `#FFFFFF` / `#F8FAFC` / `#F1F5F9` / `#E4E7EC` |
| Text | `ink` / `body` / `quiet` / `faint` | `#172B4D` / `#344054` / `#667085` / `#98A2B3` |
| Brand | `brand` / `brand-deep` / `brand-soft` | `#2457C5` / `#1D429A` / `#EFF6FF` |
| Accent | `teal` / `teal-soft` | `#0F766E` / `#E0F2F1` |
| Success | `success` / `success-soft` | `#166534` / `#ECFDF3` |
| Warning | `warning` / `warning-soft` | `#92400E` / `#FFFAEB` |
| Error | `danger` / `danger-soft` | `#B42318` / `#FEF3F2` |

Additions, both for accessibility rather than taste:

* **`input-border` `#8A94A6`.** The specified hairline `#E4E7EC` is 1.3:1 on white; WCAG 1.4.11 needs **3:1** for
  the boundary of a form control. Decorative dividers keep `#E4E7EC`.
* **`success-line` / `warning-line` / `danger-line`** are the soft borders of status surfaces.

## Contrast rules (enforced by `tests/unit/contrast.test.ts`, 26 pairs)

* Body, secondary and brand text pass **4.5:1** on every surface they are used on.
* **Do not use `quiet` on soft teal** (it is below 4.5:1): use `body`.
* **`faint` (`#98A2B3`) fails 4.5:1 for text.** It is for decoration and disabled states only. The test asserts that it *fails*, so nobody mistakes it for a text colour.
* Never reduce text opacity to make it "quieter" (`text-quiet/90` dropped a label to 4.07:1 and was caught by axe). Pick another token.
* Status is never colour alone: every badge pairs colour with an icon and a word.

## Type

Geist / Inter-class sans with a mono for serials. A named scale (Tailwind `@utility`), not ad-hoc sizes:
`text-display`, `text-title`, `text-heading`, `text-subheading`, `text-lead`, `text-small`, `text-caption`,
`text-label`, `text-eyebrow`, `text-metric`, `text-serial`. Serial numbers and codes use tabular, monospaced
figures with generous tracking so `0`/`O` and `1`/`I` are not confused. Sinhala and Tamil fallback fonts are in
the stack; the catalogs are intentionally empty until human-translated.

## Layout and space

* 4 px spacing grid. Radii: 4/6/8 for controls, **12–16 for cards**. Hairline borders over heavy shadows; shadows only for popovers.
* Mobile-first. Content never scrolls sideways: tables scroll **inside** their own focusable region; below 640 px, data grids become **cards** built from the same column definitions (with a sort control).
* Every grid defaults to a shrinkable track (`minmax(0, 1fr)`) so a long unbroken string cannot widen the page (a bug class the responsive tests caught repeatedly).
* Tap targets ≥ 24×24 CSS px (WCAG 2.2 AA), 44 px on coarse pointers for inputs.

## Motion

Subtle and purposeful: short fades and rises on route and result change, a drawn ring and a seal on the
verification result, a gentle scan line on the idle verify page. Durations 120–400 ms with ease-out curves.
`prefers-reduced-motion` removes movement (opacity-only). Motion never gates content: SSR output is fully visible
without script (animation is CSS-driven), and nothing important is conveyed by motion alone.

## Verification result design

The customer page is the product's face, so it is held to a higher standard than the admin:

* One answer, in a calm voice. A heading that states the fact, a lead that explains it, and a next step.
* Success is green only for *recognized* results and always carries the limits of what that means.
* Warnings (unusual pattern, on hold, not released, withdrawn) are amber/neutral and explain ordinary causes; **errors are reserved for "no longer valid", recalls, and unmatched codes**, never for outages.
* Outages and network failures are visually and verbally distinct from verdicts ("This does not mean the part is invalid").
* No accusation, no "fake", "fraud" or "counterfeit" on customer-facing screens (asserted by e2e tests).
* Recall text is shown verbatim as staff approved it; the interface never writes safety advice.

## Accessibility

Targeting **WCAG 2.2 AA**; axe (wcag2a/aa, 21a/aa, 22aa) runs in CI-ready e2e tests over every public page, every
verification outcome and every staff page with real data, on desktop and a phone viewport. Notable choices:
skip link, one `h1` per page, focus moves to the result heading after a check, results announced via live
regions, labels programmatically tied to inputs, dropdown menus follow the non-modal menu-button pattern, scroll
regions are keyboard-focusable, dialogs and sheets trap focus and **return it to whatever opened them** (`useRestoreFocus`; also when the opener was a menu item), and the account menu's accessible name contains
its visible text (WCAG 2.5.3). Automated checks do not replace a manual screen-reader and keyboard review; do one
before launch.
