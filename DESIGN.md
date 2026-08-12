---
name: Pulse
description: Attendance, leave, PTO and CTO for a company that outgrew its workbook.
colors:
  background: "#f7f8fa"
  surface: "#ffffff"
  surface-muted: "#f1f3f6"
  border: "#dfe3e8"
  border-strong: "#c3cad3"
  text-primary: "#1a1f26"
  text-secondary: "#5a6472"
  text-on-accent: "#ffffff"
  accent: "#2f5bb7"
  accent-hover: "#254a99"
  accent-surface: "#eaf0fb"
  focus-ring: "#1a56db"
  success-text: "#1b5e20"
  success-surface: "#e8f5e9"
  success-border: "#a5d6a7"
  warning-text: "#7a4f01"
  warning-surface: "#fff4e5"
  warning-border: "#ffcc80"
  danger-text: "#8c1d18"
  danger-surface: "#fdecea"
  danger-border: "#ef9a9a"
  info-text: "#0b4f6c"
  info-surface: "#e5f3f9"
  info-border: "#90caf9"
  neutral-text: "#41474f"
  neutral-surface: "#eef0f3"
  neutral-border: "#cdd2d9"
typography:
  page-title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  section-title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 620
    lineHeight: 1.35
  metric-label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.04em"
  metric-value:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 640
    lineHeight: 1.15
    fontFeature: "tabular-nums lining-nums"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    lineHeight: 1.5
    fontFeature: "tabular-nums lining-nums"
  body-strong:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 620
    lineHeight: 1.5
rounded:
  md: "6px"
  focus: "3px"
spacing:
  base: "8px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.text-on-accent}"
    rounded: "{rounded.md}"
    size: "small"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.text-on-accent}"
  button-outlined:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
    size: "small"
  chip-status-success:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success-text}"
    rounded: "{rounded.md}"
    size: "small"
  chip-status-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning-text}"
    rounded: "{rounded.md}"
    size: "small"
  chip-status-danger:
    backgroundColor: "{colors.danger-surface}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.md}"
    size: "small"
  chip-status-info:
    backgroundColor: "{colors.info-surface}"
    textColor: "{colors.info-text}"
    rounded: "{rounded.md}"
    size: "small"
  chip-status-neutral:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    size: "small"
  surface-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
---

# Design System: Pulse

## Overview

**Creative North Star: "The Legible Ledger"**

Pulse replaces a spreadsheet, and the people using it read it as a spreadsheet.
`S-10`, `S-14` and `S-20` are mostly figures. So it should feel like a well-kept
ledger rather than a product page: dense rows, figures aligned down the column,
and nothing decorative competing with the numbers for attention.

The interface stays near-neutral and quiet. One accent hue carries action, and
colour is otherwise held in reserve for status — where it has to mean something
specific, and where spending it elsewhere would make it mean less. Headings are
deliberately undersized relative to the data, because the numbers are the
content and the chrome is not.

Density is a feature, not a compromise. An `OFFICE_ADMIN` correcting a day's
attendance should reach it in three clicks (`NFR-1`), and every screen states
what its numbers mean rather than assuming (`NFR-2`).

**Key Characteristics:**

- Near-neutral greys; a single restrained blue accent
- Flat surfaces separated by 1px borders, never by shadow
- Dense by default — small tables, small fields, small chips
- Tabular figures so a column of durations or balances aligns on the decimal
- Status always carries an icon and a word, never colour alone
- A visible focus ring on everything focusable

## Colors

A near-neutral palette with one accent, so that the five status tints are the
only saturated things on a screen and therefore read as meaningful.

### Primary

- **Ledger Blue** (`#2f5bb7`): the one action colour. Primary buttons, links,
  and the selected navigation item. Nothing decorative uses it.
- **Ledger Blue Deep** (`#254a99`): the hover and pressed state of any surface
  painted in Ledger Blue.
- **Ledger Blue Wash** (`#eaf0fb`): the tinted background behind a selected row
  or an active navigation item, where a full-strength fill would shout.
- **Signal Blue** (`#1a56db`): the focus ring, and only the focus ring. It is a
  step brighter than the accent on purpose, so keyboard position is never
  ambiguous against a selected row.

### Neutral

- **Paper** (`#f7f8fa`): the page background. Every card sits on it.
- **Card** (`#ffffff`): raised surfaces — `Paper`, table bodies, dialogs.
- **Muted Card** (`#f1f3f6`): recessed areas — table headers, disabled fields,
  and any strip that should read as structure rather than content.
- **Rule** (`#dfe3e8`): the default 1px border and every divider. This is what
  does the work a shadow would do in a different system.
- **Rule Strong** (`#c3cad3`): the same job where a boundary needs to survive
  next to a tinted status surface.
