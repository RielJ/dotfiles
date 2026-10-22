# Distill: strip to the essence

Remove what doesn't earn its place: redundant elements, repeated information, decorative noise, cosmetic complexity. Simplicity removes obstacles between users and their goals; it doesn't remove features.

## Assess

1. **Find the sources of complexity:**
   - too many elements: competing buttons, redundant information, visual clutter;
   - variation without purpose: too many colors, fonts, sizes, styles;
   - everything visible at once, with no progressive disclosure;
   - visual noise: borders, shadows, and backgrounds that serve nothing;
   - unclear hierarchy;
   - too many options, actions, or paths.
2. **Find the essence:** What is the one primary user goal? What is necessary versus nice to have? What can be removed, hidden, or combined?

If the primary goal isn't clear from the code, ask instead of guessing.

## Plan

State the core purpose, the essential elements, what moves behind progressive disclosure, and what gets combined.

## Simplify

### Information architecture

- Cut secondary actions, optional features, and repeated information.
- Hide complexity behind clear entry points: disclosure, tabs, step-through flows.
- One primary action, a few secondary ones, everything else tertiary or hidden.

### Visual

- One or two colors plus neutrals, not five to seven.
- One font family, three or four sizes, two or three weights.
- Remove borders, shadows, and backgrounds that don't serve hierarchy or function.
- Flatten nesting. Never nest cards. Use spacing and alignment instead of cards for basic layout.
- One spacing scale.

### Layout

- Prefer simple vertical flow to complex grids where it works.
- Move secondary sidebar content inline or hide it.
- Pick left or center alignment and keep it.
- Give content room.

### Interaction

- Fewer buttons and options, and one obvious next action.
- Smart defaults: ask only when necessary.
- Inline editing instead of modal flows where possible.
- Remove steps.

### Copy

- Halve every sentence, then try again.
- Active voice: "Save changes", not "Changes will be saved".
- Plain language, no jargon, no marketing filler.
- Say it once: no header restating the intro.

### Code

- Delete dead CSS, unused components, and orphaned files.
- Flatten component trees and merge near-identical styles.
- Cut variants: three usually cover 90% of cases.

## Never

- Remove functionality users need.
- Sacrifice accessibility: labels and ARIA stay.
- Simplify into ambiguity: minimal is not mysterious.
- Remove information users need to decide.
- Flatten hierarchy entirely; some things must stand out.
- Oversimplify a genuinely complex domain.

## Verify

- Tasks finish faster, and it's easier to tell what to do.
- Every necessary feature is still reachable.
- What matters most is obvious.

List any removed features or options with the reason, and say whether they need another access point.

---

Adapted from Impeccable (`skill/reference/distill.md`), Copyright Paul Bakaus, Apache-2.0. Changes: condensed; removed command hand-offs and harness-specific instructions. See [../NOTICE](../NOTICE).
