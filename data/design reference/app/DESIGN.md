# Design System Specification

## 1. Overview & Creative North Star: "The Modern Curator"
This design system moves beyond the rigid, boxy constraints of traditional enterprise software. Our Creative North Star is **The Modern Curator**—an approach that treats business data with the same reverence and clarity as a high-end editorial publication or a contemporary art gallery.

By synthesizing the modernist efficiency of professional tools with an editorial eye for white space and tonal depth, we create an experience that feels lightweight yet authoritative. We break the "template" look through:
*   **Intentional Asymmetry:** Utilizing the sidebar navigation as a solid anchor against an expansive, airy content canvas.
*   **Atmospheric Depth:** Replacing harsh lines with sophisticated color shifts.
*   **High-Contrast Typography:** Using dramatic scale differences to guide the eye through complex information hierarchies effortlessly.

---

## 2. Colors & Surface Philosophy
The palette is rooted in a professional "Enterprise Blue," but elevated through a systematic application of tonal layering.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or layout containment. Structural boundaries must be defined solely through background color shifts. For instance, a `surface-container-low` side panel should sit flush against a `surface` background without a stroke.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Hierarchy is achieved by nesting surface tokens:
*   **`surface` (#fbf9f8):** The base canvas.
*   **`surface-container-low` (#f5f3f3):** Sub-sections or sidebar foundations.
*   **`surface-container-lowest` (#ffffff):** High-priority "floating" cards or active content areas.
*   **`surface-bright` (#fbf9f8):** Used for emphasized interactive surfaces.

### The "Glass & Gradient" Rule
To add a premium signature, use **Glassmorphism** for floating elements (e.g., Modals or Popovers). Use a semi-transparent `surface` color with a `backdrop-blur` of 12px to 20px. For primary CTAs, apply a subtle linear gradient from `primary` (#005db5) to `primary_container` (#0875e1) at a 135-degree angle to provide "visual soul."

---

## 3. Typography
We utilize **Inter** (sans-serif) as our primary voice, emphasizing a clear, rhythmic hierarchy that feels intentional and premium.

*   **Display (lg/md/sm):** Dramatic and bold. Use these sparingly for hero sections or dashboard summaries to create an editorial feel.
*   **Headline & Title:** Use `headline-lg` (2rem) for main page titles. Ensure generous `letter-spacing` (-0.02em) to maintain a modern, "tight" look.
*   **Body (lg/md/sm):** Optimized for readability. `body-md` (0.875rem) is the workhorse for enterprise data.
*   **Label (md/sm):** All-caps or high-weight monospace elements for metadata, providing a technical contrast to the fluid sans-serif headings.

The typographic system creates authority through scale. A 3.5rem `display-lg` headline paired with ample `spacing-20` (5rem) white space signals a premium, "un-cluttered" experience.

---

## 4. Elevation & Depth
In this design system, "elevation" is a feeling, not a drop-shadow effect.

*   **Tonal Layering:** Depth is achieved by stacking. A `surface-container-lowest` (#ffffff) card placed on a `surface-container-low` (#f5f3f3) background creates a soft, natural lift.
*   **Ambient Shadows:** If a floating effect is required (e.g., a menu), shadows must be extra-diffused. Use a blur of 32px and an opacity of 4%-6%. The shadow color must be a tinted version of `on_surface` to mimic natural light.
*   **The Ghost Border Fallback:** If accessibility requires a container edge, use the "Ghost Border"—the `outline_variant` token at **15% opacity**. Never use 100% opaque borders.
*   **Glassmorphism:** Encourage backdrop blurs on `surface_container_lowest` to make the layout feel integrated and "airy" rather than "pasted on."

---

## 5. Components

### Sidebar Navigation
*   **Layout:** Fixed-width sidebar using `primary` (#005db5) as the background.
*   **Interactions:** Active states use a `secondary_container` (#619efe) subtle glow or a high-contrast `on_primary` indicator.
*   **Modernist Note:** Ensure the sidebar has no vertical border; it should simply "end" where the content canvas begins.

### Buttons
*   **Primary:** Gradient-filled (Primary to Primary Container), `rounded-md` (0.75rem).
*   **Secondary:** Ghost-style. No border. Subtle `surface-container-high` background shift on hover.
*   **Tertiary:** Text-only with `on_primary_fixed_variant` color.

### Input Fields
*   **Styling:** Forgo the 4-sided box. Use a `surface-container-highest` background with a 2px bottom-stroke of `primary` only when focused.
*   **Typography:** Labels use `label-md` for clear, small-cap metadata presentation.

### Cards & Lists
*   **No Dividers:** Forbid the use of divider lines. Separate list items using `spacing-4` (1rem) of vertical white space or alternating tonal shifts between `surface` and `surface-container-low`.
*   **Padding:** Use `spacing-6` (1.5rem) as the minimum internal padding for all cards.

### Additional Signature Component: The "Data Sheet"
A specific container for enterprise metrics that uses `surface-container-lowest` with a `rounded-lg` (1rem) corner and a very subtle `primary` tint to signify its importance over standard content.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use white space as a structural element. If a section feels cramped, double the spacing token (e.g., move from `spacing-4` to `spacing-8`).
*   **Do** use `inter` monospace for numeric data and code snippets to provide a "technical-chic" contrast.
*   **Do** leverage the `surface-tint` for subtle brand presence in interactive elements like toggles or checkboxes.

### Don’t
*   **Don’t** use black (#000000) for text. Use `on_surface` (#1b1c1c) to maintain a sophisticated, softer contrast.
*   **Don’t** use standard "drop shadows." Always use the Ambient Shadow or Tonal Layering approach.
*   **Don’t** use 1px dividers to separate content. Let the geometry of the background colors and typography do the work.
*   **Don’t** use sharp corners. Stick to the `DEFAULT` (0.5rem) or `md` (0.75rem) roundedness to keep the UI feeling "lightweight" and approachable.