- **Ink** (`#1a1f26`): body text and figures.
- **Ink Muted** (`#5a6472`): labels, descriptions, and secondary values. It is
  a real reading colour, not a decorative grey, which is why it is held to the
  same contrast bar as body text.
- **Ink Inverse** (`#ffffff`): text on the accent.

### Status

Each status is a set of three — a text tone, the tinted surface it sits on, and
the border that closes it. They are defined as a set because a chip is only
legible when all three are chosen together.

| Status | Text | Surface | Border | Means |
| ------ | ---- | ------- | ------ | ----- |
| Success | `#1b5e20` | `#e8f5e9` | `#a5d6a7` | Active, complete, approved |
| Warning | `#7a4f01` | `#fff4e5` | `#ffcc80` | Needs attention, not yet wrong |
| Danger | `#8c1d18` | `#fdecea` | `#ef9a9a` | Rejected, failed, destructive confirm |
| Info | `#0b4f6c` | `#e5f3f9` | `#90caf9` | Neutral notice, unimplemented screen |
| Neutral | `#41474f` | `#eef0f3` | `#cdd2d9` | Not tracked, no longer active, disabled |

### Named Rules

**The Reserved Colour Rule.** Colour is spent on status and on the one action
accent. A screen that uses the accent decoratively has spent it, and the next
genuinely urgent thing on that screen has nothing left to say it with.

**The Never-Colour-Alone Rule** (`NFR-12`, `DC-11`). Every status chip renders
an icon *and* a written label. Each `statusX` variant publishes a
`--status-icon-gap` custom property that reserves the icon's space, so a chip
built without an icon is visibly wrong rather than quietly inaccessible.

**The One-File Rule.** Every hex in the application lives in
`app/theme/colors.js`. A component that needs a colour selects a theme variant;
it does not name a colour.

### Contrast

Every foreground/background pair is asserted at WCAG 2.1 AA (4.5:1 body text)
in `app/__tests__/theme.test.js`, which computes real relative luminance rather
than trusting the eye. Measured ratios:

| Pair | Ratio |
| ---- | ----- |
| Primary text on background | 15.7:1 |
| Primary text on surface | 16.6:1 |
| Secondary text on surface | 6.0:1 |
| Success text on success surface | 7.0:1 |
| Warning text on warning surface | 6.6:1 |
| Danger text on danger surface | 8.0:1 |
| Info text on info surface | 7.9:1 |
| White on accent | 6.4:1 |

Changing any hex re-runs these assertions. A change that drops a pair below
4.5:1 fails the build rather than shipping.

## Typography

**Body Font:** Inter (with `system-ui`, `sans-serif`)
**Mono Font:** JetBrains Mono (with `ui-monospace`, `monospace`)

Both are self-hosted through `next/font/google` in `app/theme/fonts.js`, so no
request leaves the page for a font and there is no layout shift on load.

**Character:** Inter is chosen for being unremarkable at small sizes — it does
not editorialise a roster. JetBrains Mono appears wherever a value belongs to a
column: employee codes, dates, durations, balances.

### Hierarchy

Six custom variants exist. There is no display tier, because nothing in Pulse
is a headline.

- **pageTitle** (650, 1.5rem, 1.25, `-0.01em`) → `h1`: the screen name. One per screen.
- **sectionTitle** (620, 1rem, 1.35) → `h2`: a panel or card heading, and the app name in the AppBar.
- **metricLabel** (600, 0.75rem, 1.4, `+0.04em`, uppercase, Ink Muted) → `span`: the caption above a figure or a chip group.
- **metricValue** (640, 1.75rem, 1.15, tabular) → `p`: the figure itself. The largest type in the system, which is the point.
- **mono** (0.8125rem, 1.5, tabular) → `code`: codes, dates, durations, balances.
- **bodyStrong** (620, 0.875rem, 1.5) → `strong`: an emphasised value inside running text.

### Named Rules

**The Quiet Heading Rule.** `metricValue` (1.75rem) is larger than `pageTitle`
(1.5rem), and that inversion is deliberate. The data is the content. A heading
that outweighs the number it introduces has the hierarchy backwards.

**The Tabular Figure Rule.** `metricValue` and `mono` set
`font-variant-numeric: tabular-nums lining-nums`, so a column of durations or
balances aligns on the decimal instead of shimmering row to row. Any new
variant that can hold a number does the same.

**The Variants-Only Rule.** Never set `fontSize`, `fontWeight` or `fontFamily`
outside the theme. If none of the six fits, add a seventh in `app/theme/theme.js`
rather than styling in place.

**The Real Element Rule.** Every custom variant maps to a real element — `h1`,
`h2`, `code`, `strong` — never a bare `div`, so the document outline stays
meaningful to a screen reader.

## Layout

**Sizing priority is desktop, then mobile, then tablet.** Pulse is an
operational tool used at a desk for long stretches; the phone case is a lookup,
and the tablet case is rare.

