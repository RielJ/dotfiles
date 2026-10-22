# Layout and spacing

Layout turns product priority into reading order, grouping, rhythm, and usable space. Diagnose the structural problem before moving boxes. Change structure inside the existing visual identity, not the identity itself.

## Fit the surface

- **Marketing and landing pages:** composition may be asymmetric or deliberately disruptive when it serves the content.
- **Product UI and reading surfaces:** predictable structure, stable density, and a clear linear path are features.

## Assess before editing

Answer each with rendered or source evidence:

- **Reading order:** Squint (or blur the screenshot). Can you still pick out the primary element, the secondary one, and the major groups, in order?
- **Grouping:** Are related items close and separate groups apart, or are borders and cards making up for weak proximity?
- **Rhythm:** Do tight and generous gaps create a cadence, or does one spacing value repeat until everything weighs the same?
- **Structure:** Does the layout match the content? Are repeated cards, columns, or sections truly equivalent, or just a framework default?
- **Density:** Does the information per region fit how often it's used and how complex the decisions are?
- **Adaptation:** At narrow, intermediate, wide, zoomed, and translated states, what reorders, collapses, wraps, scrolls, or stays fixed? Do DOM order and focus order still match the visual order?
- **Extremes:** Do long content, empty states, overlays, sticky elements, safe areas, and small touch targets break the structure?

## Set the spatial plan

Before editing, name the primary reading or task path, what belongs together and what must separate, which element leads, the intended density and rhythm, and how the structure changes across containers, viewports, and content extremes. Pick the simplest structure that expresses those relationships.

## Apply

- Group by meaning. Use proximity before adding containers or decoration.
- Create rhythm with deliberate contrast between tight and generous gaps.
- Use one spacing scale, no one-off values. A 4px base (Tailwind's default) gives the middle steps an 8-only scale misses.
- Let hierarchy follow product priority, not framework defaults.
- Make responsive changes structural: reorder, collapse, reflow, or reveal based on what stays important.
- Use container queries (`@container`) for components that appear in different contexts.
- Use `gap` for spacing between siblings instead of child margins.
- Keep touch targets at least 44px even when the visible mark is smaller.
- Use depth only when it clarifies state or hierarchy.
- Make optical corrections only after looking at the rendered result.

Variation is not a goal. Repetition helps recognition; break it only when content or priority changes.

## Verify

- The squint test still shows primary, secondary, and major groups in order.
- The task path stays clear at every supported size.
- Related content groups naturally; unrelated content stays apart.
- Spacing has intentional rhythm instead of monotonous repetition.
- Long text, empty states, translation, zoom, and dynamic content don't break the structure.
- Keyboard, touch, and screen-reader order match the visual order.

---

Adapted from Impeccable (`skill/reference/layout.md`), Copyright Paul Bakaus, Apache-2.0. Changes: removed visitor-mode, detector, live-mode, and native-platform sections; added Tailwind, container-query, and touch-target notes. See [../NOTICE](../NOTICE).
