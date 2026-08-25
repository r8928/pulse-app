# Pulse — List of Modules, Screens, and Popups

Derived from `spec.md`. Every screen and popup here traces to at least one requirement, and
[§6 Coverage matrix](#6-coverage-matrix) proves the reverse: that every `FR-` requirement has a home.

**Totals — 9 modules · 22 screens · 47 popups.** Post-MVP adds 3 screens and 2 popups.

**By delivery phase** (`spec.md` §2.3), so the size of each phase is visible before it starts:

| Phase | Screens | Popups |
| ----- | ------- | ------ |
| `✔` delivered | 4 | 5 |
| `P4` basic | 7 | 25 |
| `P5` intermediate | 6 | 8 |
| `P6` complex | 5 | 9 |
| `PM` post-MVP | 3 | 2 |

---

## 1. How to read this

| Element | Meaning |
| ------- | ------- |
| `M-n` | Module. A group of screens, and a top-level navigation item. |
| `S-nn` | Screen. One navigable route. Tabs and wizard steps are listed inside it, not as separate screens. |
| `P-nn` | Popup. A modal, drawer, or confirm that overlays a screen and holds its own form or decision. |
| **Route** | The URL. `[id]` is a dynamic segment. |
| **Access** | The permission and scope that reveal the screen — never a role name, because `FR-1.2` stores every grant as data that `OFFICE_ADMIN` edits at runtime on `S-19`. Role names appear only as *who holds this today*. |
| **Spec** | The requirement IDs the entry satisfies. |
| **States** | Empty, loading, and error behaviour, in one line. |
| `✔` `P4` `P5` `P6` `PM` | Delivery phase, per `spec.md` §2.3. On a screen it follows the heading; on a popup it is the Phase column. A screen carries the phase in which it becomes *usable*, so a screen whose data source lands earlier still tags at the phase that builds the screen. |

**On permission names.** `spec.md` never enumerates individual permissions — `FR-1.2` only requires that every
permission and the scope each role holds it at is stored as data. Names like `attendance.read` below are
therefore *indicative placeholders* showing which grant gates which screen; the real names are settled when
the permission set is defined, and changing them changes nothing in this document but the labels.

Three rules govern the whole inventory:

- **Screens are shared, not per role.** One screen per job. Controls appear or vanish with the viewer's permissions.
  There is no `IT` user list separate from an `OFFICE_ADMIN` one.
- **Nothing is destroyed** (`DC-3`). Every delete in this document is a soft delete. No screen offers a hard delete.
- **Every override, correction, and soft delete carries a mandatory reason** (`FR-4.10`), collected by `P-46`.

---

## 2. Navigation map

```
/                          S-04  P6  Home
├── /exceptions            S-05  P6  Exceptions dashboard      M-2
├── /users                 S-06  ✔   User roster               M-3
│   ├── /users/[id]        S-07  P4  User detail
│   └── /users/import      S-08  P4  Roster import
├── /attendance            S-09  P5  Attendance summary        M-4
│   ├── /attendance/daily  S-10  P5  Daily attendance (2 views)
│   ├── /attendance/annual S-21  P6  Annual summary
│   ├── /attendance/import S-11  P5  Attendance import
│   └── /attendance/[userId]/[date]
│                          S-12  P5  Day record detail
├── /leave                 S-13  P5  Person picker             M-5
│   ├── /leave/[userId]/ledger
│   │                      S-14  P5  Balance history
│   └── /pto               S-15  P6  PTO awards and CTO applications
├── /teams                 S-16  P4  Teams                     M-6
│   └── /teams/[id]        S-17  P4  Team configuration
├── /settings              S-18  P4  Company configuration     M-7
│   └── /settings/access   S-19  P4  Access control matrix
└── /audit                 S-22  P4  Audit log                 M-9

Retired, redirecting:  /reports → /attendance  ·  /reports/annual →
/attendance/annual  ·  /attendance/entry → /attendance/daily

/signin  S-01 ✔   ·   /403  S-02 ✔   ·   /404  S-03 ✔          M-1
```

**Phase tags** carry `spec.md` §2.3's delivery scheme: `✔` delivered, `P4`
basic, `P5` intermediate, `P6` complex, `PM` post-MVP. `ARCHITECTURE.md` §32.1
is the canonical map.

---

## 3. Modules

### M-1 · Access & Session

Covers `FR-1.1`, `FR-1.5`, `FR-8.2`. No popups — every rejection is an inline state, so the reason is readable
without a dismissable overlay.

#### S-01 · Sign in · `✔`

- **Route** `/signin`
- **Purpose** Google sign in. The only unauthenticated screen.
- **Access** Public.
- **Spec** `FR-1.1`, `FR-1.5`, `DC-8`
- **States** Idle → redirecting. Five distinct rejection messages, never one generic failure: email is on an
  unauthorised Workspace domain; no user holds that work email; the user is soft deleted; login is disabled;
  today falls outside the user's employment period.

#### S-02 · Access denied · `✔`

- **Route** `/403`
- **Purpose** Names the permission the viewer lacks, so a narrowed scope is diagnosable rather than mysterious.
- **Access** Any signed-in user.
- **Spec** `FR-8.2`, `NFR-7`
- **States** Static. Offers a link back to `S-04`.

#### S-03 · Not found · `✔`

- **Route** `/404`
- **Purpose** Unknown route, or a record the viewer's scope does not reach.
- **Access** Any signed-in user.
- **Spec** `NFR-7`
- **States** Static. A record outside the viewer's scope resolves here, not to `S-02`, so existence is not leaked.

---

### M-2 · Home & Exceptions

#### S-04 · Home · `P6`

- **Route** `/`
- **Purpose** Landing page for every role. Launchpad into the modules the viewer's permissions reach, plus a
  snapshot of their own attendance and balances.
- **Access** Any signed-in user. Tiles render per permission; a viewer holding only attendance read sees the
  snapshot and nothing else.
- **Spec** `NFR-1`, `FR-8.1`
- **Sections** Own attendance and balance snapshot · Navigation tiles per permitted module · Exception counts
  by queue, linking into `S-05`, for viewers holding the exceptions permission.
- **Popups** None.
- **States** Empty: a new user with no records sees the tiles and an explanatory line instead of zeroed stats.
  Loading: skeleton tiles. Error: per-tile, so one failing count does not blank the page.

#### S-05 · Exceptions dashboard · `P6`

- **Route** `/exceptions`
- **Purpose** The single work queue of everything needing attention. Every unresolved item in the system
  surfaces here and nowhere else.
- **Access** `exceptions.read` at `ALL`. Held by `OFFICE_ADMIN`. Explicitly withheld from `EMPLOYEE` per `FR-8.1`.
- **Spec** `FR-8.6`, `NFR-1`, `NFR-3`
- **Sub-views (tabs)** Each shows a count, and each row offers approve, approve with a changed amount, and decline
  where those apply.

  | Tab | Raised by |
  | --- | --------- |
  | Missing check in or check out | `FR-4.8` |
  | Duplicate punch | `FR-4.7` |
  | Impossible duration — over 24 h, or a check out before its check in | `FR-8.6` |
  | Date with no shift assigned | `FR-3.12` |
  | Required configuration value not set | `FR-3.13` |
  | Unmatched import row | `FR-4.4` |
  | Unresolved late arrival | `FR-6.10` |
  | Exhausted leave or PTO balance | `FR-8.6` |
  | PTO award approaching expiry | `FR-7.4` |
  | PTO awaiting approval, with the rule that suggests it | `FR-7.1` |
  | CTO awaiting approval, with the rule that suggests it | `FR-7.5` |
  | Employment-period reduction awaiting approval | `FR-2.11` |

- **Popups** `P-01` `P-02` `P-03` `P-04` `P-05` `P-06` `P-07` · also `P-12` `P-21`
- **States** Empty per tab: "Nothing outstanding" rather than an empty grid. Paged, never fully materialised —
  the backlog grows with the roster (`NFR-3`, `DC-10`).

---

### M-3 · People

#### S-06 · User roster · `✔`

- **Route** `/users`
- **Purpose** Every user, searchable and filterable. The entry point for the whole user lifecycle.
- **Access** `user.read` at `ALL`.
- **Spec** `FR-2.1`, `FR-2.4`, `FR-2.10`, `DC-10`
- **Columns** Name · employee code · team · role · employment type · tracked · date of joining · status.
- **Filters** Team, role, employment type, tracked, active or soft deleted.
- **Behaviour** A soft-deleted user stays listed and is marked *no longer active*; they are excluded from the
  active-user count and never offered as the subject of a new record (`FR-2.4`). An untracked user is marked as
  such (`FR-2.10`).
- **Popups** `P-08` `P-15` `P-16`
- **States** Empty: before the roster import, points at `S-08`. Loading: skeleton rows. Paged (`NFR-3`).

#### S-07 · User detail · `P4`

- **Route** `/users/[id]`
- **Purpose** One user's whole record and history. The `FR-8.1` read surface for any colleague.
- **Access** `user.read` at `ALL` for the profile. Each tab gates on its own permission; edit controls need
  the matching write permission.
- **Spec** `FR-2.5`, `FR-2.6`, `FR-2.8`, `FR-2.12`, `FR-3.6`, `FR-3.14`, `FR-8.1`, `FR-9.4`
- **Sub-views (tabs)**
  - **Overview** — every field of `FR-2.6`: full name, employee code, work email, team, employment type,
    tracked, login enabled, date of joining, date of leaving, `deleted at`.
  - **Tenures** — every tenure with its start and end; the derived employment period; gaps shown explicitly
    (`FR-2.12`).
  - **Shift assignments** — each assignment with its effective date range (`FR-3.6`).
  - **Team assignments** — each assignment with its effective date range (`FR-3.14`).
  - **Attendance** — this user's day records, linking into `S-12`.
  - **Leave and balances** — typed balances and PTO, linking into `S-14`.
  - **History** — this user's audit trail (`FR-9.4`).
- **Popups** `P-09` `P-10` `P-11` `P-12` `P-13` `P-14` `P-15` `P-16` `P-17` `P-18` `P-19` `P-20` · `P-45`
- **States** A soft-deleted user renders fully with a persistent *no longer active* banner. Error: stale-write
  conflicts route to `P-47`.

#### S-08 · Roster import · `P4`

- **Route** `/users/import`
- **Purpose** One-time go-live migration of the roster from the old workbook's `Biometric ID` sheet. Imports
  people, not attendance — historical attendance is deliberately not migrated (`FR-6.13`).
- **Access** `user.import` at `ALL`.
- **Spec** `FR-2.9`, `FR-2.6`, `FR-3.4`, `DC-6`
- **Steps**
  1. **Upload** the `Biometric ID` sheet.
  2. **Complete missing details** — a grid listing every user against every field the sheet does not carry:
     work email, team, employment type, tracked, login enabled, date of joining, and a shift for anyone tracked.
     Nothing is guessed or defaulted (`DC-6`). The commit stays disabled until every outstanding field is filled.
  3. **Commit** — creates each user and opens their first tenure from the date of joining.
- **Popups** `P-46`
- **States** Empty: no file chosen. Error: an unreadable sheet, or a duplicate employee code — rejected with
  the code named, since employee codes are unique across all users including soft-deleted ones (`FR-2.6`).

---

### M-4 · Attendance & Leaves

**Exactly three pages**: the summary below, daily attendance, and the balance history under M-5. `S-13`'s
balances and `S-20`'s report columns were merged into `S-09`; the report builder screen is gone.

#### S-09 · Attendance summary · `P5`

- **Route** `/attendance`
- **Purpose** One row per colleague over a chosen period: what the engine concluded, what the calendar
  expected, and what every leave balance stands at. The merge of the old attendance overview, the leave
  balances screen and the report builder.
- **Access** `attendance.read`, seeded at `ALL` for every role per `FR-8.1`. The scope narrows the ROWS:
  `SELF` sees their own, `TEAM` their team, `ALL` everyone — so narrowing it on `S-19` turns this into a
  personal view with no code change (MVP criterion 4). `report.build` gates the export only.
- **Spec** `FR-8.1`, `FR-2.4`, `FR-2.10`, `FR-5.6`, `FR-5.7`, `FR-3.9`, `FR-8.3`, `FR-8.5`, `NFR-3`
- **Columns** In collapsible groups, thirty-two in all with three leave types. Name and code frozen ·
  *Calendar*: working days · holidays · *Attendance*: present · absent · WFH used · late days · short days ·
  holiday work · *Hours*: checked in · expected · approved leave · PTO balance · *per leave type*: opening ·
  credited · availed · deductions · CTO applied · balance. Leave groups open collapsed to their balance.
  WFH used carries the team's monthly quota beside it — `3 of 5` — but only over a month, since `BR-16`
  caps it per month and a week against a monthly ceiling is not a ratio (`FR-5.5`).
- **Filters** Weekly / monthly / custom, week starting Monday · team · colleague · **just me**. The period
  and the collapsed set travel in the URL, so a view is a link.
- **Behaviour** Untracked users are excluded from every total, and the exclusion is stated on screen rather
  than left silent (`FR-2.10`). A soft-deleted user's figures inside their employment period are unchanged
  and marked *no longer active* (`FR-2.4`). Expected hours are the shift held on each working day with
  approved leave netted off; the leave netted off is its own column. Every balance links to the ledger that
  produced it (`NFR-11`).
- **Popups** `P-43` `P-45`
- **States** Empty: a range with no records says so. Paged and virtualised (`DC-10`).

#### S-10 · Daily attendance · `P5`

- **Route** `/attendance/daily`
- **Purpose** Two views of the same days. **By date**: enter and correct attendance for one team on one date,
  the write surface, built so a single day's correction takes three clicks or fewer from `S-04` (`NFR-1`).
  **Day by day**: every date in a period for whoever is selected, read only, in the shape of the workbook it
  replaces.
- **Access** `attendance.read` at `ALL`. The by-date view needs `attendance.write` and is offered only to
  those who hold it — it materialises the team's day records when it opens (`D-15`), so exactly one view is
  rendered per request and a reader is never shown a tab that would answer 403.
- **Spec** `FR-4.1`, `FR-4.8`, `FR-4.9`, `FR-5.1`, `FR-5.2`, `FR-2.12`, `NFR-1`
- **Columns, by date** Punches · worked duration · day type · day status · late minutes · deduction and the
  rule that produced it · override marker.
- **Columns, day by day** Employee, spanning their block · day and date · check-in · check-out · total
  hours · leave balance · leave used · leave awarded.
- **Filters** By date: team · date. Day by day: weekly / monthly / custom · team · a multi-select of
  colleagues within it. The view and the filters travel in the URL.
- **Behaviour** Untracked users appear in neither — they receive no day records (`FR-2.10`). A day whose
  shift is unknown shows an empty status and links to `P-12` (`FR-3.12`). The day-by-day view is continuous:
  every date in the period has a row whether or not anything was recorded on it, since a view built only
  from the records that exist cannot show a gap. Dates outside the employment period are marked rather than
  shown as absence (`FR-2.12`). A punch is read in the timezone of the shift it belongs to (§7.2); a missing
  counterpart says nothing rather than midnight (`FR-4.8`).
- **Popups** `P-21` `P-22` `P-23` `P-24` `P-25` `P-46` `P-47`
- **States** Empty: a date outside every user's employment period renders no rows and says why. Day by day
  with nobody selected says so rather than rendering a bare table.

#### S-11 · Attendance import · `P5`

- **Route** `/attendance/import`
- **Purpose** Bulk load punches from the biometric Excel export.
- **Access** `attendance.import` at `ALL`.
- **Spec** `FR-4.2`, `FR-4.3`, `FR-4.4`, `FR-4.5`, `FR-4.11`, `NFR-4`, `DC-6`
- **Steps**
  1. **Upload** a file in the `FR-4.3` format: `Sr No.`, `Employee Code`, `Employee Name`, `Type`, `Date`, `Time`.
  2. **Confirm the date format** before validation runs (`FR-4.11`).
  3. **Preview** accepted rows against rejected rows, each rejection carrying its stated reason: no employee
     code; a code matching no user; an untracked user; a date unparseable under the confirmed format; a date
     outside the user's employment period. `Employee Name` is displayed for the reader and never used to match.
  4. **Commit** atomically — every accepted row is written or none is (`FR-4.5`).
- **Popups** `P-46`
- **States** Validation of 40,000 rows previews within 10 seconds (`NFR-4`). Error: the file is rejected whole
  before any commit, and the user corrects and re-uploads without leaving the browser (`NFR-1`).

#### S-12 · Day record detail · `P5`

- **Route** `/attendance/[userId]/[date]`
- **Purpose** Everything the engine concluded about one user on one date, and why. This is where `FR-5.x`
  day classification becomes visible.
- **Access** `attendance.read` at `ALL`.
- **Spec** `FR-3.5`, `FR-3.11`, `FR-4.6`, `FR-5.1`, `FR-5.2`, `FR-5.3`, `FR-5.8`, `FR-5.9`, `FR-6.11`,
  `FR-6.12`, `FR-7.6`, `FR-9.4`, `NFR-11`
- **Sections**
  - **Punches** — every punch with its instant, type, source (form or import), work date, and duplicate flag.
    Multiple check in / check out pairs aggregate into one day total (`FR-4.6`).
  - **Computed** — worked duration, day type, day status, late minutes, early departure minutes, and the
    classification order that produced the status (`FR-5.9`).
  - **Deduction** — the amount and the named ladder row that produced it (`FR-7.6`).
  - **Overrides** — each override shown beside the engine's value with who, why, and when. There is no separate
    override record (`FR-6.11`), and a recalculation refreshes the engine's value while leaving the override
    standing (`FR-6.12`).
- **Popups** `P-21` `P-22` `P-23` `P-24` `P-25` `P-45` `P-46` `P-47`
- **States** Empty status where no shift is assigned, with the reason named and a link to `P-12` (`FR-3.12`).
  A date in a tenure gap carries no day record at all and says so (`FR-2.12`).

---

### M-5 · Leave & Balances

#### S-13 · Person picker · `P5`

- **Route** `/leave`
- **Purpose** Choose a colleague, read their balance history. The typed balances that used to live here are
  columns of `S-09` now, beside the attendance they explain.
- **Access** `leave.read`, seeded at `ALL` per `FR-8.1`. A viewer whose scope is `SELF` never sees this
  screen — `proxy.js` redirects them to their own `S-14`, since a list of one person exists only to be
  clicked through.
- **Popups** `P-19` — the cutover opening balance, `leave.write` only.
- **Superseded columns, now on `S-09`**
- **Spec** `FR-6.2`, `FR-6.5`, `FR-6.8`, `FR-6.9`, `FR-5.5`, `BR-12`, `BR-14`
- **Columns** Per leave type: opening · credited · availed · automatic deductions · CTO applied · balance.
  Plus WFH quota and balance (`FR-5.5`), and paternity and maternity as separate typed entries that never
  touch the standard balance (`FR-6.9`).
- **Filters** Date range · team · employee · **just me**.
- **Popups** `P-19` `P-26` `P-45`
- **States** Every number links to `S-14`, so `NFR-11` — "why is this number what it is" — is answerable in
  one click.

#### S-14 · Ledger and balance trace · `P5`

- **Route** `/leave/[userId]/ledger`
- **Purpose** Every immutable balance movement, in order, with the rule that produced it. The proof behind
  every number the app displays.
- **Access** `leave.read` at `ALL`.
- **Spec** `FR-6.6`, `FR-6.8`, `FR-7.6`, `NFR-11`, `DC-4`, MVP criterion 11
- **Columns** Date · type · amount · running balance · named rule or *manual grant* · actor · reason ·
  reversal marker.
- **Behaviour** Read only by design. Nothing on this screen can be edited or deleted; a movement is cancelled
  only by a reversing entry appended elsewhere (`FR-6.8`). Entries of note carry their own label: opening
  balance at cutover (`FR-6.13`), lapsed on departure (`FR-6.6`), and PTO expiry (`FR-7.3`).
- **Popups** `P-45`
- **States** Empty: a user created after cutover starts with no opening entry, and the screen says so
  rather than showing a zero row.

#### S-15 · PTO awards and CTO applications · `P6`

- **Route** `/pto`
- **Purpose** Every PTO award and CTO application, at every stage: suggested, approved, declined, expired.
- **Access** `pto.read` at `ALL`; approval controls need `pto.approve`.
- **Spec** `FR-7.1`, `FR-7.2`, `FR-7.3`, `FR-7.5`, `FR-7.7`, `FR-7.8`, `FR-6.10`, `BR-18`–`BR-26`
- **Columns** User · date the extra work was performed · proposed amount · approved amount · named ladder row
  or *manual grant* · expiry date and whether it was extended · status · actor and reason.
- **Behaviour** Nothing posts to the ledger until approved (`FR-7.1`). A decline posts nothing, states its
  reason, and is not re-proposed unless that day's attendance data changes (`FR-7.8`). An award approved after
  its expiry date posts with the expiry extended, and the extension is visible on the award (`FR-7.3`).
- **Popups** `P-01` `P-02` `P-03` `P-04` `P-27` `P-45` `P-46`
- **States** Empty: no candidates, distinguished from all candidates already decided.

---

### M-6 · Organisation & Policy

Holds the per-team half of the `FR-6.4` configuration list. Every value is data, editable at runtime with no
redeploy (`DC-1`), and every value shown at seed is only a seed (`§3.10`).

#### S-16 · Teams · `P4`

- **Route** `/teams`
- **Purpose** Every team, with its manager and member count.
- **Access** `team.read` at `ALL`; write controls need `team.write`.
- **Spec** `FR-3.1`, `FR-3.2`
- **Behaviour** A soft-deleted team stays readable so past day records still resolve through the calendar and
  policy it held, but is no longer offered for assignment (`FR-3.2`).
- **Popups** `P-28` `P-29`
- **States** Empty: before setup, points at `P-28`.

#### S-17 · Team configuration · `P4`

- **Route** `/teams/[id]`
- **Purpose** One team's complete policy. Two teams configured differently produce different results for the
  same period — MVP criteria 6 and 13.
- **Access** `team.read` at `ALL`; each tab's edits need `config.write`.
- **Spec** `FR-3.3`, `FR-3.4`, `FR-3.7`, `FR-3.8`, `FR-6.4`, `BR-1`–`BR-27`
- **Sub-views (tabs)**

  | Tab | Holds | Spec |
  | --- | ----- | ---- |
  | Members | Users assigned to this team, and the manager | `FR-3.1` |
  | Shifts | Named shifts: start, end, required duration, grace, timezone; the team default | `FR-3.3`, `FR-3.4`, `BR-1`–`BR-4`, `BR-7` |
  | Holiday calendar | Typed entries: public holiday, company holiday | `FR-3.7`, `BR-15` |
  | Weekly off | The team's non-working-day pattern | `FR-3.8` |
  | Leave policy | Leave types, annual entitlement, accrual period, carry forward, and the type automatic deductions post to | `FR-6.2`, `FR-6.3`, `FR-6.6`, `BR-12`, `BR-13` |
  | Ladders | Leave Deduction Ladder, PTO award ladder and validity period, CTO application ladder | `FR-6.3`, `FR-7.2`, `FR-7.3`, `FR-7.5`, `BR-9`, `BR-18`–`BR-26` |
  | Thresholds & windows | WFH quota, short-day threshold, holiday-work threshold, midnight-crossing window, duplicate-punch window | `FR-5.5`, `FR-5.7`, `FR-5.8`, `FR-4.7`, `BR-5`, `BR-16`, `BR-17`, `BR-27` |

- **Popups** `P-30` `P-31` `P-32` `P-33` `P-34` `P-35` `P-36` `P-37` `P-38` `P-39` `P-46` `P-47`
- **States** Any unset required value is flagged inline *and* raised on `S-05` until set — never guessed or
  defaulted (`FR-3.13`, `DC-6`). Saving a policy change warns that it triggers recalculation from its
  effective date, and that existing overrides survive it (`FR-6.12`).

---

### M-7 · Company Config & Access Control

Holds the company-wide half of the `FR-6.4` list.

#### S-18 · Company configuration · `P4`

- **Route** `/settings`
- **Purpose** Settings that are not per team.
- **Access** `config.read` at `ALL`; edits need `config.write`.
- **Spec** `FR-2.6`, `FR-1.5`, `FR-6.4`
- **Sections** Employment types — `PERMANENT`, `CONTRACT`, `SUPPORT_STAFF`, `INTERN` seeded, and no permission
  depends on any of them · Authorised Google Workspace domains for sign in.
- **Popups** `P-40` `P-41` `P-46`
- **States** Note: there is no company-wide default timezone and none can be set here — every timestamp
  resolves through the shift's own timezone (`FR-3.10`, `DC-5`).

#### S-19 · Access control matrix · `P4`

- **Route** `/settings/access`
- **Purpose** Every permission the system defines, against every role, with the scope each holds it at. The
  screen that makes `FR-1.2` real: a change here takes effect on the next request with no redeploy.
- **Access** `permission.write` at `ALL`.
- **Spec** `FR-1.2`, `FR-1.3`, `FR-1.4`, `FR-6.7`, `DC-2`, MVP criteria 4 and 7
- **Layout** Rows are permissions, columns are the four seeded roles, each cell a scope of `SELF`, `TEAM`,
  `ALL`, or none.
- **Behaviour** `OFFICE_ADMIN`'s column is locked at `ALL` throughout: any edit that would remove a permission
  from it or narrow its scope is rejected with that stated as the reason (`FR-1.3`). The four roles are the
  complete set — the screen offers no way to add a fifth. `MANAGER`'s `TEAM`-scoped leave approval permission
  is seeded and visible here from Phase 1, even though its workflow (`S-24`) is post-MVP.
- **Popups** `P-42` `P-46` `P-47`
- **States** Static list; no paging needed at this size.

---

### Reports — merged into M-4

`S-20`'s columns are part of `S-09`, its export is a button on that screen, and `S-21` moved to
`/attendance/annual`. `report.build` survives as the permission gating the export and `/api/reports`.

#### S-20 · Report builder · **retired**

- **Route** `/reports` → redirects to `/attendance`
- **Purpose** An attendance report for any date range, per user and per team, reproducing the columns the
  office administration team relies on today.
- **Access** `report.build` at `ALL`. Restricted — explicitly **not** granted to `EMPLOYEE`, unlike the
  `S-09` read surface (`FR-8.1`).
- **Spec** `FR-8.3`, `FR-3.9`, `FR-2.4`, `FR-2.10`, `NFR-3`, MVP criteria 10, 13, 17, 19
- **Filters** Arbitrary date range, not only a calendar month · team · user · single tenure or the whole
  employment period.
- **Behaviour** Working-day and holiday counts derive from the calendar of the team the user held on each
  date, not their current team (`FR-3.9`, `FR-3.14`). Untracked users are excluded and the exclusion is
  stated (`FR-2.10`). Soft-deleted users appear with unchanged totals, marked *no longer active* (`FR-2.4`).
  A tenure gap shows as employed either side with no day records inside it.
- **Popups** `P-43`
- **States** A full-company month renders under 2 seconds at p95, paged rather than materialised whole
  (`NFR-3`, `DC-10`).

#### S-21 · Annual summary · `P6`

- **Route** `/attendance/annual`, reached from a row of `S-09`
- **Purpose** One user's year, aggregating every month.
- **Access** `attendance.read`, seeded at `ALL` per `FR-8.1` — readable for any colleague.
- **Spec** `FR-8.4`, `FR-6.5`, `FR-3.9`, `FR-8.1`, MVP criterion 9
- **Behaviour** Every month of the year is present. A month with no data renders as an explicit zero row and
  is never silently omitted — this is workbook defect **F1** (`FR-8.4`).
- **Popups** `P-43` `P-45`
- **States** Months outside the employment period are marked as such rather than shown as absence.

---

### M-9 · Audit

#### S-22 · Audit log · `P4`

- **Route** `/audit`
- **Purpose** Every change ever made, append only and retained indefinitely.
- **Access** `audit.read` at `ALL`.
- **Spec** `FR-1.6`, `FR-9.1`, `FR-9.2`, `FR-9.3`, `NFR-9`, `DC-3`
- **Columns** Time · actor · action · entity type and identifier · reason.
- **Filters** Actor · action · entity type · date range.
- **Behaviour** Read only without exception — the screen offers no edit or delete, because no application
  endpoint provides one (`FR-9.3`). Covers creates, updates, soft deletes, restores, approvals, rejections,
  overrides, corrections, and every authentication event, successful or failed (`FR-1.6`).
- **Popups** `P-44`
- **States** Paged (`DC-10`). Never empty in practice — the seed and the roster import both write records.

---

## 4. Cross-cutting popups

Reused across many screens rather than belonging to one.

| ID | Phase | Popup | Purpose | Spec |
| -- | ----- | ----- | ------- | ---- |
| `P-45` | `P4` | Record history drawer | The full change history of a single punch, day record, or balance: actor, action, before state, after state, time. | `FR-9.4`, `FR-9.2` |
| `P-46` | `✔` | Mandatory-reason confirm | Wraps every override, soft delete, restore, and manual adjustment. Shows the previous and new value; the confirm stays disabled until a reason is typed. | `FR-4.10`, `FR-6.10` |
| `P-47` | `✔` | Stale-write conflict | Rejects a write made against a stale version and shows the current state, so two `OFFICE_ADMIN` users on the same period never silently overwrite one another. | `NFR-14`, `DC-9` |

---

## 5. Popup index

### M-2 · Exception queue actions

| ID | Phase | Popup | Notes | Spec |
| -- | ----- | ----- | ----- | ---- |
| `P-01` | `P6` | Approve PTO award | Names the rule and the proposed amount; the amount is editable, including to a figure no ladder row produces. | `FR-7.1`, `FR-7.2` |
| `P-02` | `P6` | Approve CTO application | Names the rule; amount editable. Blocks when unexpired PTO is insufficient, and offers an explicit, audited override of that block. | `FR-7.5`, `FR-6.10`, `BR-26` |
| `P-03` | `P6` | Decline suggestion | Records actor, time, suggested amount, mandatory reason. Posts nothing. | `FR-7.8` |
| `P-04` | `P6` | Originate PTO award or CTO application | For a user and date the engine raised no suggestion for. Identified in the ledger as a manual grant. | `FR-7.7`, `FR-7.6` |
| `P-05` | `P6` | Employment-period reduction approval | Names the user, the change, the dates, and every record approval would soft delete. Approve or reject. Reversing entries are posted on approval. | `FR-2.11` |
| `P-06` | `P6` | Set missing configuration value | Names the entity and the outstanding field; stays queued until set. | `FR-3.13` |
| `P-07` | `P6` | Resolve duplicate punch | Keep or soft delete, so a flagged pair is never double counted. | `FR-4.7`, `FR-4.12` |

### M-3 · People

| ID | Phase | Popup | Notes | Spec |
| -- | ----- | ----- | ----- | ---- |
| `P-08` | `✔` | Create user | Full name, employee code, work email (optional), team, employment type, tracked, role, shift. Employee code unique across all users including soft-deleted ones. | `FR-2.1`, `FR-2.6` |
| `P-09` | `P4` | Edit user | The `FR-2.6` fields. Role, team, and shift changes are separate operations. | `FR-2.1`, `FR-2.6` |
| `P-10` | `P4` | Change role | One role at a time. Choosing `MANAGER` requires naming the team, and replaces that team's previous manager in the same action. | `FR-1.7`, `FR-1.4`, `FR-3.1` |
| `P-11` | `P4` | Move team | Effective date; history never rewritten. Names a replacement manager if the user manages the outgoing team. States whether the user takes the new team's default shift or keeps their own. | `FR-3.14` |
| `P-12` | `P4` | Assign shift | Effective date range, so a mid-year change is preserved historically. Required for a tracked user. Also reached from the `S-05` no-shift queue. | `FR-3.4`, `FR-3.6`, `FR-3.12` |
| `P-13` | `P4` | Toggle tracked | Audited. Deletes no attendance history already recorded. Turning it on starts producing day records from that point forward. | `FR-2.10` |
| `P-14` | `P4` | Toggle login enabled | Audited. Meaningful only with a work email. Revokes access without touching history. | `FR-1.5`, `FR-2.5` |
| `P-15` | `✔` | Soft delete user | Requires a date of leaving, which closes the open tenure. Warns when records fall outside the reduced period and raises `P-05`. Access is lost immediately, never waiting for that approval. | `FR-2.2`, `FR-2.11`, `FR-2.12` |
| `P-16` | `✔` | Restore user | Requires stating the case. **Correction**: reopens the most recent tenure, restores records, reverses the reversing entries and the lapse entry. **Re-hire**: opens a new tenure from a supplied start date, balance starts at zero, entitlement prorates from that start. Both clear `deleted at` and date of leaving. | `FR-2.3`, `FR-6.6` |
| `P-17` | `P4` | Add or edit tenure | Start and end dates. Rejects an end before its start, and rejects overlap with another tenure of the same user. Editing corrects a wrong date but cannot close an open tenure. | `FR-2.12` |
| `P-18` | `P4` | Soft delete tenure | Rejected when it is the user's last tenure that is not soft deleted. Raises `P-05` where records fall outside the reduced period. | `FR-2.12`, `FR-2.11` |
| `P-19` | `P5` | Set opening leave balance | Cutover only, entered by hand from the old workbook. Posts a ledger entry identified as such, dated at cutover, with a mandatory reason. | `FR-6.13` |
| `P-20` | `P5` | Override leave entitlement | Overrides the figure prorated from the date of joining or the tenure start. | `FR-2.7`, `FR-6.10` |

### M-4 · Attendance

| ID | Phase | Popup | Notes | Spec |
| -- | ----- | ----- | ----- | ---- |
| `P-21` | `P5` | Add or edit punch | Time, check in or check out, and the user it belongs to. A wrong punch is fixed by editing it, never by adding a cancelling punch. Rejects a move outside the employment period or onto an untracked user, and rejects a spring-forward time that does not exist locally. Recalculates both the day it left and the day it moved to. | `FR-4.1`, `FR-4.12`, `FR-3.11`, `FR-5.8` |
| `P-22` | `P5` | Soft delete punch | For a punch that should not be there. Triggers recalculation. | `FR-4.12`, `NFR-9` |
| `P-23` | `P5` | Set day status | `WFO`, `WFH`, `LEAVE` with its type, `HOLIDAY_WORK`, `WEEKLY_OFF`, `HOLIDAY`, `ABSENT`. `WFH` debits the WFH balance. Half a day of leave is `LEAVE` with a half-day amount on the ledger, not a status of its own. | `FR-4.9`, `FR-5.2`, `FR-5.4`, `FR-5.5` |
| `P-24` | `P5` | Adjust hours | Manually add or correct the hours on a day. | `FR-4.9`, `FR-6.10` |
| `P-25` | `P5` | Override late arrival or short day | Waives the deduction, which then counts as compliant. An `OFFICE_ADMIN` action, never a manager one. | `FR-6.10`, `BR-8` |

### M-5 · Leave & Balances

| ID | Phase | Popup | Notes | Spec |
| -- | ----- | ----- | ----- | ---- |
| `P-26` | `P5` | Record leave | Type is mandatory — a leave without one is rejected, so no consumption order between types is ever needed. Paternity and maternity post to their own typed balance and never touch the standard one. | `FR-6.2`, `FR-6.9`, `BR-11` |
| `P-27` | `P6` | Override PTO expiry | Extends or changes an award's expiry date. | `FR-7.3`, `FR-6.10` |

### M-6 · Organisation & Policy

| ID | Phase | Popup | Notes | Spec |
| -- | ----- | ----- | ----- | ---- |
| `P-28` | `P4` | Create or edit team | Names exactly one manager. | `FR-3.1`, `FR-3.2` |
| `P-29` | `P4` | Soft delete team | Rejected while any user who is not soft deleted is still assigned, naming those users so they can be moved first. A team with only past assignments may be soft deleted. | `FR-3.2` |
| `P-30` | `P4` | Shift | Name, start time, end time, required daily duration, grace period, timezone. Create, edit, soft delete; set the team default. | `FR-3.3`, `FR-3.4`, `BR-1`–`BR-4`, `BR-7` |
| `P-31` | `P4` | Holiday | Date and type: public holiday or company holiday. Never depends on formatting or colour. A mid-year correction triggers recalculation of the affected dates. | `FR-3.7`, `BR-15` |
| `P-32` | `P4` | Weekly off pattern | Which days of the week are non-working for this team; not assumed to be Saturday and Sunday. | `FR-3.8` |
| `P-33` | `P4` | Leave types and entitlement | Types and their annual entitlement, seeded 10 Annual, 10 Sick, 10 Casual. | `FR-6.2`, `BR-12` |
| `P-34` | `P4` | Accrual and carry forward | Accrual period, seeded to the leave year, and the carry-forward policy. | `FR-6.6`, `BR-13` |
| `P-35` | `P4` | Leave Deduction Ladder | The bands, plus the single leave type automatic deductions post to (seeded Casual). Bands are percentages of the scheduled shift, not absolute hours. | `FR-6.3`, `BR-9`, `BR-26` |
| `P-36` | `P4` | PTO award ladder and validity | The bands the engine proposes from, and the validity period seeded at 30 days. The ladder decides what is proposed, never what may be approved. | `FR-7.2`, `FR-7.3`, `BR-18`–`BR-21` |
| `P-37` | `P4` | CTO application ladder | The lateness bands and the CTO amount each proposes. | `FR-7.5`, `BR-22`–`BR-25` |
| `P-38` | `P4` | WFH quota | Days per period and the total allowed over that period. A team set to zero allows none. | `FR-5.5`, `BR-16`, `BR-17` |
| `P-39` | `P4` | Thresholds and windows | Short-day threshold, holiday-work threshold, midnight-crossing punch window, duplicate-punch window. | `FR-5.7`, `FR-5.8`, `FR-4.7`, `BR-5`, `BR-27` |

### M-7 · Company Config & Access Control

| ID | Phase | Popup | Notes | Spec |
| -- | ----- | ----- | ----- | ---- |
| `P-40` | `P4` | Employment type | Create, edit, soft delete. No permission depends on employment type. | `FR-2.6`, `FR-6.4` |
| `P-41` | `P4` | Authorised Workspace domain | Add or remove a Google Workspace domain permitted to sign in. | `FR-1.5`, `FR-6.4` |
| `P-42` | `P4` | Edit permission grant | Sets the scope a role holds a permission at: `SELF`, `TEAM`, `ALL`, or none. Rejects any edit that reduces `OFFICE_ADMIN`. Effective on the next request. | `FR-1.2`, `FR-1.3` |

### M-8 and M-9

| ID | Phase | Popup | Notes | Spec |
| -- | ----- | ----- | ----- | ---- |
| `P-43` | `P6` | Export report | Excel or CSV, of the report as currently filtered. | `FR-8.5` |
| `P-44` | `P4` | Audit record detail | Actor, action, entity type and identifier, before state, after state, time. Read only. | `FR-9.2`, `FR-9.3` |

---

## 6. Coverage matrix

Every requirement in `spec.md` §3, against the screen or popup that satisfies it.

**This table deliberately carries no Phase column.** Both sides of it are already
tagged — the requirement in `spec.md` §3, the screen or popup above — so a third
copy of the same fact would be pure drift surface. Read the phase off whichever
side you came from.

| Req | Satisfied by |
| --- | ------------ |
| `FR-1.1` | `S-01` |
| `FR-1.2` | `S-19`, `P-42` |
| `FR-1.3` | `S-19`, `P-42` |
| `FR-1.4` | `S-19`, `P-10` |
| `FR-1.5` | `S-01`, `P-14`, `P-41` |
| `FR-1.6` | `S-22` |
| `FR-1.7` | `P-10` |
| `FR-2.1` | `P-08`, `P-09` |
| `FR-2.2` | `P-15` |
| `FR-2.3` | `P-16` |
| `FR-2.4` | `S-06`, `S-09`, `S-20` |
| `FR-2.5` | `S-07` |
| `FR-2.6` | `S-07`, `P-08`, `P-09`, `P-40` |
| `FR-2.7` | `P-20`, `P-16` |
| `FR-2.8` | `S-07`, `S-22` |
| `FR-2.9` | `S-08` |
| `FR-2.10` | `P-13`, `S-06`, `S-09`, `S-20` |
| `FR-2.11` | `P-05`, `S-05`, `P-15`, `P-18` |
| `FR-2.12` | `S-07` (Tenures), `P-17`, `P-18` |
| `FR-3.1` | `P-28`, `P-10`, `P-11` |
| `FR-3.2` | `S-16`, `P-28`, `P-29` |
| `FR-3.3` | `S-17` (Shifts), `P-30` |
| `FR-3.4` | `P-30`, `P-12` |
| `FR-3.5` | `S-12` |
| `FR-3.6` | `P-12`, `S-07` (Shift assignments) |
| `FR-3.7` | `S-17` (Holiday calendar), `P-31` |
| `FR-3.8` | `S-17` (Weekly off), `P-32` |
| `FR-3.9` | `S-20`, `S-21` |
| `FR-3.10` | `P-30`, `S-18` |
| `FR-3.11` | `S-12`, `P-21` |
| `FR-3.12` | `S-05` (No shift), `P-12`, `S-12` |
| `FR-3.13` | `S-05` (Missing config), `P-06`, `S-17` |
| `FR-3.14` | `P-11`, `S-07` (Team assignments) |
| `FR-4.1` | `S-10`, `P-21` |
| `FR-4.2` | `S-11` |
| `FR-4.3` | `S-11` step 1 |
| `FR-4.4` | `S-11` step 3, `S-05` (Unmatched rows) |
| `FR-4.5` | `S-11` step 4 |
| `FR-4.6` | `S-12` |
| `FR-4.7` | `S-05` (Duplicate), `P-07`, `P-39` |
| `FR-4.8` | `S-05` (Missing punch), `P-21` |
| `FR-4.9` | `S-10`, `P-23`, `P-24`, `P-26` |
| `FR-4.10` | `P-46`, `S-22` |
| `FR-4.11` | `S-11` step 2 |
| `FR-4.12` | `P-21`, `P-22`, `P-07` |
| `FR-5.1` | `S-12`, `S-10` |
| `FR-5.2` | `S-12`, `S-10`, `P-23` |
| `FR-5.3` | `S-12` |
| `FR-5.4` | `P-23` |
| `FR-5.5` | `P-38`, `S-13`, `P-23` |
| `FR-5.6` | `S-09`, `S-20`, `P-39` |
| `FR-5.7` | `S-09`, `S-20`, `P-39` |
| `FR-5.8` | `S-12`, `P-39` |
| `FR-5.9` | `S-12` |
| `FR-6.1` | `S-12`, `S-14` |
| `FR-6.2` | `S-13`, `P-33`, `P-26` |
| `FR-6.3` | `P-35`, `S-12` |
| `FR-6.4` | `S-17`, `S-18` (and `P-30`–`P-42`) |
| `FR-6.5` | `S-13`, `S-21` |
| `FR-6.6` | `P-34`, `S-14` |
| `FR-6.7` | `S-19` (permission, Phase 1) · `S-23`, `S-24`, `P-48`, `P-49` (post-MVP) |
| `FR-6.8` | `S-14` |
| `FR-6.9` | `P-26`, `P-33`, `S-13` |
| `FR-6.10` | `P-25`, `P-23`, `P-24`, `P-02`, `P-01`, `P-20`, `P-27` |
| `FR-6.11` | `S-12`, `S-15` |
| `FR-6.12` | `S-12`, `S-17` |
| `FR-6.13` | `P-19`, `S-14` |
| `FR-7.1` | `P-01`, `S-05`, `S-15` |
| `FR-7.2` | `P-01`, `P-36` |
| `FR-7.3` | `P-27`, `P-36`, `S-15` |
| `FR-7.4` | `S-05` (Nearing expiry), `S-04` |
| `FR-7.5` | `P-02`, `P-37`, `S-15` |
| `FR-7.6` | `S-14`, `S-12` |
| `FR-7.7` | `P-04` |
| `FR-7.8` | `P-03` |
| `FR-8.1` | `S-09`, `S-07`, `S-13`, `S-21` |
| `FR-8.2` | `S-02`, `S-19` |
| `FR-8.3` | `S-20` |
| `FR-8.4` | `S-21` |
| `FR-8.5` | `P-43` |
| `FR-8.6` | `S-05` |
| `FR-9.1` | `S-22` |
| `FR-9.2` | `P-44`, `P-45` |
| `FR-9.3` | `S-22`, `P-44` |
| `FR-9.4` | `P-45`, `S-07` (History) |

---

## 7. Post-MVP · `PM`

In scope for the product, not for the MVP. The schema supports all of it from day one, so no migration is
needed when it ships (`DC-12`, `§2.3`). **Nothing here belongs to Phases 4 to 7** — every entry tags `PM`.

| ID | Phase | Screen or popup | Route | Purpose | Spec |
| -- | ----- | --------------- | ----- | ------- | ---- |
| `S-23` | `PM` | Leave request | `/leave/request` | Employee self service: submit a typed leave request for a date range. | `FR-6.7` |
| `S-24` | `PM` | Leave approvals | `/leave/approvals` | A manager's queue of requests from their own team. | `FR-6.7` |
| `S-25` | `PM` | Company switcher | `/settings/companies` | Multi-company / multi-tenant selection. No MVP surface. | `§2.3` |
| `P-48` | `PM` | Submit leave request | — | Type, date range, reason. | `FR-6.7` |
| `P-49` | `PM` | Approve or reject leave request | — | Decision with a reason, scoped to the manager's own team. | `FR-6.7` |

**Note:** `MANAGER`'s leave approval permission at `TEAM` scope is seeded in **Phase 1** and is visible on
`S-19` from day one. Only the request and approval *workflow* is deferred.

---

## 8. Deliberately no screen

Not an omission. Each of these is satisfied without a surface of its own, and is recorded here so a reader
does not go looking.

| Requirement | Why there is no screen |
| ----------- | ---------------------- |
| `FR-5.1`–`FR-5.9` day classification | Engine logic. It surfaces as the day type, day status, worked duration, late minutes, and named rule on `S-12`, and as the aggregate columns on `S-09`. |
| `FR-6.1` automatic deduction | Computed from attendance without manual entry, by definition. Visible on `S-12` and traceable on `S-14`. |
| `FR-6.8` immutable ledger | A storage rule, not a screen. `S-14` is its read surface; nothing anywhere offers an edit. |
| `FR-3.10`, `FR-3.11` time resolution | Resolved through the shift's timezone (`P-30`). There is deliberately no company-wide timezone setting to build a screen for. |
| Multi-company / multi-tenant | Schema support only in the MVP (`DC-12`). `S-25` is post-MVP. |
| `NFR-1`–`NFR-15`, `DC-1`–`DC-13` | Constraints on how every screen behaves, not features. They appear in the **Access**, **Behaviour**, and **States** lines above — paging (`NFR-3`, `DC-10`), stale-write rejection (`NFR-14`, `P-47`), WCAG 2.1 AA and no status conveyed by colour alone (`NFR-12`, `DC-11`), and no unexplained abbreviation without a tooltip or legend (`NFR-2`). |