**The shell.** A permanent 232px `Drawer` on the left, and a fixed `AppBar`
above it at `zIndex.drawer + 1`. The AppBar carries no shadow — it is separated
by a single bottom border in Rule. Navigation items are icon plus label with a
36px icon column, and the current item is marked both by `selected` styling and
by `aria-current='page'`, because the tinted background alone is colour-only
signalling.

**Content rhythm.** The main region is a `Stack` with `p: 3` and `gap: 3` on the
8px base — 24px of padding, 24px between blocks. Within a block, `spacing={2}`
(16px) separates related elements and `spacing={1}` (8px) separates a label from
its value. There is no custom padding anywhere; if a gap needs a value that is
not a multiple of the base, the layout is wrong rather than the base.

**Grids.** Tile rows use `Grid container spacing={2}` with
`size={{ xs: 12, sm: 6, md: 4 }}` — three across on a desktop, two on a small
laptop, stacked on a phone. Form fields inside dialogs pair up with
`size={{ xs: 12, sm: 6 }}`.

**Breakpoints** are MUI's defaults, uncustomised. There is no bespoke breakpoint
in the theme and none should be added without a reason that the defaults
demonstrably cannot serve.

**Density.** `Table`, `TextField` and `Chip` all default to `size='small'`
theme-wide. These screens are read as tables, not brochures.

**Widths.** Dialogs are `maxWidth='sm' fullWidth`. Explanatory prose in an empty
state is capped at 460px, because a centred paragraph running the full width of
a desktop table is unreadable.

**Paging, not scrolling.** Any view that can cover the full company pages or
virtualises rather than materialising every row (`NFR-3`, `DC-10`). A screen
that renders 1000 rows is a defect even when it looks correct.

### Named Rules

**The Native Spacing Rule.** Use `spacing` / `gap` on `Stack` and
`spacing` / `rowSpacing` / `columnSpacing` on `Grid`. A custom margin or padding
value in `sx` means a step is missing from the scale, not that this case is
special.

## Elevation & Depth

**Pulse is flat.** There are no shadow tokens in the theme, and that is the
system rather than an omission: the `AppBar` is `elevation={0}`, buttons set
`disableElevation`, and every card is `Paper variant='outlined'`.

Depth is carried entirely by two things — a 1px border in Rule, and the
recessed tone Muted Card. A dense grid of figures with drop shadows under each
panel reads as noise, and the shadows would be doing a job the borders already
do more precisely.

### Named Rules

**The Flat Surface Rule.** A shadow is not how two things are separated in
Pulse; a border is. If a surface needs to lift off the page, the answer is
`Paper variant='outlined'` on Paper background, not a new shadow token.

**The Visible Focus Rule.** Every `:focus-visible` element takes a 2px ring in
Signal Blue at 2px offset, with a 3px radius. This is the one place the system
deliberately adds a ring rather than a border. Removing it without replacing it
with something equally visible is a defect, not a style choice (`NFR-12`).

## Shapes

A single radius, 6px, applied globally through `theme.shape.borderRadius` —
buttons, cards, dialogs, chips, fields. There is no radius scale, because a
system with one radius cannot drift into five.

The one exception is the focus ring at 3px, which hugs the element it is
tracing rather than repeating the element's own curve.

The form language is **outlined over filled**. Cards are outlined, secondary
buttons are outlined, fields are outlined. A filled `contained` button is
reserved for the single primary action on a screen — and a screen with two
contained buttons has two primary actions, which means neither is primary.

Buttons do not uppercase their labels (`textTransform: 'none'`). An admin tool
should read like a sentence, not shout.

## Components

### Buttons

- **Shape:** 6px radius, small by default, no elevation.
- **Primary:** `variant='contained'` in Ledger Blue with Ink Inverse text. One per screen — the action the screen exists for. Hover deepens to Ledger Blue Deep.
- **Outlined:** `variant='outlined'` for secondary actions such as Sign out.
- **Text:** the Cancel position in a dialog, and nothing else.
- **Destructive:** `variant='contained' color='error'` — and only ever behind a `ReasonDialog`.

### Chips

- **Style:** small, 6px radius, tinted surface with a matching 1px border and 600-weight text.
- **State:** selected by the theme `variant` prop — `statusSuccess`, `statusWarning`, `statusDanger`, `statusInfo`, `statusNeutral`. A severity-to-style object literal in a component is a defect.
- **Always** carries an icon plus a written label. The `--status-icon-gap` custom property reserves the icon's space.

### Cards / Containers

- **Corner:** 6px. **Background:** Card on Paper. **Border:** 1px Rule. **Shadow:** none, ever.
- **Internal padding:** `p: 3` for content panels, `p: 6` for a centred empty state.
- Always `Paper variant='outlined'`, never `elevation`.

### Inputs / Fields

