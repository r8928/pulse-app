# Pulse App - AI Rules

**Stack: Next.js v16 + MUI v9, MongoDB for the DB, deployed on Vercel.**

**Global principle: clean as you go** — when touching code that violates any rule below, fix it in the same change.

## Auth and Session

- All auth/session validation lives in `proxy.js` — it is the single centralized validator for pages and APIs. DO NOT add auth guards or unauthenticated-redirect logic anywhere else, and DO NOT monkey-patch individual API routes.
- Session data flows one way: the server reads the session and passes `session.user` as a prop to the client leaf. Client components never read the session directly; all role-dependent UI and access decisions derive from the `session.user` prop.

## Documentation and Spec Discipline

- DO NOT bloat README.md — every line must prevent a concrete mistake; cut anything that doesn't.
- README.md is the spec-first feature list: update it before implementing a feature.
- ARCHITECTURE.md is the implementation guide — read the relevant section before building a feature, and fix it in the same change when it disagrees with `spec.md` (which always wins).
- The four design-token surfaces (`./theme/colors.js`, `./theme/theme.js`, `DESIGN.md` frontmatter/prose, `.impeccable/design.json`) must never drift — any change to one is reflected in all four in the same commit.

## Git and Commit Hygiene

- DO NOT commit while `npm run lint` exits non-zero; fix every biome error first and never bypass with `--no-verify`.
- Major tasks are done in a new branch, never directly on `main`. Before considering the task done, run `npm test` and `npm run build`, fix any failures, then squash-merge the branch into `main`.
- Always use `/commit-commands:commit` skill to create commits.

## DB

- DO NOT write DB queries inline in `page.js` or API route files — always extract to `./database.js` and import from there, even when only one caller exists today.

## Date and Time

- DO NOT hand-roll datetime math or call `new Date()` for parsing/manipulation; use `date-fns` and `date-fns-tz` (install on first need).
- Relative timestamps (e.g. "2h ago") expose the absolute date/time via the `title` attribute.

## MUI (v9)

- DO NOT use pre-v9 patterns: direct system props on components, Box as a flex/grid layout wrapper, Grid `xs/sm/md`, `InputLabelProps`, `inputProps`, `TransitionProps`, `MenuListProps`. Use `sx` for layout/style, `slotProps.<slotName>`, Grid `size`, and Stack/Grid (not Box) as layout containers. Per-component real props still exist (`Dialog maxWidth`, `Typography align`, SvgIcon `fontSize`, etc.) — verify against v9 propTypes. On API friction, consult <https://mui.com/material-ui/migration/upgrade-to-v9/> before attempting workarounds.
- DO NOT use custom margin/padding values in `sx`; prefer native `spacing`/`gap` on Stack and `spacing`/`rowSpacing`/`columnSpacing` on Grid unless no native equivalent exists.
- ALWAYS set `slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}` on a labeled TextField select that has a `<MenuItem value=''>` — otherwise the empty item renders blank and the label overlaps the placeholder.
- DO NOT hardcode design tokens inline in components. Color hexes live in `colors.js` (single source of truth for the theme palette); radii, shadows, spacing, and typography metrics live in `theme.js`. For typography specifically: never set `fontSize`/`fontWeight`/`fontFamily` outside the theme — use typography variants (`pageTitle`, `metricLabel`, `mono`, `bodyStrong`, …), add a variant in `app/theme.js` when none fits, and self-host fonts via `app/fonts.js` (next/font/google).
- DO NOT implement reusable styling presets (e.g. status/severity style maps) via `sx`, `style`, raw CSS, or Tailwind; define them as custom component variants in `app/theme.js` and select via the `variant` prop.
- DO NOT use raw SVG or unicode emojis as icons, or reference an MUI icon by name without verifying the exact export exists in `@mui/icons-material`.

## Code Rules

- DO NOT hardcode domain enum literals (status, roles, priorities, assignment status, unassigned sentinel, confirm tokens); import from `./constants`.
- DO NOT duplicate JSX blocks, hook logic, or utility patterns — extract to `components/`, `hooks/`, or `utils/` at the second cross-file use or the third repetition within the same file. Never redefine a function locally that `utils/` already exports.
- DO NOT embed business logic (data fetching, validation, state management) in UI components; extract to custom hooks or controllers, keep components pure (data in via props, actions out via callbacks), and lift shared state to the nearest common parent.
- The React Context API is not allowed.
- When library or framework documentation is needed (APIs, versions, migration details), fetch current docs via the Context7 MCP instead of relying on training data or guessing.

## Testing

- Minimum unit-test coverage: valid input → expected output, invalid input → specific error, dependency failure → handled error, one edge case per unit. Mock AWS SDKs, network calls, databases, ConfigService env vars, and framework APIs.
- Test observable behavior, not implementation. Two failure smells: (1) a design-token-only change breaks an app test → the assertion belongs in `app/__tests__/theme.test.js`, not the app layer; assert state, variant, role, visibility, enabled/disabled instead. (2) A behavior-preserving refactor breaks a test → the test is brittle; fix or remove it. Never test SDK/framework internals, platform wiring, private methods, call order, or runtime-owned configuration.

## Responsive and Input Design

- Forms and dialogs: Enter submits, Esc cancels. Implement via a real `<form onSubmit={...}>` with `event.preventDefault()`, `type='submit'` on the primary button, and `type='button'` on every other button.
- Size for tablet first, then mobile, then desktop; design interactions keyboard-first, then touch, then mouse.

## Superpowers Workflow

- When writing utils, hooks, or components, invoke /test-driven-development before writing implementation code.
- TDD also covers frontend/backend contracts: when adding or changing an API route, write contract tests first — request shape (params, body, auth), response shape (status codes, payload schema, error format) — and assert the same contract from both sides: the route handler fulfills it and the client hook/fetch layer consumes it. A contract change is not done until both sets of tests are updated in the same change.

## User Interaction

- When an answer, decision, or clarification is needed, ask via the AskUserQuestion tool and keep looping with follow-up rounds until every open point is resolved; DO NOT end a turn with questions posed only in prose.
