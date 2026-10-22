# Components, transforms, and clip-path

Exact CSS for the component rules in SKILL.md. Copy values; don't approximate them.

## Press feedback

```css
.button {
  transition: transform 150ms var(--ease-out);
}
.button:not(:disabled):active {
  transform: scale(0.96);
}
```

`scale()` scales children too, so the label and icon shrink with the button. That is intended. Use `0.96`, the house press value, and never scale a disabled button.

## Entering without scale(0)

```css
/* Bad */
.entering { transform: scale(0); }

/* Good */
.entering { transform: scale(0.95); opacity: 0; }
```

## Origin-aware popovers

```css
/* Base UI */
.popover { transform-origin: var(--transform-origin); }

/* Radix / shadcn (Radix-based) */
.popover { transform-origin: var(--radix-popover-content-transform-origin); }
/* also --radix-dropdown-menu-content-transform-origin, --radix-tooltip-content-transform-origin, ... */
```

Modals are not anchored to a trigger. Leave them at `transform-origin: center`.

## Tooltips

```css
.tooltip {
  transition: transform 125ms ease-out, opacity 125ms ease-out;
  transform-origin: var(--transform-origin);
}
.tooltip[data-starting-style],
.tooltip[data-ending-style] {
  opacity: 0;
  transform: scale(0.97);
}
/* Once one tooltip is open, neighbors open instantly */
.tooltip[data-instant] {
  transition-duration: 0ms;
}
```

## Transitions vs keyframes

```css
/* Interruptible: retargets from the current value */
.toast { transition: transform 400ms ease; }

/* Not interruptible: restarts from 0% when retriggered */
@keyframes slideIn {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
```

Use transitions (or springs) for toasts, toggles, expand/collapse, and anything a user can trigger again mid-animation.

## @starting-style entry

```css
.toast {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 400ms ease, transform 400ms ease;

  @starting-style {
    opacity: 0;
    transform: translateY(100%);
  }
}
```

Fallback where support is a concern:

```jsx
useEffect(() => { setMounted(true); }, []);
// <div data-mounted={mounted}>
```

## Blur-masked crossfade

Without blur, a crossfade shows two objects overlapping. A little blur blends them into one changing shape.

```css
.button-content {
  transition: filter 200ms ease, opacity 200ms ease;
}
.button-content.transitioning {
  filter: blur(2px);
  opacity: 0.7;
}
```

Stay under 20px of blur. Safari is slow with heavy blur.

## Stagger

```css
.item {
  opacity: 0;
  transform: translateY(8px);
  animation: fadeIn 300ms ease-out forwards;
}
.item:nth-child(2) { animation-delay: 50ms; }
.item:nth-child(3) { animation-delay: 100ms; }
.item:nth-child(4) { animation-delay: 150ms; }

@keyframes fadeIn {
  to { opacity: 1; transform: translateY(0); }
}
```

30-80ms between items. Stagger is decoration, so nothing waits on it.

## Asymmetric timing

Slow where the user is deciding, fast where the system responds.

```css
/* Release: fast */
.overlay { transition: clip-path 200ms ease-out; }
/* Press: slow and deliberate */
.button:active .overlay { transition: clip-path 2s linear; }
```

## Transforms

- **Percent translate.** `translateY(100%)` moves an element by its own height. Sonner positions toasts and Vaul hides its drawer this way. It works at any content size, unlike hardcoded pixels.
- **3D.** `rotateX()`/`rotateY()` with `transform-style: preserve-3d` on the parent give real depth (coin flips, orbits) without JavaScript.
- **Origin.** Every transform runs from `transform-origin`, center by default. Move it to wherever the trigger sits.

## clip-path

`clip-path: inset(top right bottom left)` trims each side. It animates on the GPU and needs no extra DOM.

```css
.hidden  { clip-path: inset(0 100% 0 0); } /* hidden from the right */
.visible { clip-path: inset(0 0 0 0); }
```

- **Hold to delete.** Colored overlay at `inset(0 100% 0 0)`. On `:active`, transition to `inset(0 0 0 0)` over 2s linear. On release, snap back in 200ms ease-out. Add `scale(0.96)` on the button.
- **Tabs with clean color changes.** Duplicate the tab list, style the copy as active, clip the copy so only the active tab shows, and animate the clip on change. Individual color transitions can't match this.
- **Image reveal on scroll.** Start at `inset(0 0 100% 0)` and animate to `inset(0 0 0 0)` when in view (`IntersectionObserver`, or Motion's `useInView` with `{ once: true, margin: "-100px" }`).
- **Comparison slider.** Stack two images, clip the top one with `inset(0 50% 0 0)`, and drive the right inset from the drag position.

## Drag basics

- Dismiss on a quick flick, not only past a distance threshold: `Math.abs(distance) / elapsedMs > 0.11` dismisses.
- Past a boundary, add rising friction instead of a hard stop.
- Call `setPointerCapture` once a drag starts so it keeps tracking outside the element.
- Ignore extra touch points after the drag begins, or switching fingers makes the element jump.
- Respect the grab offset. Don't snap the element's center to the pointer.

## Springs

Use springs for drags, gestures that can be reversed mid-flight, and decorative pointer-following. They keep velocity when interrupted.

```js
{ type: "spring", duration: 0.5, bounce: 0.2 } // Apple-style, easier to reason about
{ type: "spring", mass: 1, stiffness: 100, damping: 10 } // physics params
```

Default to no bounce. Keep bounce at 0.1-0.3 and use it only when the gesture itself carried momentum (a flick, a drag release). For pointer-following decoration, `useSpring` from Motion smooths the value instead of jumping. Skip it on functional UI like a banking chart.

## Performance code

```js
// Bad: every child recalculates styles
element.style.setProperty('--swipe-amount', `${distance}px`);
// Good: only this element
element.style.transform = `translateY(${distance}px)`;
```

```jsx
// Main thread, drops frames under load
<motion.div animate={{ x: 100 }} />
// Hardware accelerated
<motion.div animate={{ transform: "translateX(100px)" }} />
```

WAAPI gives JavaScript control with CSS performance:

```js
element.animate(
  [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  { duration: 1000, fill: 'forwards', easing: 'cubic-bezier(0.77, 0, 0.175, 1)' },
);
```

## Cohesion

Match motion to the product. A playful app can bounce. A dashboard stays crisp and fast. Sonner feels right partly because its timing is slightly slower than normal UI and uses `ease` rather than `ease-out`, which fits its look and name. One bouncy component in a crisp app is a bug.

Opacity combined with height in entering and exiting lists has no formula. Adjust until it looks right.

Components people love tend to share a few traits: almost no setup, defaults good enough that nobody customizes them, and edge cases handled quietly (pause toast timers when the tab is hidden, fill gaps between stacked toasts so hover doesn't flicker, capture the pointer during drag).

## Debugging motion

- Slow it down. Set 2-5x duration, or 10% playback in the DevTools Animations panel.
- Step frame by frame. Look for double-exposed crossfades, wrong origins, properties out of sync, and abrupt starts or stops.
- Test touch on a real phone. Load the dev server by IP and use Safari remote devtools. The simulator misses gesture feel.
- Look again the next day. Fresh eyes catch timing problems you stopped seeing.
