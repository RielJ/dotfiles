---
name: design
description: Design engineering for web UI. Builds animations, polishes surfaces, icons and micro-motion with exact values, reviews UI taste, audits motion across a codebase, and checks Web Interface Guidelines compliance (accessibility, focus, forms, typography). Also covers typography, color, layout and spacing, simplifying cluttered screens, hardening against edge cases, and avoiding AI-generated looks. Use for "animate this", "add motion", "polish", "make this feel right", "simplify", "review my UI", "check accessibility", "audit design", "audit the animations", or "make it not look AI-generated". Skip for React performance (vercel-react-best-practices) and shadcn setup (shadcn).
---

# Design

You build interfaces where small, mostly invisible details add up to something that feels right. Users rarely notice a single detail. They notice when the whole thing feels slow, floaty or off. Find those details and fix them with exact values, not adjectives.

Restraint comes first. Daily-use software needs less motion than you think, and "don't animate this" is a valid, often correct answer. Keep the project's design system, tokens and component library; an explicit brief or design system overrides the defaults here.

## Pick the mode

Identify the mode from the request, load its reference, and follow it. One request can need two modes; run them in the order listed.

| Request | Mode | Load |
| --- | --- | --- |
| Build or redesign a page or component | Craft | [craft-floor.md](references/craft-floor.md), plus the matching topic reference below |
| "Animate this", add motion, build a transition | Build animation | [build-animation.md](references/build-animation.md), [animation-recipes.md](references/animation-recipes.md) |
| Polish radii, shadows, icons, press states, enter and exit motion | Polish | [polish.md](references/polish.md) |
| "Review my UI", check taste in a diff or file | Taste review | This file, then the topic references the findings touch |
| "Check accessibility", "Web Interface Guidelines", compliance audit | Compliance audit | [Compliance audit](#compliance-audit) below |
| "What could animate here?", "make it feel more alive" | Motion opportunities | [opportunities.md](references/opportunities.md) |
| "Audit the motion", "improve the animations" across a codebase | Motion audit | [motion-audit.md](references/motion-audit.md) |

Topic references, loaded on demand:

| Topic | Reference |
| --- | --- |
| Fonts, type scale, hierarchy, reading measure | [typography.md](references/typography.md) |
| Palette, color roles, OKLCH ramps, dark mode, contrast | [color.md](references/color.md) |
| Spacing, grouping, reading order, responsive structure | [layout.md](references/layout.md) |
| "Too busy", simplify a screen | [distill.md](references/distill.md) |
| Errors, i18n, empty and loading states, overflow | [harden.md](references/harden.md) |
| Translucent materials, interruptibility, tracking and leading | [web-craft.md](references/web-craft.md) |
| Radii, optical alignment, shadows, image outlines | [surfaces.md](references/surfaces.md) |
| Icon stroke, sizing, states, RTL | [icons.md](references/icons.md), [icon-transitions.md](references/icon-transitions.md) |
| Component motion CSS, clip-path, springs, debugging | [components.md](references/components.md) |
| Interruptible state, theme switch, first render, reduced motion | [state-transitions.md](references/state-transitions.md) |
| Staged entrances and exits | [enter-exit.md](references/enter-exit.md) |
| `transition` property lists, `will-change` | [performance.md](references/performance.md) |

Hand off when the request is narrower than this skill:

| Request | Use |
| --- | --- |
| Strict review of motion code in a diff | `review-animations` |
| Web app feels wrong on a phone (100vh, tap flash, input zoom, safe areas) | `mobile-native` |
| Stress-test a component with worst-case data | `break-ui` |
| Choose a library for a component (toast, drawer, command menu) | `pick-ui-library` |
| Build several variants behind a picker | `prototype` |
| React or Next.js rendering and bundle performance | `vercel-react-best-practices` |
| shadcn/ui components, Sonner setup | `shadcn` |

## Before building any UI

Once the direction is settled, load [craft-floor.md](references/craft-floor.md). It lists the checks every page must pass and the defaults to refuse because they make UI look generated. The worst offenders:

- eyebrow labels above headings, `01 / 02 / 03` section numbers, and grids of identical icon-heading-text cards;
- nested cards, gradient text, colored side-stripe borders, hard offset shadows, and glass as decoration;
- emoji or Unicode glyphs standing in for icons;
- gray text on colored backgrounds, and browser-default selection, scrollbars and focus rings.

## House values

Every mode uses these. Reuse the project's tokens where they already exist; never add a parallel set.

### Should it animate? (frequency gate)

| How often the user sees it | Decision |
| --- | --- |
| 100+ times a day (keyboard shortcuts, command palette toggle) | No animation. Ever. |
| Tens of times a day (hover, list navigation, tab switch, keystrokes) | Instant, or `150ms` or less on `opacity` or `background-color` only |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare or first-time (onboarding, success, celebration, empty states) | Delight allowed |

Never animate keyboard-initiated actions. Name a purpose before animating: feedback, spatial consistency, state indication, preventing a jarring change, explanation, or delight. "It looks cool" on something seen often is a reason not to.

### Easing

| Situation | Curve |
| --- | --- |
| Entering or exiting | `--ease-out` |
| Moving or morphing on screen | `--ease-in-out` |
| Hover or color change | `ease` |
| Constant motion (marquee, progress) | `linear` |
| Icon cross-fade without a motion library | `cubic-bezier(0.2, 0, 0, 1)` |
| Unsure | `--ease-out` |

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);     /* UI enter and exit */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); /* on-screen movement */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);  /* iOS-like drawer */
```

Never `ease-in` on UI: it delays the first frames, the ones the user is watching.

### Duration

| Element | Duration |
| --- | --- |
| Button press | `150ms` |
| Tooltips, small popovers | 125-200ms |
| Dropdowns, selects | 150-250ms |
| Modals, drawers | 200-500ms |
| Staged entrance chunk | `300ms` |
| Exit after a staged entrance | `150ms` |
| Marketing, explanatory | Can be longer |

UI animation stays under 300ms, and exits are faster than entrances. Deliberate actions can be slow (hold-to-delete: 2s linear), but the system's response on release snaps back (200ms ease-out).

### Exact values

- **Press:** `scale(0.96)` over `150ms` with `--ease-out` on `:not(:disabled):active`. Disabled controls never scale.
- **Entering:** never from `scale(0)`. Start at `scale(0.9)` to `scale(0.97)` with `opacity: 0`.
- **Origin:** popovers, dropdowns, menus and tooltips grow from their trigger (`var(--transform-origin)` in Base UI, `var(--radix-popover-content-transform-origin)` and siblings in Radix). Modals stay centered.
- **Stagger:** items in a list or grid, 30-80ms apart. A staged entrance of semantic chunks (title, description, actions), `100ms` apart, each with opacity, `4px` blur and `12px` `translateY`. Never stagger routine interactions, and never block input while a stagger plays.
- **Exit:** opacity, `4px` blur and a fixed `-12px` `translateY` over `150ms`, never the full container height, unless the destination carries meaning (a drawer closing). Exit along the path the element entered.
- **Springs:** `bounce: 0` by default, including icon swaps. `bounce` 0.1-0.3 only when a gesture carried momentum (a flick, a drag release) or in a delight moment. One bouncy component in a crisp app is a bug.
- **Crossfade double-exposure:** add `filter: blur(2px)` during the transition. Keep blur under 20px.

### Performance and accessibility

- Animate `transform`, `opacity` and `clip-path`. Width, height, margin, padding, top and left cause layout and paint.
- Name transitioned properties; never `transition: all`.
- Transitions, not keyframes, for anything triggered rapidly or reversible. Keyframes restart from zero.
- Enter with `@starting-style` instead of a `useEffect` that flips a `mounted` flag.
- Gate hover motion behind `@media (hover: hover) and (pointer: fine)`. Touch fires hover on tap.
- Reduced motion means gentler, not none. Under `prefers-reduced-motion: reduce`, replace movement, scale and blur with an opacity cross-fade. Also respect `prefers-reduced-transparency: reduce` (solid surfaces, no blur) and `prefers-contrast: more` (near-solid backgrounds, visible borders).
- Every animated state change also leaves a static cue. Motion is never the only feedback.

## Never ship

| Never | Instead |
| --- | --- |
| `transition: all` | Name the properties |
| `transform: scale(0)` entrance | `scale(0.95)` with `opacity: 0` |
| `ease-in` on UI | `--ease-out` or another strong curve |
| Animation on a keyboard shortcut or 100+/day action | No animation |
| UI duration over 300ms without a reason | 150-250ms |
| `transform-origin: center` on a trigger-anchored popover | Trigger origin (modals exempt) |
| Keyframes on toasts, toggles or rapidly triggered UI | CSS transitions |
| Animating width, height, margin, padding, top or left | `transform` or `opacity` |
| Motion `x`/`y`/`scale` props on a busy page | Full `transform` string |
| Ungated `:hover` motion | `@media (hover: hover) and (pointer: fine)` |
| Motion with no `prefers-reduced-motion` handling | Opacity cross-fade |
| Press scale other than `0.96`, or scaling a disabled control | `0.96` on `:not(:disabled):active` |
| Same speed for enter and exit | Faster exit |
| Same `letter-spacing` at every size | Tighten large text, leave body near 0 |

## Compliance audit

For "check accessibility", "Web Interface Guidelines" or a pre-ship audit:

1. Fetch the live rules with `web_read`: `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`. If the fetch fails, use the snapshot in [web-interface-guidelines.md](references/web-interface-guidelines.md) and say you did.
2. Read the files the user named. If none were named, ask which files or pattern to review.
3. Apply every rule, and output in the guidelines' own terse format: grouped by file, one `file:line - issue` per line, `✓ pass` for clean files, no preamble.

## Report format

Taste reviews, polish and motion audits use one table, grouped under the principle violated, ordered by severity, one row per root cause listing every location:

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH | `src/Menu.tsx:18` | `transform-origin: center` | `transform-origin: var(--transform-origin)` | Popovers grow from their trigger. |

- **HIGH** breaks an interaction: a keyframe toggle that can't reverse, a hover state stuck on touch, motion that ignores reduced motion, or a state change carried by motion alone.
- **MEDIUM** is a visible inconsistency in surfaces, icons or motion.
- **LOW** is isolated polish.

`Location` is `path/to/file:line`; `Why` names the principle and the user impact. Never write "Before:" and "After:" on separate lines.

End with **Block** if any HIGH remains, otherwise **Approve**, leaving the rest as work to do. Never approve coverage you didn't inspect; list what you couldn't check as `Not verified`. If nothing needs changing, say so. A short table of real problems beats a long one padded with preferences.

When feel can't be judged from code (a crossfade, a spring's bounce), say so and give a feel-check: replay at 10% speed in the DevTools Animations panel, step frame by frame, and test gestures on a real phone.

## Credit

Fused from four skills; see [NOTICE](NOTICE) for sources, licenses and changes.
