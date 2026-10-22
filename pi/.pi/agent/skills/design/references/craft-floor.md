# Craft floor

Minimum checks for any UI you build or edit, plus the defaults that make AI-built pages look generated. Load this once the design direction is settled, and build without announcing the checklist. An explicit brief, brand guide, or existing design system overrides anything here; your own habit does not.

## Verify

Each item is a check on the built result, not an intention. Run them together in one pass over the rendered page.

- **Contrast:** body and placeholder text at least 4.5:1, large text at least 3:1. On colored surfaces, tint secondary text from that hue or the foreground; never gray.
- **Depth:** shadows have an offset and a soft blur. A zero-offset colored halo is decoration, not depth.
- **Spacing:** tight groups, generous separation, more space above a heading than below it. Read the computed values.
- **Type:** body measure 65-75ch, display text at most 6rem, letter-spacing no tighter than -0.04em (-0.02 to -0.03em usually reads better), balanced headings, obvious steps in size and weight. Run the real copy at every breakpoint and fix what overflows.
- **Motion:** one authored moment, not scattered effects and not the same entrance on every section. Ease out from an already-visible default. Follow the performance rules in SKILL.md: `transform` and `opacity` first, blur under 20px.
- **States:** hover, disabled, loading, error, and empty, plus real content, working controls, responsive composition, and keyboard focus.
- **Browser surfaces:** text selection, the caret, custom scrollbars, focus rings, underline offset, and numerals in tabular data all ship with browser defaults. Theme them from the palette. This is the cheapest sign that a page was built rather than assembled, and the one models skip most often.
- **Copy:** the product's own language. Controls name their action; errors name the problem and the way out.
- **Coverage:** every requirement in the brief is present and findable within seconds.

## Refuse

These are the category's defaults. The brief's own words can earn any of them back, except where marked. Reaching for one when nothing asked for it means you were not deciding; once you notice, rewrite the element instead of softening it.

Page structure:

- Same-size cards of icon plus heading plus text as the page structure. Cards are the lazy container. Nested cards are always wrong.
- The hero-metric template: big number, small label, supporting stats, accent color.
- A kicker or eyebrow label above a heading. No brief earns this back: delete the label and let the heading carry its own weight.
- Section numbers (01 / 02 / 03) unless the sequence carries information the reader needs.
- A modal for a task that needs neither interruption nor protected focus.

Surface habits:

- Gradient text. Emphasis comes from weight or size.
- Glass and blur as decoration rather than as a specific effect.
- A colored `border-left` or `border-right` over 1px on cards, list items, callouts, or alerts.
- Hard offset shadows (`box-shadow: 4px 4px 0`) outside a design that is actually neobrutalist.
- A 1px border under a wide soft shadow (the "ghost card"). Pick one: border or shadow.
- Card radii outside 12-16px. Full pills are for small controls only.
- Sparklines, progress rings, and soft-shadowed rounded rectangles standing in for content.
- Monospace as a costume for "technical" rather than for code, data, or measurements.
- A system display face (Impact, Arial Black, the platform sans) as the display voice of a branded page. Self-host a face whose character fits.
- Unicode glyphs or emoji standing in for icons. Use one real icon set (for shadcn projects, `lucide-react`) in one stroke weight.
- Geometric masks (circles, polygons, radial-gradient cutouts) approximating the edge of a photographed subject. Use a real cut-out asset or omit the effect.
- Sketch-style SVG illustrations, doodle classes, and `feTurbulence` grain. Crisp vector shapes, diagrams, and animated linework are fine.
- Striped (`repeating-linear-gradient`) or grid-overlay backgrounds unless the subject is a canvas, map, blueprint, or measuring tool.
- Light or dark theme picked by category. Pick it from the use scene: who uses it, where, under what light.
- Made-up claims, metrics, or configuration. Use supplied facts and label placeholder values as placeholders.

The floor covers the mechanics; it never picks the direction. With every check passing, spend the effort on the design itself.

---

Adapted from Impeccable (`skill/reference/craft-floor.md`), Copyright Paul Bakaus, Apache-2.0. Changes: removed detector-rule markers, hook and visual-world references; merged the Codex-specific rules; aligned motion advice with this skill's performance rules; added the shadcn icon note. See [../NOTICE](../NOTICE).
