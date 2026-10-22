# Web craft: interruptibility, materials, typography, reduced motion, foundations

Web-relevant parts of Apple's design guidance (WWDC talks, mainly *Designing Fluid Interfaces*, *The Details of UI Typography*, and *Principles of Great Design*), translated to CSS and the DOM.

## Response

- Give feedback on pointer-down, not on release. A button highlights the moment it is pressed.
- Audit every delay on the input path: debounces, artificial timers, transition waits, the 300ms tap delay. If it isn't essential, remove it.
- During a drag, slider, or drawer gesture, update the UI 1:1 with the pointer the whole way. Don't animate only after the gesture ends.

## Interruptibility

The most important rule for fluid UI: a user can grab or reverse anything mid-motion.

- Never lock out input during a transition. A closing sheet the user grabs again follows the finger. It doesn't finish closing first.
- Start new motion from the current on-screen value, not the logical target. Starting from the target causes a visible jump.
- Don't use CSS transitions or `@keyframes` for gesture-driven motion. Springs start from the current value and carry velocity through a retarget, which avoids a "brick wall" when the user reverses direction.
- Use separate X and Y springs for 2D motion. One spring on a 2D distance desyncs when the axes move at different speeds.

## Spatial consistency

- Enter and exit along the same path. In from the right, out to the right.
- Anchor menus, popovers, and sheets to their trigger with `transform-origin`.
- Mirror the easing on reversible transitions so the return path matches the outbound one.
- Let in-between frames hint at the destination, the way Control Center modules grow toward the finger.

## Materials and depth

Translucent layers add structure without hiding content.

```css
.toolbar {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px) saturate(180%);
  border-top: 1px solid rgba(255, 255, 255, 0.4); /* bright edge reads as light on the material */
}
```

- Build nav bars, toolbars, and sheets as translucent layers with content scrolling underneath, instead of opaque strips.
- Heavier, darker materials separate structural regions like sidebars. Lighter ones draw attention to interactive elements. Never stack a light translucent surface on another one; text becomes unreadable.
- Bigger surfaces read as thicker: more blur and a deeper shadow than small chips.
- A modal task dims the background with a scrim. A parallel, non-blocking panel uses translucency and offset without a scrim. Stacked sheets dim and push back each parent.
- Text over translucent surfaces needs more contrast than flat gray, a slightly heavier weight, and a small letter-spacing bump. Put color on a solid layer.
- Under sticky headers, fade a small blur or gradient mask where content meets the header, instead of a hard 1px border. Only add it where floating UI actually overlaps content.
- For glass surfaces, animate blur radius and scale together on enter and exit so the surface arrives as a material, not just a fade.

## Typography

- Tracking depends on size. Large display text needs negative letter-spacing. Small text needs a little positive. Body text stays near 0. One `letter-spacing` value for every size is wrong somewhere.
- Line-height moves the other way: tight on large headings, looser on body copy. Tighten for dense data UI; loosen for scripts with tall ascenders and descenders.
- Build hierarchy from weight, size, and leading together. Weight adds emphasis without taking space.
- Respect the user's font-size setting. Space in `rem`/`em`, not fixed pixels, so larger text doesn't break the layout.
- Default to the system font unless there's a reason not to. It already has optical sizing and tuned tracking.

```css
:root { font: 100%/1.5 system-ui, sans-serif; }

.display {
  font-size: clamp(2rem, 5vw, 4rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-optical-sizing: auto;
}
```

## Reduced motion and related preferences

Reduced motion means a gentler equivalent, not no feedback.

```css
@media (prefers-reduced-motion: reduce) {
  .sheet { transition: opacity 200ms ease; transform: none !important; }
}
@media (prefers-reduced-transparency: reduce) {
  .toolbar { background: white; backdrop-filter: none; }
}
@media (prefers-contrast: more) {
  .toolbar { background: white; border: 1px solid currentColor; }
}
```

In React with Motion: `const reduce = useReducedMotion(); const closedX = reduce ? 0 : '-100%';`

Also avoid full-viewport moving backgrounds, slow looping oscillations (around one cycle per 5 seconds), and sudden brightness jumps. Ease theme changes between dark and light. Make large moving objects semi-transparent while they travel.

## Multimodal feedback

When sound or vibration (Vibration API) accompanies motion:

1. The cause must be obvious. Fire on the actual event (the toggle flipping, the item snapping into place).
2. Visual, sound, and haptic fire on the same frame. Don't let a CSS transition lag behind them.
3. Reserve it for meaningful moments: success, error, commit, snap. Too much feedback teaches people to ignore all of it.

## Design foundations

Apple's eight principles, as names to reason with:

1. **Purpose.** Decide what not to build. Every feature costs the user time and attention.
2. **Agency.** Keep people in control. Prefer easy undo over confirmation dialogs; save confirmations for destructive, irreversible actions.
3. **Responsibility.** Ask for permissions at the right moment and only for what's needed. Anticipate misuse, especially with AI features.
4. **Familiarity.** Build on what people know. Things that look the same behave the same and live in the same place. Break a convention only after testing that the new way is better.
5. **Flexibility.** Adapt to device, context, and ability. Let people personalize when one layout can't fit everyone.
6. **Simplicity, not minimalism.** Remove what's unnecessary, but hiding everything isn't simple. Show the common path first and put advanced options one level deeper. Sometimes adding context (time remaining on a scrubber) makes things simpler.
7. **Craft.** Every spacing, timing, and alignment value is a choice you can defend. Jittery scroll and misaligned icons read as carelessness.
8. **Delight.** The result of getting the other seven right, not confetti added on top.

Tactical rules that follow from them:

- Feedback has four kinds: status, completion, warning, error. Validate inline, not on submit.
- Every screen answers: where am I, where can I go, what's here, how do I get out.
- Put controls near what they affect, arranged to mirror it. If a control needs a label to explain the mapping, the mapping is weak.
- Specific labels ("Progress", "Library") beat vague ones ("Home").

## Process

- Build interactive prototypes early. A working demo shows problems that static mockups hide.
- Design interaction and visuals together. Motion is not a layer added after the pixels.
- Test with real people in real context, and review motion in slow motion.