- **Style:** MUI outlined, `size='small'`, 6px radius.
- **Focus:** the global 2px Signal Blue ring.
- **Labels:** always present. On a labelled select carrying a `<MenuItem value=''>`, always set `slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}` — otherwise the empty item renders blank and the label overlaps the placeholder.
- **Helper text** explains a rule before the click, not after: the reason field states that it will be recorded in the audit log with the author's name and time.

### Navigation

- **Style:** permanent 232px drawer, `ListItemButton` rows, 36px icon column, outlined MUI icons throughout.
- **States:** current item takes `selected` plus `aria-current='page'`. Visibility is driven by the resolved permission map, so an `S-19` edit changes the navigation with no code change.

### Tables

- **Frame:** `Paper variant='outlined'` wrapping a `size='small'` `Table`.
- **Rows:** `hover` enabled. The first cell is the link to the record.
- **Cells:** codes, dates, durations and balances render in `mono` so the column aligns. An absent value renders as an em dash (`—`), never as an empty cell — an empty cell is indistinguishable from a failure to load.
- **Status column** is last.

### PageHeader

Every screen opens with one. `pageTitle`, an optional `body2` description in Ink
Muted, an optional meta line, and right-aligned actions; it stacks to a column
below `sm`. The description is not decorative — it is where an abbreviation or a
counting rule gets explained (`NFR-2`).

### EmptyState

Outlined Paper, centred, `p: 6`: a muted icon, a `sectionTitle`, a description
capped at 460px, and an optional action. It says *why* it is empty and what to
do about it. A new user with no records sees an explanatory line rather than
zeroed statistics; an empty exception tab reads "Nothing outstanding" rather
than showing an empty grid. A blank table is indistinguishable from a broken
one.

### ReasonDialog

The signature component. `maxWidth='sm' fullWidth`, a real `<form onSubmit>`,
`DialogContent dividers`, an error `Alert` above the description, and a
multiline autofocused reason field. The confirm button stays disabled until a
reason is typed — the requirement is stated by the blocked button before the
click rather than by a validation message after it (`FR-4.10`).

### ScreenStub

An info `Alert` stating plainly that the screen is not implemented, then
`metricLabel`-headed chip rows for spec references, tabs and filters, then the
screen's real column headers over an empty table. It is deliberately more than a
heading: a skeleton that looked finished but returned nothing would read as a
bug.

### Screen archetypes

The compositions every remaining screen assembles from the components above.

- **List screen** — `PageHeader` → filter row → outlined `Paper` + dense `Table` → server-side pagination → `EmptyState` at zero rows. `UserRoster` is the reference.
- **Tabbed queue** — `PageHeader` → `Tabs` with the count in each label → the list archetype inside each tab → a per-tab `EmptyState` that names what is absent.
- **Detail screen** — `PageHeader` with status chips in the meta slot → a `Tabs` strip → outlined Paper panels per tab → actions in the header, never floating. `UserDetail` is the reference.
- **Reason-gated confirm** — every override, soft delete, restore and manual adjustment routes through `ReasonDialog`. A bespoke confirm dialog is a defect.

## Do's and Don'ts

### Do:

- **Do** put every hex in `app/theme/colors.js` and select it through a theme variant.
- **Do** give every status an icon and a written label (`NFR-12`, `DC-11`).
- **Do** use `Paper variant='outlined'` on Paper background to separate surfaces.
- **Do** render figures in `metricValue` or `mono` so columns align on the decimal.
- **Do** state the counting rule in `PageHeader`'s description when a number could be read two ways (`NFR-2`).
- **Do** reserve `variant='contained'` for the one primary action on a screen.
- **Do** render an em dash for an absent table value.
- **Do** page or virtualise any full-company view (`NFR-3`, `DC-10`).
- **Do** keep Enter-submits and Esc-cancels working through a real `<form>`.

### Don't:

- **Don't** add a shadow token. The system is flat; use a border.
- **Don't** build a status style map in `sx` — select a `statusX` chip variant.
- **Don't** set `fontSize`, `fontWeight` or `fontFamily` outside the theme.
- **Don't** use a custom margin or padding value where the 8px scale has a step.
- **Don't** remove the focus ring without replacing it with something equally visible.
- **Don't** convey any state by colour alone — including a calendar, which shall never depend on formatting or colour to say what a day is (`FR-3.7`).
- **Don't** use raw SVG or emoji as an icon, or import an `@mui/icons-material` name without verifying the export exists.
- **Don't** render a blank grid where an `EmptyState` belongs.
- **Don't** add a second radius. There is one, and it is 6px.

### Known gap

The shell has no mobile treatment: `AppShell` renders a `variant='permanent'`
drawer at every width. Under the desktop → mobile → tablet priority this is
correct for the primary case and outstanding for the second — a `temporary`
drawer below `sm` is required work, not a design decision still open.
