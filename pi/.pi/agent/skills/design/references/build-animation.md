# Build an animation

Turn a request for motion into an implementation that would pass a strict review the first time. This workflow writes code. It does not audit a codebase ([motion-audit.md](motion-audit.md)) or hunt for places that could animate ([opportunities.md](opportunities.md)).

Two failure modes, and the first is worse:

1. **Animating something that shouldn't animate.** The gate below sometimes produces zero lines of code. That is a success, not a dodge.
2. **Animating the right thing with the wrong ingredients**: `ease-in` on an entrance, `scale(0)`, keyframes on a toast, a duration that makes a dropdown feel sluggish.

Never present motion options as a menu. Make the call, state the reasoning in one line, and write the code.

## Hard rules

1. **Run the sequence in order.** Steps 1 and 2 gate everything. Don't reach for a curve before you know whether it animates at all.
2. **No approximated values.** Every curve, duration and spring config comes from [House values](../SKILL.md#house-values) or a recipe. Never invent `cubic-bezier(0.4, 0, 0.2, 1)` because it looks familiar.
3. **Extend the codebase's tokens, don't fork them.** If `--ease-out` or a duration scale already exists, use it. A parallel system is a defect.
4. **Reduced motion and hover gating ship with the animation**, not as a follow-up.
5. **Cheapest tool that works.** Don't install a motion library for a fade.

## The sequence

### 1. Should this animate at all?

Apply the frequency gate in [House values](../SKILL.md#house-values). Keyboard-initiated actions are a disqualifier, not a judgment call.

If the request fails the gate, say so plainly and don't write the animation. Offer the non-motion alternative instead: an instant state change or a static affordance.

### 2. What is the purpose?

Name it in one word before continuing: **feedback**, **spatial consistency**, **state indication**, **preventing a jarring change**, **explanation** (marketing and onboarding only) or **delight** (rare and first-time moments only).

If you can't name it, don't build it. Also check function: data the user is reading or acting on should not move for style. A mouse-tracking effect belongs on a marketing page, not on a chart in a banking app.

### 3. Pick the tool, cheapest first

Walk down and stop at the first that fits.

| Need | Tool |
| --- | --- |
| Hover, press, color, or a state toggle driven by a class or attribute | CSS transition |
| Entry animation on mount, no JS state | CSS `@starting-style` |
| Predetermined motion that must stay smooth while the page is busy | CSS animation (runs off the main thread) |
| Programmatic control with CSS performance, no library | WAAPI (`element.animate()`) |
| Springs, layout animations, exit animations, gesture-driven values | Motion (`motion.dev`) |

If the task needs a component rather than an animation (a toast, drawer, command menu or dropdown), stop and use `pick-ui-library`. Hand-rolling those is how you end up with a `<div>` dropdown and no focus management.

### 4. Pick the properties

- **`transform` and `opacity` only.** `clip-path` is the sanctioned third (see [animation-recipes.md](animation-recipes.md)). `height` is tolerated only for accordions, which have no transform equivalent.
- **Never `scale(0)`.** Start from `scale(0.9)` to `scale(0.97)` with `opacity: 0`.
- **`transform-origin` at the trigger** for popovers, dropdowns, menus and tooltips: `var(--transform-origin)` in Base UI. Modals stay centered.
- **Percentages in `translate()`** are relative to the element's own size. Prefer them to hardcoded pixels.
- **In Motion, use the full transform string** when the page is busy. The `x`/`y`/`scale` shorthands run on the main thread:

```jsx
<motion.div animate={{ x: 100 }} />                          // drops frames under load
<motion.div animate={{ transform: "translateX(100px)" }} />  // hardware accelerated
```

- **Never drive a child's transform from a CSS variable on the parent.** Every child recalculates styles.

### 5. Easing and duration, or a spring

Take the curve and duration from [House values](../SKILL.md#house-values). Need a curve that isn't there? Take it from [easing.dev](https://easing.dev/) or [easings.co](https://easings.co/). Don't hand-roll one.

Reach for a spring when the motion is a drag with momentum, a gesture the user can interrupt or reverse, or decorative pointer-following:

```js
{ type: "spring", duration: 0.5, bounce: 0 }              // default: Apple-style, easy to reason about
{ type: "spring", duration: 0.5, bounce: 0.2 }            // only after a gesture that carried momentum
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }  // physics form, more control
```

### 6. Interruption and exit

- **Transitions, not keyframes, for anything triggered rapidly**: toasts, toggles, anything a user can fire twice in a second. Transitions retarget from the current value; keyframes restart from zero.
- **Springs for gestures**, because they carry velocity through an interruption.
- **Exit the way it entered.** A toast that slides in from the bottom leaves through the bottom.
- **Exit faster and smaller than the entrance.** See [enter-exit.md](enter-exit.md#exit-animations).
- **Asymmetric timing where the user is deciding.** Slow on the deliberate phase (hold-to-confirm: 2s linear), snappy on the system response (release: 200ms ease-out).

### 7. Reduced motion and pointer gating

Ships with the animation, every time.

```css
@media (prefers-reduced-motion: reduce) {
  .element { animation: fade 0.2s ease; } /* keep opacity and color, drop movement */
}

@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); } /* touch fires false hovers on tap */
}
```

```jsx
const reduce = useReducedMotion();
const closedX = reduce ? 0 : "-100%";
```

Reduced motion means fewer and gentler animations, not zero. Keep transitions that aid comprehension, and replace movement with an opacity cross-fade.

## Recipes

Start from a recipe instead of a blank file:

- Button press, dropdown, tooltip, modal, drawer, toast, accordion, stagger, hold-to-confirm, tab indicator, scroll reveal, drag-to-dismiss: [animation-recipes.md](animation-recipes.md).
- Staged entrances and exits: [enter-exit.md](enter-exit.md).
- Icon swaps: [icon-transitions.md](icon-transitions.md).
- Interruptible state, theme-switch suppression, first-render skip, reduced-motion fallback: [state-transitions.md](state-transitions.md).
- Clip-path, transforms and motion debugging: [components.md](components.md).

## Before you finish

Check the code against [Never ship](../SKILL.md#never-ship).

## Output

Write the code. Then, in at most a few lines:

- **Gate result**: the frequency tier and the named purpose. If part of the request was rejected, say which and why.
- **Ingredients**: tool, properties, curve, and duration or spring config, one line each.
- **Feel-check**: if the result depends on feel you can't judge from code (a crossfade, a spring, the opacity and height balance in an entering list), say so and point at the check: replay at 10% speed in the DevTools Animations panel, step frame by frame, and test gestures on a real device.

Don't pad this into a report. The code is the deliverable.

---

Adapted from Emil Kowalski's `animate` skill (https://github.com/emilkowalski/skills), MIT, see [../LICENSE](../LICENSE). Changes: shared tables moved to SKILL.md, press and bounce values aligned with the house values, intro response removed.
