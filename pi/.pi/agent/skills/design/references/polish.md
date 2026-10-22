# Polish surfaces, icons and micro-motion

Exact values for surfaces, icons and small motion. This applies once the underlying interaction works. A polish finding never outranks a broken interaction.

The values here are exact, not ranges to approximate. `cubic-bezier(0.2, 0, 0, 1)` is not `cubic-bezier(0.4, 0, 0.2, 1)`, and `0.96` is not `0.95`. The optical nudges and the concentric-padding cutoff are the exceptions: they are starting points, judged by eye.

Keep the project's component library, tokens and density, and match its motion language wherever no rule here gives a value. A deliberate, consistent project convention, such as a style with no shadows, is a preference and not a finding. The same detail done two ways within one project is a finding.

## Surfaces

- **Outer radius equals inner radius plus padding.** Where nested surfaces share a visible, even inset, the outer radius is the inner radius plus the padding plus any border width. Past `24px` of padding, or where the padding is deliberately asymmetric, treat the layers as separate surfaces and keep each one's radius token. See [surfaces.md](surfaces.md).
- **Align optically where geometry looks off.** Give a button `2px` less padding on its icon side, shift a play triangle toward its point, and fix asymmetric glyphs in the SVG itself. See [surfaces.md](surfaces.md#optical-alignment).
- **Shadows for elevation, borders for structure.** Where a border exists only to create depth, replace it with layered transparent `box-shadow` values. Keep borders on dividers, separators, table cells, selected states and form inputs, whose boundary needs 3:1 non-text contrast. Forced-colors mode removes every `box-shadow`, so keep `border: 1px solid transparent` under a shadow ring. See [surfaces.md](surfaces.md#shadow-recipes).
- **Outline images in pure black or white.** Give content images a `1px` outline inset by `1px`: `oklch(0 0 0 / 0.1)` in light mode and `oklch(1 0 0 / 0.1)` in dark. Never use a palette near-black, a tinted neutral or the accent color, because the tint shows as a colored fringe. Skip transparent artwork such as logos. See [surfaces.md](surfaces.md#image-outlines).
- **Contain scroll inside overlays.** Scrollable dialogs, drawers, menus and side panels get `overscroll-behavior: contain`.

## Icons

- **Match icon stroke to text weight**, from `1.5px` at 400 to `2.5px` at 700. One icon library per surface. See [icons.md](icons.md).
- **One SVG, recolored per state.** Icons use `currentColor` and take hover, selected and disabled states from CSS color and opacity, never from separate assets. Outline is the default variant, and fill marks the active state. Under `dir="rtl"`, mirror only icons whose meaning follows reading direction. See [icons.md](icons.md#icons-in-rtl).
- **Cross-fade contextual icons with exact values.** Where an icon swaps on an infrequent state change (play to pause, copy to copied), scale runs `0.25` to `1`, opacity `0` to `1` and blur `4px` to `0px`. With a motion library use `{ type: "spring", duration: 0.3, bounce: 0 }`. Without one, keep both icons in the DOM and cross-fade over `300ms` with `cubic-bezier(0.2, 0, 0, 1)`. A tab's icon swap and hover-revealed row actions are high-frequency and swap instantly. See [icon-transitions.md](icon-transitions.md).

## Micro-motion

- **Transitions, not keyframes, for interactive state.** Keyframes run a fixed timeline and cannot reverse. See [state-transitions.md](state-transitions.md).
- **Press scales to `0.96`** over `150ms` with the ease-out curve, and a disabled button never scales. Give the button an opt-out through its variant API or a `static` prop. See [state-transitions.md](state-transitions.md#scale-on-press).
- **Every animated state change leaves a static cue** (a color, icon or label). Motion is never the only feedback channel.
- **Skip state animations on first render.** Set `initial={false}` on an `AnimatePresence` that wraps a state swap. Never set it around an intentional entrance such as a staggered hero. See [state-transitions.md](state-transitions.md#skip-animation-on-page-load).
- **Staged entrances and exits.** Values are in [House values](../SKILL.md#house-values); recipes in [enter-exit.md](enter-exit.md).
- **Suppress transitions on theme switch.** Disable every transition for the swap, force a style flush, and restore transitions after the next frame. See [state-transitions.md](state-transitions.md#suppress-transitions-on-theme-switch).
- **Name the animated property in `will-change`**, only after you see first-frame stutter, and only for transform properties, `opacity` and `filter`. See [performance.md](performance.md#use-will-change-sparingly).
- **Suppress the tap flash** with `-webkit-tap-highlight-color: transparent` where a control draws its own pressed state. Tailwind 4's `hover:` already compiles under `@media (hover: hover)`; Tailwind 3's does not.

## Detection table

Scan for these before finishing.

| Detection | Fix |
| --- | --- |
| Padded parent and child with the same `rounded-*` or `border-radius` | Add the padding to the outer radius |
| `box-shadow: 0 0 0 1px` ring with no `border` beside it | `border: 1px solid transparent` |
| `outline-slate-*`, `outline-zinc-*` or a hex outline color on `img` | `outline-black/10` and `dark:outline-white/10` |
| `transition-all` or `transition: all` | Name the changing properties |
| `animation:` set on `:hover`, `.open` or another toggled class | A transition on the same properties |
| `active:scale-95`, `scale-90` or `whileTap` below `0.96` | `0.96` |
| `:active` scale with no `:disabled` exclusion | `enabled:active:` or `:not(:disabled):active` |
| Non-zero `bounce:` outside a momentum gesture or delight moment | `bounce: 0` |
| `opacity: 0` in a base rule that only an `animation` reveals | Hidden state in the `from` keyframe, `animation-fill-mode: both` |
| `translate`, `scale`, `filter` or `motion.*` animation with no `prefers-reduced-motion`, `motion-safe:` or `MotionConfig` guard | Gate it and cross-fade opacity under reduced motion |
| Color transitions plus a theme toggle with no `disableTransitionOnChange` or override | The theme-switch suppression recipe |
| `will-change: all`, or `will-change` on an element that never animates | Name the animated property or delete it |
| `fill="#..."` or `stroke="#..."` inside an icon SVG | `currentColor` |
| Plain-CSS `:hover` or Tailwind 3 `hover:` outside `@media (hover: hover)` | Wrap it in the query |
| `overflow: auto` on a dialog, drawer or menu with no `overscroll-behavior` | `overscroll-behavior: contain` |

## Verification

Without a browser, read every state the component defines from the code (hover, pressed, selected, loading, empty) with its durations and easings. With one, walk each state and replay motion at 10% speed in the Animations panel. Report every check you could not run as `Not verified`.

---

Adapted from Jakub Krehel's `better-ui` skill (https://github.com/jakubkrehel/skills/tree/d574cc8a576dc24256ad38268b8d03d86724a1b3/skills/better-ui), MIT, see [../LICENSE-better-ui](../LICENSE-better-ui). Changes: rules grouped by area, severity and report format moved to SKILL.md, bounce rule scoped to non-gesture motion.
