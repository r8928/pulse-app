# DESIGN.md Rework — Design

**Date:** 2026-08-12
**Status:** Approved
**Sources:** `DESIGN.md`, `.impeccable/design.json`, `app/theme/*`, `ARCHITECTURE.md` §10, `CLAUDE.md`, `spec.md`, `list-of-screens.md`, the impeccable `document` reference

---

## 1. Goal

Turn `DESIGN.md` from a token-governance note into a design system document that
conforms to the [DESIGN.md format spec](https://github.com/google-labs-code/design.md),
so that an agent building any of the 20 unimplemented screens has a single visual
reference instead of a list of hex codes.

The current file is **accurate but structurally wrong**. Its values match the code
exactly — verified hex by hex against `app/theme/colors.js`, radius and spacing
against `theme.js`, all six typography variants and their element mappings, and the
`--status-icon-gap` property at `theme.js:36`. Nothing in it is false. It simply
answers a different question than a DESIGN.md is supposed to answer.

### In scope

1. `DESIGN.md` rewritten to schema-correct frontmatter plus the eight canonical sections.
2. Governance prose relocated from `DESIGN.md` to `CLAUDE.md`.
3. `CLAUDE.md` responsive and input-priority ordering corrected.
4. `.impeccable/design.json` regenerated as a schemaVersion 2 extensions-only sidecar.
5. `ARCHITECTURE.md` §10 cross-referenced so no rule is stated twice in different words.
6. A drift test making the four-surfaces rule enforceable.
7. A one-line comment correction in `theme.js`.

### Explicitly out of scope

No visual change to the running application. No new components, no new theme tokens,
no change to any rendered pixel. `AppShell` does not gain a mobile drawer in this
change — the gap is recorded, not closed.

---

## 2. What is wrong with the current file

| # | Defect | Evidence |
| - | ------ | -------- |
| P-1 | Frontmatter is off-schema | Uses flat keys (`background`, `accent`, `statusSuccess`, `fontSans`, `borderRadius`, `spacingBase`) and a non-schema `direction:`. The format accepts `colors`, `typography`, `rounded`, `spacing`, `components` only. No `description`. |
| P-2 | None of the eight canonical sections present | Headings are "The four surfaces", "Direction", "Rules", "Contrast", "Where token tests live". Tooling that parses canonical headings finds nothing. |
| P-3 | No Components section | Nine components exist and none is described. An agent building `S-12` has nothing to copy. This is the largest practical cost. |
| P-4 | No Layout section | Nothing on the 232px drawer, the `p:3` / `gap:3` rhythm, breakpoints, or dialog widths. Density lives in `design.json` but never in `DESIGN.md`. |
| P-5 | No Elevation & Depth section, and a live inaccuracy | `DESIGN.md` says `theme.js` holds "shadows"; `theme.js` defines **none**, and `MuiButton` sets `disableElevation`. The system is flat and the doc never says so. |
| P-6 | No Do's and Don'ts | The format's most citable device is absent. `FR-3.7` ("a calendar shall never depend on formatting or colour") is a design constraint recorded nowhere. |
| P-7 | Roughly a third of the file is not design | "The four surfaces" and "Where token tests live" are governance rules that belong in `CLAUDE.md`. The format is explicit that DESIGN.md is strictly visual. |
| P-8 | Sidecar is the wrong shape | `.impeccable/design.json` has no `schemaVersion`, `generatedAt`, `extensions`, `components[]` or `narrative`. It duplicates token values that belong in frontmatter and carries none of what a sidecar exists for. |

---

## 3. Decisions and their reasons

| # | Decision | Reason |
| - | -------- | ------ |
| D-1 | Merge, do not regenerate | The existing contrast table, status rules and `NFR-12` / `DC-11` citations are the most valuable content in the file and are backed by real assertions. A clean regeneration would reword them. The impeccable reference also forbids silently overwriting an existing DESIGN.md. |
| D-2 | Governance prose moves to `CLAUDE.md` | DESIGN.md is strictly visual per the format. `CLAUDE.md` already states the four-surfaces rule in shorter form, so this consolidates rather than duplicates. |
| D-3 | Components section documents the 9 real components **and** prescribes screen archetypes | Only 2 of 22 screens are built. Documenting existing components alone satisfies the letter of the format and fails its purpose. The archetypes are derived from `list-of-screens.md`, so they are grounded rather than invented. |
| D-4 | Sizing order becomes desktop → mobile → tablet — **SUPERSEDED 2026-08-18**, see `DESIGN.md` § Layout; the order is now tablet → mobile → desktop and interactions are keyboard → touch → mouse | User decision. It also resolves a live contradiction: `CLAUDE.md` said tablet-first while `AppShell` renders a `variant='permanent'` drawer with no mobile treatment. Under the new order the permanent drawer is correct and mobile is the outstanding work. |
| D-5 | Input order becomes keyboard → mouse → touch | Follows D-4. Keyboard stays first because `NFR-12` requires keyboard navigation and the focus ring is already an enforced invariant. |
| D-6 | Say nothing about dark mode | User decision. `spec.md` has no dark-mode requirement, so a "planned" note would only invite agents to pre-emptively add dark variants to individual components. |
| D-7 | Include a Creative North Star — "The Legible Ledger" | One line at the top of Overview. Agents follow a memorable phrase more reliably than a bullet list when deciding how a new screen should feel. |
| D-8 | Doc boundary: DESIGN.md answers "what does it look like", `ARCHITECTURE.md` §10 answers "how do I wire it" | Both documents currently state the status-never-colour-alone rule and the focus-ring rule. Splitting by question gives each fact exactly one home, which is what makes the never-drift rule enforceable. |
| D-9 | Flat-by-default is documented as the elevation answer, not fixed | Zero shadow tokens is a legitimate and deliberate system for a dense admin tool. The defect is the misleading comment, not the absence of shadows. |
| D-10 | Add `yaml` as an explicit devDependency | The drift test must parse nested frontmatter. `yaml` is present in `node_modules` only as a transitive dependency; depending on that is fragile. |
| D-11 | No Secondary or Tertiary colour groups | Pulse has one accent hue. The format's own guidance is to express a single-accent system as Primary + Neutral and omit the rest rather than invent them. |

---

## 4. The change set

Branch `docs/design-md-rework`, squash-merged into `main` per `CLAUDE.md`.

### 4.1 `DESIGN.md`

**Frontmatter** — rewritten to the schema:

```yaml
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
  # …warning, danger, info, neutral in the same three-part shape
typography:
  page-title: { fontFamily: "Inter", fontSize: "1.5rem", fontWeight: 650, lineHeight: 1.25, letterSpacing: "-0.01em" }
  section-title: { fontFamily: "Inter", fontSize: "1rem", fontWeight: 620, lineHeight: 1.35 }
  metric-label: { fontFamily: "Inter", fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.4, letterSpacing: "0.04em" }
  metric-value: { fontFamily: "Inter", fontSize: "1.75rem", fontWeight: 640, lineHeight: 1.15 }
  mono: { fontFamily: "JetBrains Mono", fontSize: "0.8125rem", lineHeight: 1.5 }
  body-strong: { fontFamily: "Inter", fontSize: "0.875rem", fontWeight: 620, lineHeight: 1.5 }
rounded:
  md: "6px"
  focus: "3px"
spacing:
  base: "8px"
components:
  chip-status-success:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success-text}"
    rounded: "{rounded.md}"
  # …one entry per status variant, plus button-primary and button-outlined
---
```

Every value is transcribed from `colors.js` and `theme.js`. No value is invented and
none is restated in the prose with a different number.

**Body** — the eight canonical sections, in order:

| Section | Content |
| ------- | ------- |
| `## Overview` | North Star `"The Legible Ledger"`, the existing dense-data-first direction prose (kept close to verbatim — it is good), then a **Key Characteristics** list. |
| `## Colors` | Grouped Primary (the one accent) / Neutral (structure and text) / Status. Each token gets where-and-why, not just what. Keeps the 8-row contrast table and the line that changing a hex re-runs the assertions. **The Reserved Colour Rule** — colour is held for status; a screen that uses the accent decoratively has spent it. |
| `## Typography` | Inter / JetBrains Mono, the six variants with real metrics, their `variantMapping` elements, and the tabular-numerals rule. **The Quiet Heading Rule** — headings are undersized relative to the data on purpose. |
| `## Layout` | 232px permanent drawer; `AppBar` fixed at `zIndex.drawer + 1` with a bottom border and no shadow; `p: 3` / `gap: 3` content rhythm on an 8px base; MUI default breakpoints, uncustomised; `Grid size={{ xs, sm, md }}` for tile rows; dialogs `maxWidth='sm' fullWidth`; `EmptyState` prose capped at 460px. States that mobile is second priority and currently has no drawer treatment. |
| `## Elevation & Depth` | Flat by default, stated explicitly. Zero shadow tokens; `elevation={0}` AppBar; `disableElevation` buttons; `Paper variant='outlined'` everywhere. Depth is carried by 1px borders and `surfaceMuted`. **The Flat Surface Rule** — a shadow is not the way to separate two things in Pulse; a border is. |
| `## Shapes` | Radius 6 globally, 3px on the focus ring. Outlined over filled as the form language: outlined Paper, outlined secondary buttons, contained reserved for the single primary action on a screen. |
| `## Components` | The nine real components, then the four archetypes. Detailed in §4.2. |
| `## Do's and Don'ts` | The existing prohibitions restated as Do/Don't, plus `FR-3.7` (a calendar never depends on formatting or colour), plus the mobile-drawer gap as a known outstanding item. |

### 4.2 The Components section in detail

**Documented from code** — for each: character line, shape, colour assignment, states.

1. **AppShell** — fixed bordered AppBar, permanent drawer, selected nav item via `ListItemButton selected` plus `aria-current='page'`, 36px icon column, identity block right-aligned with role spelled out.
2. **PageHeader** — `pageTitle` + optional `body2` description + optional meta line + right-aligned actions; stacks to column below `sm`. The description is where an abbreviation or counting rule gets explained (`NFR-2`).
3. **Data table** (from `UserRoster`) — `Paper variant='outlined'` wrapping a `size='small'` Table, `hover` rows, first cell a link, dates and codes in `mono` for column alignment, em-dash for absent values, status column last.
4. **UserStatusChips** — small outlined chips, icon plus label always, theme `statusX` variant never an `sx` map, wrapping with `gap: 1`.
5. **EmptyState** — outlined Paper, centred, `p: 6`, secondary-toned icon, `sectionTitle`, description capped at 460px, optional action. Says why it is empty, never a blank grid.
6. **ReasonDialog** — `maxWidth='sm' fullWidth`, real `<form onSubmit>`, `DialogContent dividers`, error Alert above the description, multiline reason field autofocused, confirm disabled until a reason is typed.
7. **UserFormDialog** — same dialog frame, `Grid size={{ xs: 12, sm: 6 }}` field pairs.
8. **ScreenStub** — info Alert stating plainly it is not implemented, then metricLabel-headed chip rows for spec refs, tabs and filters, then the real column headers in an empty table.
9. **UserDetail** — the reference implementation of the detail archetype: `PageHeader` with `UserStatusChips` in the meta slot, a seven-tab `Tabs` strip (Overview, Tenures, Shift assignments, Team assignments, Attendance, Leave and balances, History), outlined Paper panels per tab, and every mutation routed through `ReasonDialog`.

**Prescribed archetypes** — the composition every remaining screen assembles from the above:

- **List screen** — `PageHeader` → filter row → outlined `Paper` + dense Table → server-side `TablePagination` (`NFR-3`, `DC-10`) → `EmptyState` when zero rows.
- **Tabbed queue** — `PageHeader` → Tabs with counts in the label → the list archetype per tab → per-tab `EmptyState` that reads "Nothing outstanding" rather than showing an empty grid.
- **Detail screen** — `PageHeader` with status chips in the meta slot → outlined Paper sections with `sectionTitle` headings → actions in the header, never floating.
- **Reason-gated confirm** — every override, soft delete, restore and manual adjustment routes through `ReasonDialog`. A bespoke confirm dialog is a defect.

### 4.3 `CLAUDE.md`

- The responsive rule becomes: size for **desktop first, then mobile, then tablet**; design interactions **keyboard-first, then mouse, then touch**.
- Gains the token-test-location rule removed from `DESIGN.md`: token assertions live in `app/__tests__/theme.test.js` and nowhere else.
- The four-surfaces rule already exists here and is left as the single statement of it.

### 4.4 `.impeccable/design.json`

Regenerated as schemaVersion 2, extensions-only. Carries what the frontmatter cannot:
`colorMeta` with display names and 8-step tonal ramps, an explicit empty `shadows` array
documenting the flat system, `breakpoints` (MUI defaults, recorded because the frontmatter
schema has no home for them), drop-in `components[]` with self-contained `ds-`-prefixed
HTML/CSS for the status chip, roster row, primary/outlined buttons, text field and nav item,
and `narrative` pulled verbatim from the DESIGN.md prose. Token primitive values are
**removed** — they live in the frontmatter now.

### 4.5 `ARCHITECTURE.md` §10

§10.5 keeps its one-line rules and each gains a pointer to the DESIGN.md section that
owns the visual specification. §10.1 (server/client boundary), §10.2 (pure components),
§10.3 (form mechanics) and §10.6 (MUI v9) are untouched — they are wiring, not looks.
§10.4 (empty/loading/error) keeps the behavioural requirement and points at DESIGN.md
for what an `EmptyState` looks like.

### 4.6 `app/theme/theme.js`

The header comment claims radii, **shadows**, spacing and typography metrics live in this
file. No shadow token exists. The word is removed and the flat-by-default decision noted
in its place. Comment only — no behavioural change.

---

## 5. The drift test

`CLAUDE.md` requires the four token surfaces never to drift, and nothing enforces it.
A change to `colors.js` today leaves `DESIGN.md` and `design.json` silently stale.

**Written test-first**, per `CLAUDE.md`'s TDD rule: the assertions are written and seen
to fail against the current off-schema file before the rewrite lands.

Added to `app/__tests__/theme.test.js` as a `describe('four surfaces')` block:

| Assertion | Guards |
| --------- | ------ |
| Every hex in `DESIGN.md` frontmatter `colors` equals its `colors.js` counterpart | Colour drift |
| Every `colors.js` token appears in the frontmatter | Silent omission on adding a token |
| `rounded.md` and `spacing.base` equal `theme.shape.borderRadius` and `theme.spacing(1)` | Metric drift |
| Every frontmatter `typography` entry matches the corresponding `theme.typography` variant | Type drift |
| `design.json` declares `schemaVersion: 2` and carries no token primitive values | Sidecar regressing to the old duplicated shape |
| `design.json` `colorMeta` keys are a subset of the frontmatter colour keys | Orphaned metadata |
| Every `{token.ref}` in a frontmatter `components` entry resolves to a key that exists | A component variant pointing at a colour that was renamed or removed |

Deliberately **not** asserted: prose content, section order, or narrative wording. Those
are editorial and asserting them makes the test brittle in exactly the way `CLAUDE.md`
warns about.

`yaml` is added as an explicit devDependency for the frontmatter parse.

---

## 6. Error handling

Not an application-runtime change, so the failure modes are build-time:

- **Missing or malformed frontmatter** — the drift test fails on parse with the file path in the message rather than silently skipping.
- **A token added to `colors.js` and nowhere else** — caught by the completeness assertion, which is the drift this whole section exists to prevent.
- **`yaml` unavailable** — an explicit devDependency rather than a transitive one, so this fails at install rather than at test time.

---

## 7. Testing

- The drift test above, written before the DESIGN.md rewrite.
- The existing 13 assertions in `app/__tests__/theme.test.js` must continue to pass untouched — nothing in this change alters a token value, so a failure there means something was transcribed wrong.
- `npm test` and `npm run build` both green before the squash-merge.
- No new app-layer tests: no component behaviour changes.

---

## 8. Risks

| Risk | Mitigation |
| ---- | ---------- |
| Transcription error moving 18 colours and 6 type variants into a new frontmatter shape | This is precisely what the drift test catches, which is why it is written first. |
| Prescribed archetypes become fiction if screens are built differently | They are derived from `list-of-screens.md`, which the screens are being built from anyway. Where a screen deviates, DESIGN.md is corrected in the same change — the standing clean-as-you-go rule. |
| The rewrite loses good prose from the current file | Merge, not regenerate (D-1). The direction paragraph, contrast table and status rules are carried across close to verbatim. |
| `ARCHITECTURE.md` edits touch a document the supervisor just approved | Confined to §10.5 pointers. No rule is deleted, none is reworded. |

---

## 9. Definition of done

1. `DESIGN.md` has schema-correct frontmatter and the eight canonical sections in order.
2. Every colour, radius, spacing and typography value in `DESIGN.md` and `design.json` matches `colors.js` / `theme.js`, proven by the drift test rather than by reading.
3. `.impeccable/design.json` is schemaVersion 2, extensions-only, with drop-in component snippets.
4. `CLAUDE.md` carries the token-test rule and the corrected desktop → mobile → tablet and keyboard → mouse → touch ordering.
5. `ARCHITECTURE.md` §10.5 points at DESIGN.md; no rule is stated twice in different words.
6. `theme.js` no longer claims to hold shadows.
7. `npm run lint` exits 0, `npm test` passes, `npm run build` succeeds.
8. Branch squash-merged into `main`.
