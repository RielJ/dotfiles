# Typography system

Typography carries information, hierarchy, and voice. Improve it inside the product's existing identity; replace fonts only when the user asked for a new identity. For tracking and leading tables by size, see [web-craft.md](web-craft.md).

## Fit the surface

- **Marketing and landing pages:** display type may carry the voice. Use decisive size contrast and responsive scale where the layout benefits.
- **Product UI and reading surfaces:** stability, scanability, and measure come first. One well-tuned family and a fixed role scale are often right.

## Assess before editing

Answer each question with a file, selector, or computed value:

- **Fit:** Which faces, weights, and roles exist? Do they fit the product, or are they unexamined defaults? Is every family necessary?
- **Hierarchy:** Can heading, body, label, metadata, and data roles be told apart at a glance? Are adjacent sizes or weights too close to do different jobs?
- **Scale:** Is there a deliberate role scale, or a pile of arbitrary values (`text-[13px]`, `text-[15px]`)? Do repeated roles stay identical across screens and states?
- **Reading:** Does body copy stay within 45-75 characters per line? Are line height, paragraph rhythm, contrast, and tracking tuned to the face and width?
- **Stress:** What happens with long headings, translated text, 200% zoom, narrow containers, missing weights, and font fallback?
- **Delivery:** Are only used fonts and weights loaded? Do fallback metrics and the loading strategy avoid invisible text and layout shift?

## Set the system

Before editing, state the roles the interface needs, the contrast between them, the reading measure and density, which faces and weights are authoritative, and any performance, localization, or accessibility limits. Use the fewest roles and families that make the hierarchy unmistakable. Combine size, weight, space, and color instead of asking size alone to do everything. Name tokens by purpose (`--text-label`), not value (`--text-13`).

## Apply

- Body text at least 1rem (16px) on the web unless a dense role or platform convention justifies less. iOS Safari zooms focused inputs under 16px.
- Prose stays within 45-75ch. Wider lines need more line height.
- Light text on dark surfaces gets slightly more line height, a touch more tracking, and one step more weight if the face needs it.
- Tune line height to the face, width, and language, not a universal ratio.
- Use `font-variant-numeric: tabular-nums` for numbers in tables, counters, and prices.
- Load only used weights. Provide metric-compatible fallbacks (`next/font` does this automatically) and avoid blocking text.
- Marketing display type may scale with `clamp()`; keep dense product UI predictable.
- Respect browser zoom and user font settings.
- Mark paragraphs with spacing or first-line indent, not both.

Don't make type decorative at the cost of comprehension, and don't add a second family without a role only it can fill.

## Verify

- Primary, secondary, body, and metadata roles are recognizable without reading the words.
- Long text stays comfortable across widths and languages.
- Loading causes no visible reflow or invisible text.
- Zoom, focus, contrast, and narrow viewports remain usable.

Answer each item with rendered or source evidence, not a bare "yes".

---

Adapted from Impeccable (`skill/reference/typeset.md`), Copyright Paul Bakaus, Apache-2.0. Changes: removed visitor-mode, detector, live-mode, and native-platform sections; added Tailwind and `next/font` notes. See [../NOTICE](../NOTICE).
