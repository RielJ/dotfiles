# Harden: production edge cases

Designs that only work with perfect data aren't production-ready. Harden the interface against the inputs, errors, languages, and network conditions real users bring. For feeding worst-case data into a component and reporting what breaks, use the `break-ui` skill; this file covers the fixes and the states beyond data.

## Assess

1. **Extreme inputs:** very long and very short text, emoji, RTL text, accents, huge numbers, 1000+ items, empty data.
2. **Errors:** offline, slow, timeout; API 400, 401, 403, 404, 429, 500; validation, permission, and concurrent-operation errors.
3. **Internationalization:** long translations (German runs about 30% longer than English), RTL (Arabic, Hebrew), CJK, date, number, and currency formats.

## Text overflow

```css
/* One line with ellipsis (Tailwind: truncate) */
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Clamp to N lines (Tailwind: line-clamp-3) */
.clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

/* Let long words wrap (Tailwind: break-words) */
.wrap { overflow-wrap: break-word; hyphens: auto; }

/* Flex and grid children overflow without this (Tailwind: min-w-0) */
.flex-item, .grid-item { min-width: 0; }
```

- Body text at least 16px on mobile; 14px only for genuinely secondary text. iOS Safari zooms focused inputs under 16px.
- Test at 200% zoom; containers must grow with their text.

## Internationalization

- Budget 30-40% extra space for translations. No fixed widths on text containers: `px-4 py-2` on a button, not `w-24`.
- Use logical properties: `margin-inline-start`, `padding-inline`, `border-inline-end` (Tailwind: `ms-*`, `px-*`, `border-e`). Mirror directional icons under `[dir="rtl"]`.
- Format with `Intl`: `Intl.DateTimeFormat`, `Intl.NumberFormat` (including `style: "currency"`), `Intl.PluralRules` or an i18n library. Never `count !== 1 ? "s" : ""`.
- UTF-8 everywhere; test CJK and multi-byte emoji.

## Errors

- **Network:** say what happened, offer a retry, handle timeouts, and support offline where it matters.
- **Forms:** inline errors next to the field, specific messages with a suggested fix, keep the user's input, don't block submission without reason.
- **API status:** 400 shows validation errors, 401 sends to login, 403 explains the missing permission, 404 shows a not-found state, 429 explains the rate limit, 500 shows a generic error with a support path.
- One failing component never blanks the whole interface (use error boundaries).

## Edge states

- **Empty:** no items, no results, no notifications. Always give the next action.
- **Loading:** initial, pagination, refresh. Say what's loading ("Loading your projects…"); give estimates for long operations.
- **Large datasets:** paginate or virtualize; add search and filters; never render 10,000 rows at once.
- **Concurrency:** disable submit while pending, handle races, roll back failed optimistic updates.
- **Interrupted gestures** (custom sliders, drag surfaces): a second pointer mid-drag doesn't hijack the first; `pointercancel`, `lostpointercapture`, release outside the control, and window `blur` all clear the drag state and release capture; the next drag works without a reload.
- **Permissions:** no view, no edit, read-only. Explain why.

## Validation

- Client-side: required fields, formats, length limits, with the constraint described next to the field (`aria-describedby`).
- Server-side always. Never trust client validation alone.

## Accessibility and performance resilience

- Everything works by keyboard, with logical tab order, focus management in dialogs, and skip links on long pages.
- Announce dynamic changes with live regions; use semantic HTML and real labels.
- Test Windows high-contrast mode; never rely on color alone.
- Slow connections: skeletons, progressive images, optimistic updates.
- Clean up listeners, subscriptions, timers, and pending requests on unmount.
- Debounce search input (about 300ms); throttle scroll handlers.

## Verify

Try each and say what produced the evidence (emulated viewport, synthetic touch, real device), naming what stayed untested:

- names of 100+ characters, emoji in every text field, Arabic or Hebrew, Chinese or Japanese;
- internet off and throttled to slow 3G;
- 1000+ items;
- submit clicked 10 times quickly;
- a second finger mid-drag, scrolling across the control, release outside it, switching windows mid-drag, then dragging again;
- forced API errors in every state, and all data removed.

---

Adapted from Impeccable (`skill/reference/harden.md`), Copyright Paul Bakaus, Apache-2.0. Changes: condensed; added Tailwind equivalents and error-boundary note; removed command hand-offs. See [../NOTICE](../NOTICE).
