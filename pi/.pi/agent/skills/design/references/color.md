# Color system

Use color for hierarchy, meaning, and atmosphere. Keep confirmed brand and semantic colors; colorizing a UI is not a license to replace its identity.

## Fit the surface

- **Marketing and landing pages:** color may carry the voice and own large regions.
- **Product UI:** color mainly encodes action, selection, status, wayfinding, and reading hierarchy. A rare accent has more force.

## Audit before choosing

Read the theme tokens (for shadcn: the CSS variables in `globals.css`), assets, and representative states. Identify:

- which colors are confirmed brand commitments;
- the current surface, text, action, and status roles;
- places where grayscale hides hierarchy or state;
- contrast failures and color-only signals;
- light/dark and chart requirements;
- whether the task asks for more color or a new identity.

Ask only when a binding brand decision can't be inferred.

## Choose a strategy

Before editing, name the emotional temperature, the dominant color relationship, the contrast range, and how much color the surface carries. Then build roles, not a bag of swatches:

- canvas and elevated surfaces;
- primary and secondary text;
- action, focus, and selection;
- borders and separators;
- success, warning, error, and info;
- chart categories or scales when needed.

Use the project's existing color space. For a new web palette, prefer OKLCH: lightness and chroma adjust predictably (shadcn's current themes already use it). Choose the hue from the product's meaning, never from a category default ("fintech is blue").

## Apply at system scale

- Let the strongest color own a deliberate region or role instead of scattering small accents.
- Keep the primary action easy to find; don't spend its color on decoration.
- Tint neutrals only when the brand hue creates real cohesion. Neutral gray is valid.
- On colored surfaces, derive secondary text from the foreground or surface hue, not washed-out gray.
- Keep semantic meanings consistent, and follow platform and domain conventions.
- In charts, separate series by lightness, chroma, shape, label, or pattern too, so color is never the only code.
- Design dark mode surfaces and contrast explicitly; don't invert the light theme.
- With a token system, define primitive values and semantic tokens. A theme change should remap semantic roles.

## Contrast

| Content | WCAG AA minimum |
| --- | --- |
| Body text | 4.5:1 |
| Large text | 3:1 |
| Controls, icons, focus indicators | 3:1 |

Check computed pairs, not eyesight: interactive states, overlays, text on images, disabled content, and both themes. Simulate common color-vision deficiencies (Chrome DevTools > Rendering). Anything conveyed by color also needs text, shape, an icon, or position.

When deriving OKLCH ramps, vary lightness and reduce chroma near white and black. Prefer explicit colors over stacked translucent overlays, which make contrast depend on what sits underneath.

## Verify

- Every color has a stable role or a clear atmospheric purpose.
- Attention lands on the intended action, content, or state.
- The palette holds up in quiet, dense, interactive, error, and empty states.
- Light and dark themes are each designed, not inverted.
- Contrast and non-color cues pass in every relevant state.

---

Adapted from Impeccable (`skill/reference/colorize.md`), Copyright Paul Bakaus, Apache-2.0. Changes: removed visitor-mode and live-mode sections and DESIGN.md references; added shadcn and DevTools notes. See [../NOTICE](../NOTICE).
