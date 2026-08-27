# Pulse — Specification

This document states what Pulse does, what it must be, and the constraints its design must respect, in a form that can be built from directly. Every requirement carries a stable ID — `FR-`, `NFR-`, `BR-`, `DC-` — so any line can be cited from a plan, a test, or a commit message.

---

## Table of Contents

1. [Introduction](#1-introduction)
   - 1.1 Purpose
   - 1.2 Scope
   - 1.3 Definitions
   - 1.4 Sources
2. [General Description](#2-general-description)
   - 2.1 Problem and Product
   - 2.2 Actors and Roles
   - 2.3 Delivery Phases
3. [Functional Requirements](#3-functional-requirements)
   - 3.1 Identity, Authentication, and Access Control
   - 3.2 User and Employee Management
   - 3.3 Organisation, Shifts, and Calendar
   - 3.4 Attendance Capture
   - 3.5 Day Classification
   - 3.6 Leave Engine
   - 3.7 PTO and CTO
   - 3.8 Reporting and Employee Self Service
   - 3.9 Auditability
   - 3.10 Business Rules and Seed Values
   - 3.11 MVP Acceptance Criteria
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [Design Constraints](#5-design-constraints)

---

## 1. Introduction

### 1.1 Purpose

This document specifies **Pulse**, a web application that replaces the Excel workbook the company uses to manage attendance, leave, PTO, and CTO. It states what the system does, what it must be, and the constraints its design must respect.

### 1.2 Scope

In scope: identity and access control, user lifecycle, teams and shifts and calendars, attendance capture, day classification, the leave engine, PTO and CTO, reporting and self service, and audit.

### 1.3 Definitions

**Entities.** The things the system stores as records.

| Entity | Meaning |
| ---- | ------- |
| **User** | One staff member. A single entity with no separate account record, per `FR-2.5`. |
| **Tenure** | One unbroken period of employment for a user, with a start and an end date. It exists for one reason: so a re-hired user's gap is not treated as absence. |
| **Role** | One of the four permission bundles: `OFFICE_ADMIN`, `IT`, `MANAGER`, `EMPLOYEE`. |
| **Team** | A group of users with exactly one manager, carrying its own shift, holiday calendar, and weekly off pattern. |
| **Shift** | A named working window: start time, end time, required daily duration, grace period, timezone. |
| **Holiday calendar** | A team's typed holiday entries: public holiday, company holiday. |
| **Punch** | One raw event — a single check in or check out, for one user, at one instant. This is what the biometric export supplies, one row per punch. |
| **Day record** | What the engine works out for one user on one date. Exactly one per tracked user per date in their employment period. |
| **Ledger entry** | One immutable balance movement. Balances are replayed from these and never stored. |
| **Audit record** | One append-only entry describing a change: actor, action, entity, before state, after state, time. |

**Attributes and derived values.** Fields on the entities above, not entities of their own.

| Term | Sits on | Meaning |
| ---- | ------- | ------- |
| **Employment type** | User | What kind of staff member they are. Independent of role; no permission depends on it. |
| **Tracked** | User | Whether this user's attendance is tracked. Set per user and defaults to on. |
| **Date of joining** | User | The date the user first joined the company; always set. Kept in step with the start of their earliest tenure. |
| **Date of leaving** | User | The user's real last working day, empty until they leave and set only by soft delete. Kept in step with the end of their most recent closed tenure. |
| **Employment period** | Derived from tenures | All of a user's non-soft-deleted tenures added together. Worked out when needed, never stored. |
| **`deleted at`** | User | The moment `IT` soft deleted the record. A fact about the system, not about the employment. |
| **Day type** | Day record | What kind of date it is for the team the user held on that date: `WORKING`, `WEEKLY_OFF`, `HOLIDAY`. Comes from that team's calendar and weekly off pattern. |
| **Day status** | Day record | What the user actually did: `WFO`, `WFH`, `LEAVE`, `HOLIDAY_WORK`, `WEEKLY_OFF`, `HOLIDAY`, `ABSENT`. Comes from punches, leave, and overrides. |
| **Work date** | Punch | The local date on which the user's shift started. It is the link saying which day record a punch belongs to. |
| **Override** | The record it changes | An `OFFICE_ADMIN` value stored beside the value the engine worked out, with who, why, and when. |
| **Soft delete** | Most entities | Marking a record inactive instead of removing it, so any mistake can be undone. |

**PTO** is Paid Time Off, the single earned balance: it is credited only by an approved award for work beyond a user's scheduled hours, and it expires per `FR-7.3`. **CTO** is Compensatory Time Off, which is not a balance of its own but one of the two ways to spend PTO, the other being taking it as a paid day off. Every movement is a ledger entry.

### 1.4 Sources

Requirements originate from three sources: a supervisor briefing and review session, an HR session on PTO and CTO policy, and reverse engineering of the live Excel workbook. Codes `F1`, `F2`, and so on refer to numbered defects in that workbook. Where sources disagreed, the conflict is settled in the requirement it affects, and 3.10 records each workbook behaviour deliberately not adopted.

---

## 2. General Description

### 2.1 Problem and Product

An Excel workbook was used to manage attendance, leave, PTO, CTO, and related information. A manual system like this gets complex to maintain as employee count increases.

Pulse is a user-friendly web application that serves as a complete Attendance Management System. It replaces the workbook, keeps the operational vocabulary the office administration team already understands, makes policy explicit and configurable instead of implicit in formulas, allows per-team configuration, enforces Role Based, Attribute Based, and Fine Grained Access Control, and maintains an audit log for a trackable workflow.

### 2.2 Actors and Roles

The system recognises four roles. There is exactly one office administration role and it holds every permission.

| Actor | Role | What they do |
| ----- | ---- | ------------ |
| Office administration team | `OFFICE_ADMIN` | The single all-permission role. Runs the system daily: records attendance, approves PTO and CTO, configures teams, calendars, shifts, and policy. HR uses this account; there is no separate HR actor. May also do everything `IT` does. |
| IT team member | `IT` | The user lifecycle only: create a user with their team, employment type, tracked flag, role, and shift; soft delete; restore. That is the whole of `IT`'s authority. |
| Team manager | `MANAGER` | Leads one team. Approves leave for their own team. No authority over late arrivals, which are an `OFFICE_ADMIN` override. |
| Employee | `EMPLOYEE` | Any staff member who is not `OFFICE_ADMIN`, `IT`, or `MANAGER`. Read only, company wide. |

The biometric door machine and the separate system receiving its signal are out of scope: Pulse begins at manual entry or file import. The `MANAGER` role and its leave approval permission are seeded in Phase 1, though the leave request workflow ships in Phase 2 (`FR-6.7`).

### 2.3 Delivery Phases

Every requirement in §3, and every screen and popup in `list-of-screens.md`, carries one of the tags below. `ARCHITECTURE.md` §32.1 holds the canonical phase map and is the only place the full membership of a phase is listed; the tags here answer the same question where you are already reading.

| Tag | Phase | Means |
| --- | ----- | ----- |
| `✔` | 0–3 | Delivered. No remaining work. |
| `✔+` | 0–3, ongoing | Mechanism built; every later phase extends it to its own entities. |
| `P4` | 4 — **Basic** | Configuration and lifecycle CRUD. No calculation, and nothing beneath it is unbuilt. |
| `P5` | 5 — **Intermediate** | The calculation engine and the entities it derives. |
| `P6` | 6 — **Complex** | Multi-step human approval workflows and wide aggregation. |
| `P7` | 7 — **Testing** | Verification, not new surface. §3.11, §4 and §5 in full. |
| `PM` | — | Post-MVP. In scope for the product, not for the MVP. |

**A requirement carries the phase in which its *last* remaining piece lands**, so the tag answers "can this be ticked off yet?". Several requirements split across phases — the engine raises an exception in Phase 5 and `S-05` surfaces it in Phase 6 — and `ARCHITECTURE.md` §32.1 names each split.

| Requirement group | Phase |
| ----------------- | ----- |
| FR-1.x Identity, authentication, access control | `✔` model · `P4` administration screens |
| FR-2.x Users and lifecycle | `✔` core · `P4` remainder · `P6` employment-period reduction |
| FR-3.x Org, shifts, calendars | `P4` configuration · `P5` time resolution |
| FR-4.x Attendance capture | `P5` |
| FR-5.x Day classification | `P5` |
| FR-6.x Leave engine | `P4` policy configuration · `P5` ledger and balances · `P6` overrides |
| FR-7.x PTO and CTO | `P6` |
| FR-8.x Reporting and self service | `P6` |
| FR-9.x Audit | `✔+` writing · `P4` read surface |
| NFR-x, DC-x | Constraints on every phase; verified in `P7` |

**Post-MVP (`PM`).** In scope for the product, not for the MVP. The schema supports them from day one so no migration is needed when they ship: employee self service leave requests with the manager approval workflow that acts on them (`FR-6.7`), and multi company or multi tenant support.

---

## 3. Functional Requirements

Three notes on reading this section. **`FR-6.4` is the single list of everything that is configuration rather than code**; other requirements name the item and cite `FR-6.4` instead of repeating it. Where a requirement names `IT` or `MANAGER` as the actor, that says who normally does the work; it never excludes `OFFICE_ADMIN`, who holds every permission any other role holds (`FR-1.3`). And **the Phase column carries the delivery tag of §2.3** — the phase in which that requirement's last remaining piece lands.

### 3.1 Identity, Authentication, and Access Control

| ID | Phase | Requirement | Priority |
| -- | ----- | ----------- | -------- |
| FR-1.1 | `✔` | Authenticate users by Google sign in. Pulse shall not store or verify passwords of its own. | Must |
| FR-1.2 | `P4` | One access control model in three parts. **RBAC**: a role is a named bundle of permissions, a permission is an action on a resource, and this decides *what* a user may do. **ABAC**: every grant of a permission to a role carries a scope of `SELF`, `TEAM`, or `ALL`, checked between the user asking and the record asked about, deciding *which records* the action reaches. **FGAC**: every permission and the scope each role holds it at is stored as data, never in code; `OFFICE_ADMIN` may change any of it from an administration screen, effective on the next request with no code change and no redeploy. Both the endpoint check and the record check are required; neither alone is enough. | Must |
| FR-1.3 | `P4` | Ship with seeded roles `OFFICE_ADMIN`, `IT`, `MANAGER`, `EMPLOYEE`, which are the complete set; a fifth role requires a schema change. There shall be no second office administration role. `OFFICE_ADMIN` holds every permission at `ALL` scope and its permission set shall always be a superset of every other role's: every permission the system defines, now or later, is granted to it at `ALL` by default. Reject any change that removes a permission from `OFFICE_ADMIN` or narrows its scope below `ALL`. | Must |
| FR-1.4 | `P4` | A user shall hold exactly one role at a time. Where a requirement says a user holds "only" a role, it means that is their single role. The model shall permit relaxing this later through configuration rather than a schema change. | Must |
| FR-1.5 | `P4` | Restrict sign in to Google accounts on an authorised Workspace domain, configured per `FR-6.4`, matching the work email of an active, not soft deleted user with login enabled whose employment period covers the current date. A soft deleted user loses access immediately and regains it only on restore. Everyone who signs in holds a company Google account; support staff such as the gardener, cleaners, and office boys hold no work email, so they are tracked for attendance but never sign in. A user with no work email cannot sign in; removing a work email removes sign in while keeping the user and their history. Enabling or disabling login is audited. | Must |
| FR-1.6 | `P4` | Record every authentication event, successful or failed, in the audit log. | Should |
| FR-1.7 | `P4` | Allow `OFFICE_ADMIN` to change a user's role at any time. Where the new role is `MANAGER`, the actor names the team, and that team's previous manager is replaced in the same action so the "exactly one manager" rule of `FR-3.1` holds before and after. The change takes effect on the next request and is audited. Changing employment type is a separate operation and changes no permission. | Must |

### 3.2 User and Employee Management

**Two clarifications used throughout.** *Date of joining* and *date of leaving* are two separate stored attributes of the user, each set and read on its own, per `FR-2.6`. Date of leaving is the real last working day and is set only by soft deleting the user; `deleted at` is when `IT` did the paperwork, and the two are usually a few days apart. *Soft delete does two jobs*: soft deleting **the user** hides nothing and only says they no longer work here (`FR-2.4`), while soft deleting **records stranded after the date of leaving** does hide them on purpose, because the user was not there on those days (`FR-2.11`).

| ID | Phase | Requirement | Priority |
| -- | ----- | ----------- | -------- |
| FR-2.1 | `P4` | Allow `IT` to create users, setting full name, employee code, work email where they have one, team, employment type, whether they are tracked, role, and shift. Those attributes, plus the soft delete of `FR-2.2` and the restore of `FR-2.3`, are the whole of `IT`'s authority. Changing a role after creation belongs to `OFFICE_ADMIN`, and so does changing a user's team after creation, per `FR-3.14`. | Must |
| FR-2.2 | `✔` | Allow `IT` to remove users by soft delete only. Soft delete requires a date of leaving, which closes the user's open tenure. **Soft delete is the only thing that closes a tenure**, so a user who is not soft deleted always has exactly one open tenure. No endpoint shall physically delete a user, attendance, or leave record. | Must |
| FR-2.3 | `✔` | Allow `IT` to restore a soft deleted user, stating which case applies. **Correction**: the soft delete was a mistake; the most recent tenure reopens by clearing its end date, leaving no gap; records soft deleted under `FR-2.11` for the re-covered dates are restored, their reversing ledger entries are themselves reversed, and the lapse entry of `FR-6.6` is reversed so the balance returns. **Re-hire**: a new tenure opens from a supplied start date, the closed tenure stays closed, the gap stays outside the employment period, the balance starts at zero, and entitlement prorates from the new start. Both cases clear `deleted at` and the user's date of leaving, and are audited with the case recorded. A re-hire leaves the date of joining unchanged, since that remains the date they first joined; proration runs from the new tenure's start instead. A soft deleted tenure is restored the same way. | Must |
| FR-2.4 | `P6` | Soft delete bounds which dates exist for a user, not who may read them. A soft deleted user remains visible and available for every attendance query, list, picker, statistic, and report that the reader's permissions already allow, marked as no longer active, across their employment period; records dated inside that period are untouched and their totals do not change. An attendance operation may cover the whole employment period or a single tenure. A soft deleted user is excluded from counts of currently active users and from any list offering them as the subject of a new record or assignment. Sign in stays blocked. A soft deleted attendance or leave record stays out of every total; a ledger entry is never deleted or soft deleted, only cancelled by a reversing entry. | Must |
| FR-2.5 | `✔` | Model a user as a single entity, with no separate account entity. Whether they can sign in follows from work email and login enabled; whether they are tracked is the user's own `tracked` flag. The two are independent and all four combinations are valid. | Must |
| FR-2.6 | `P4` | Store per user: full name, employee code, work email, team, employment type, tracked, login enabled, **date of joining**, **date of leaving**, `deleted at`, and one or more tenures. **Work email is optional** and unique where present, required only for a user who signs in. **Employee code is the code the biometric machine reports**, is required for every user, and is **unique across all users, including soft deleted ones**, so a departed user's records are never reattached to a new joiner. There is no second biometric identifier. The remaining fields are required. **Employment type** classifies the kind of staff member; `PERMANENT`, `CONTRACT`, `SUPPORT_STAFF`, and `INTERN` are the seed values; employment types are company wide configuration; no permission depends on employment type. **Tracked** is a boolean set per user by `IT`, defaulting to enabled, saying whether that user's attendance is tracked; it depends on neither employment type nor login. **Login enabled** is a boolean set by `IT`, defaulting to enabled, meaningful only with a work email. **Date of joining** is the date the user first joined and is required; **date of leaving** is a separate attribute holding their real last working day, empty until they leave and set only by the soft delete of `FR-2.2`. Neither is derived from the other: each is stored on the user in its own right and kept in step with their tenures per `FR-2.12`. **`deleted at`** is empty until `IT` soft deletes the user. | Must |
| FR-2.7 | `P5` | Prorate a joiner's leave entitlement from their date of joining, and for a second or later tenure from that tenure's start rather than the original joining date. `OFFICE_ADMIN` may override the prorated figure. | Must |
| FR-2.8 | `✔` | Retain all historical records of a departed user. They shall never be overwritten by a new joiner. | Must |
| FR-2.9 | `P4` | Import the existing roster from the `Biometric ID` sheet, whose employee code is the code the biometric machine reports, supplying every field `FR-2.6` requires — including whether each user is tracked — plus date of joining, which is stored on the user and opens the first tenure, and a shift for anyone tracked. Where the sheet does not carry a field, the import shall not guess or default it: prompt `OFFICE_ADMIN` for the missing details, listing each user and each outstanding field, before the roster is committed. | Must |
| FR-2.10 | `P6` | A user whose `tracked` flag is off holds a record for administration and record keeping only. They appear in the roster, are editable, soft deletable, restorable, and audited like anyone else. The system shall create no day records for them, require no shift, raise no attendance exception, and compute no deduction, award, or ledger entry. Attendance reports and totals exclude them and shall state the exclusion rather than omitting them silently. Switching a user between tracked and untracked is audited and deletes no attendance history already recorded. | Must |
| FR-2.11 | `P6` | Any change that reduces a user's employment period — soft deleting a user, moving a date of leaving earlier, or soft deleting a tenure — shall be checked for records left outside that period. Where there are none, the change completes. Where there are some, soft deleting them requires `OFFICE_ADMIN` approval, raised on the `FR-8.6` dashboard naming the user, the change, the dates, and every record. `OFFICE_ADMIN` may approve, or reject so `IT` can correct a wrong date or restore a wrongly removed tenure and resubmit. On approval the records are soft deleted and leave every query, report, total, and statistic; records inside the period are untouched. Every balance movement those records caused is cancelled by a reversing ledger entry rather than by editing the ledger. `OFFICE_ADMIN` may restore them at any time afterwards, which also reverses the reversing entries. A change that widens the employment period needs no approval and restores any records previously soft deleted for the re-covered dates. The approval, rejection, and any later restore are audited. The user's soft deletion and their loss of access take effect immediately and never wait for this approval. | Must |
| FR-2.12 | `P4` | Store employment as one or more **tenures**, each an unbroken period with a start date and an end date that is empty while the user is still employed. An end date is set in one way only: by soft deleting the user. Every user has at least one tenure. A tenure shall not end before it starts, and two tenures of the same user shall not overlap. Tenures may be created, edited, and soft deleted, audited like any record, except that a user shall always keep at least one tenure that is not soft deleted. Editing corrects a wrong date but shall not close an open tenure. **A tenure is not a way to record absence**: long leave or a sabbatical sits inside one tenure and is recorded as leave. The **employment period** is all non-soft-deleted tenures added together, worked out when needed and never stored; dates in a gap between tenures carry no day record, exception, or deduction. **Date of joining and date of leaving are two separate stored attributes of the user**, per `FR-2.6`, because they are what every screen, report, form, and import works with. The system keeps each in step with that user's tenures: date of joining equals the earliest tenure's start, and date of leaving, independently, equals the most recent closed tenure's end and is empty while a tenure is open. Every operation that creates, edits, closes, soft deletes, or restores a tenure writes both attributes in the same operation, so neither can drift. For everyone who has not left and been re-hired, which is nearly every user, there is exactly one tenure and these two attributes are their whole employment history. | Must |

### 3.3 Organisation, Shifts, and Calendar

| ID | Phase | Requirement | Priority |
| -- | ----- | ----------- | -------- |
| FR-3.1 | `P4` | Model teams, each with exactly one manager. | Must |
| FR-3.2 | `P4` | Allow `OFFICE_ADMIN` to create, edit, and soft delete teams. Soft deleting a team means it is no longer offered for assignment; it stays readable, so past day records, reports, and departed users' history still resolve through the calendar, weekly off pattern, and policy it held. **Reject the soft delete while any user who is not soft deleted is currently assigned to it**, naming those users so they can be moved first under `FR-3.14` — moved, not deleted. A team with only past assignments may be soft deleted. Teams are company wide configuration. | Must |
| FR-3.3 | `P4` | Allow `OFFICE_ADMIN` to create, edit, and soft delete named shifts, each carrying a start time, end time, required daily duration, grace period, and timezone. Shifts are per team configuration. | Must |
| FR-3.4 | `P4` | Give each team a default shift and each user a shift, defaulting to their team's. A shift is required for a tracked user and optional for an untracked one. Per team configuration. | Must |
| FR-3.5 | `P5` | Compute a day's worked duration as the sum of all check in to check out intervals on that day, correctly handling a shift that crosses midnight. | Must |
| FR-3.6 | `P4` | Record a shift assignment with an effective date range, so a mid year shift change is preserved historically rather than overwriting the past. | Must |
| FR-3.7 | `P4` | Hold holiday calendars as company wide records holding typed entries (public holiday, company holiday), which `OFFICE_ADMIN` may create, edit, and soft delete. Each team is assigned exactly one calendar, and that calendar applies to every member of the team. Calendars are shared: several teams may sit on one, and two teams on different calendars therefore observe different holidays on the same date. A calendar is never created automatically when a team is created. A calendar shall never depend on formatting or colour. Company wide configuration, assigned per team. | Must |
| FR-3.8 | `P4` | Give each holiday calendar its own weekly off pattern, so a team whose non working days are not Saturday and Sunday is supported. The pattern belongs to the calendar rather than the team, because the calendar already answers which dates are not working days and two owners for one question would let a team observe one calendar's holidays on another's working week. Company wide configuration, assigned per team. | Must |
| FR-3.9 | `P6` | Derive working day and holiday counts for any period from the calendar assigned to the team the user held on each date in that period. | Must |
| FR-3.10 | `P5` | Store all timestamps in UTC and render them in the relevant local timezone, with the timezone recorded on the shift. **There shall be no company wide default timezone**; every timestamp resolves through the timezone of the shift that applies to that user on that date. A display default may exist for a screen with no shift in context and shall never take part in a calculation. | Must |
| FR-3.11 | `P5` | Resolve a shift's start and end to absolute instants using that shift's timezone and the daylight saving offset in force on the work date, so a transition day is treated as 23 or 25 hours rather than 24. On spring forward, a punch time that does not exist locally is rejected as invalid rather than quietly shifted. On fall back, a time that happens twice is taken as the first of the two. | Must |
| FR-3.12 | `P6` | Where a tracked user has a punch on a date with no shift assigned — because the assignment's effective range does not cover it, or the team's default shift was soft deleted after the assignment — raise an exception for `OFFICE_ADMIN`. The day record is still created but left without a status until a shift is assigned. The punch keeps its recorded time and is given a work date once the shift is known. The system shall not fall back to a default shift or a default timezone. | Must |
| FR-3.13 | `P6` | Where a required configuration value is missing — a team with no shift, no weekly off pattern, or no holiday calendar, or any other required setting listed in `FR-6.4` — prompt `OFFICE_ADMIN` for it, naming the entity and the outstanding field, and raise it on the `FR-8.6` dashboard until it is set. The system shall not guess, default, or proceed silently. | Must |
| FR-3.14 | `P5` | Allow `OFFICE_ADMIN` to move a user from one team to another. This is an edit of the user's assignment and requires no change to either team. Record the assignment with an effective date range, as `FR-3.6` does for shifts, so the team a user held on a past date is the team the engine uses for that date. A move never rewrites history: it is audited and triggers recalculation from its effective date forward only. Where the user held their team's default shift, they take the new team's default; where they held their own shift under `FR-3.4`, they keep it. Where the user is the outgoing team's manager, a replacement is named in the same action so the "exactly one manager" rule of `FR-3.1` holds before and after. | Must |

### 3.4 Attendance Capture

**Attendance is stored as two entities, and everything else in this section and the next is an attribute of one of them.** A **punch** is one raw event: a single check in or check out, for one user, at one instant, exactly as the biometric export supplies it row by row per `FR-4.3`. A **day record** is what the engine works out for one user on one date, per `FR-5.1`. The work date of `FR-5.8` is the attribute on a punch saying which day record it belongs to; the day type and day status of `FR-5.2` are attributes on the day record. **The punch is the fact and the day record is the conclusion drawn from it** — the same relationship the ledger has with a balance under `FR-6.8`. Attendance is entered daily, or caught up in batches from the biometric export; whatever is outstanding sits on the `FR-8.6` dashboard until it is cleared.

| Entity | Carries | From |
| ------ | ------- | ---- |
| **Punch** | The user; the instant, stored in UTC; whether it is a check in or a check out; its work date; whether it came from the form or an import; a duplicate flag; a soft delete flag. Editable, and the unit of correction. | FR-3.10, FR-4.1, FR-4.2, FR-4.3, FR-4.7, FR-4.12, FR-5.8 |
| **Day record** | The user and the date; the day type and day status; the worked duration; late and early departure minutes; any deduction and the rule that produced it; any override sitting beside the engine's value with who, why, and when. | FR-3.5, FR-5.1, FR-5.2, FR-5.3, FR-6.3, FR-6.11, FR-7.6 |

| ID | Phase | Requirement | Priority |
| -- | ----- | ----------- | -------- |
| FR-4.1 | `P5` | Allow `OFFICE_ADMIN` to record a check in or check out through an in application form. | Must |
| FR-4.2 | `P5` | Allow `OFFICE_ADMIN` to import check in and check out records from an Excel file. | Must |
| FR-4.3 | `P5` | Use the import format: `Sr No.` (serial number giving chronological order), `Employee Code` (required; the only match key), `Employee Name` (shown in the preview for the reader and never used to match), `Type` (Check-in or Check-out), `Date`, `Time`. | Must |
| FR-4.4 | `P5` | Validate an imported file and present a preview of accepted rows, rejected rows, and the reason for each rejection **before** any data is committed. A row naming an untracked user is rejected with that as the stated reason, never silently accepted or dropped. A row with no employee code, or with a code matching no user, is rejected with that as the stated reason; a name is never used to resolve a row. | Must |
| FR-4.5 | `P5` | Commit an import atomically: either every accepted row is written or none is. This is a guarantee about the observable outcome, not about the number of database calls; a partially applied import shall never be visible or queryable. | Must |
| FR-4.6 | `P5` | Support more than one check in and check out pair on a single day and aggregate them into a single day total. | Must |
| FR-4.7 | `P6` | Detect and flag duplicate punches — two punches of the same type for the same user on the same work date within the duplicate punch window — rather than double counting them. The window is per team configuration. | Must |
| FR-4.8 | `P6` | Flag a missing check in or check out as an exception requiring `OFFICE_ADMIN` attention, and never silently treat it as zero hours. | Must |
| FR-4.9 | `P5` | Allow `OFFICE_ADMIN` to manually add hours, set the status of any day including marking it as work from home, mark a leave of a stated type, a PTO, or a CTO, and make corrective adjustments to any day. The full override list is `FR-6.10`. | Must |
| FR-4.10 | `P5` | Record on every manual adjustment the actor, the timestamp, the previous value, the new value, and a mandatory reason. | Must |
| FR-4.11 | `P5` | Require the uploader to confirm the file's date format before validation, and reject any row whose date cannot be parsed unambiguously under that format, stating it as the reason under `FR-4.4`. | Must |
| FR-4.12 | `P5` | Let `OFFICE_ADMIN` fix a punch directly: change its time, change whether it is a check in or check out, move it to a different user, or soft delete one that should not be there. **A punch is not immutable.** A wrong punch is fixed by editing it, not by adding a cancelling punch and not by overriding the day. Every fix is a manual adjustment under `FR-4.10`, is audited, and triggers recalculation of every day it affects, both the day it left and the day it moved to. Reject a change that would move the punch outside the user's employment period or onto an untracked user, stating that as the reason. | Must |

### 3.5 Day Classification

| ID | Phase | Requirement | Priority |
| -- | ----- | ----------- | -------- |
| FR-5.1 | `P5` | Assign every tracked user exactly one day record for every calendar date in their employment period. Every day record carries a status, except where `FR-3.12` applies and no shift is known, in which case the status is empty until a shift is assigned. An untracked user receives no day records. A punch, day entry, leave, or adjustment dated outside the employment period is rejected, whether entered manually or imported. | Must |
| FR-5.2 | `P5` | Carry two separate values on every day record. **Day type** says what kind of date it is for the team the user held on that date: `WORKING`, `WEEKLY_OFF`, or `HOLIDAY`, taken from that team's calendar and weekly off pattern. **Day status** says what the user did: `WFO`, `WFH`, `LEAVE`, `HOLIDAY_WORK`, `WEEKLY_OFF`, `HOLIDAY`, or `ABSENT`. The two are stored and reported separately, so a report shows both what kind of date it was and what the user did on it. A status of `WEEKLY_OFF` or `HOLIDAY` means the day type applied and no work was recorded. `HOLIDAY_WORK` covers work on any non working day, and the day type says which it was. **`WFH` is a working day status**: work on a non working day is `HOLIDAY_WORK` wherever it was performed, including when set by an override, and where it was performed is not recorded. The old workbook's `CWFO` and `CWFH` both map onto `HOLIDAY_WORK` and are not carried forward as statuses. Half a day of leave is a status of `LEAVE` with the half day amount on the ledger, not a status of its own. | Must |
| FR-5.3 | `P5` | Compute a day's late minutes and early departure minutes from that day's punches and that user's shift on that date, with worked duration per `FR-3.5`. | Must |
| FR-5.4 | `P5` | Permit work from home for a serious or important reason. A day is recorded as `WFH` by `OFFICE_ADMIN` setting that day's status; the engine never infers it from punches. | Must |
| FR-5.5 | `P5` | Track a work from home quota and balance per user. **A day whose status is `WFH` debits that balance**, whether the status came from an `OFFICE_ADMIN` decision or an override. The quota, and the total days allowed over a period, are per team configuration. | Must |
| FR-5.6 | `P5` | Count and report days where a user worked on a holiday or weekly off, counted when they clocked more than the `BR-27` threshold. A `HOLIDAY_WORK` day below that threshold is still shown with the duration clocked but is not counted. | Should |
| FR-5.7 | `P5` | Count days where the user clocked less than the short day threshold. The threshold is per team configuration. | Should |
| FR-5.8 | `P5` | Assign every punch to exactly one **work date**: the local date on which that user's shift started, worked out in the shift's own timezone and daylight saving offset. For a shift that does not cross midnight this is the punch's own local date. For a crossing shift, a punch after midnight but before the shift ends belongs to the date the shift started, so a night worked 19:00 to 04:00 is one day and not two. How far either side of a crossing shift a punch may fall is per team configuration. The work date is always worked out by the system and never typed by a user, uses the shift the user held on that date rather than their current one, and is worked out again whenever the punch or the shift assignment changes. | Must |
| FR-5.9 | `P5` | Work out the day type first, from the calendar and weekly off pattern of the team the user held on that date rather than their current one, per `FR-3.14`. Then work out the day status in a fixed order: an `OFFICE_ADMIN` status override first, then an authorised leave, then what the punches show. **Any punches at all on a day whose type is not `WORKING` make the status `HOLIDAY_WORK`**, however little was clocked. A user who clocked nothing on such a day takes the status matching the day type. The `BR-27` threshold does not decide the status; it decides only whether the day is counted in the `FR-5.6` report. **Any punches on a `WORKING` day with no leave and no override make the status `WFO`.** A tracked user with no punches on a `WORKING` day, no leave, and no override is `ABSENT`. This order is the same for every team and is not configurable. | Must |

### 3.6 Leave Engine

| ID | Phase | Requirement | Priority |
| -- | ----- | ----------- | -------- |
| FR-6.1 | `P5` | Calculate leave deductions automatically from attendance data, without manual entry. | Must |
| FR-6.2 | `P5` | Support typed leave balances. Leave types and their annual entitlement are per team configuration, seeded per `BR-12`. **Every leave states its type**; a leave submitted or recorded without one is rejected, so no consumption order between types is ever needed. | Must |
| FR-6.3 | `P5` | Deduct a fraction of a leave day when a user arrives late or clocks less than their required daily duration, taking the worse of the two bands per `BR-9`. The band comes from that team's Leave Deduction Ladder, which is per team configuration. Because the engine raises the deduction with no type stated, it posts to the single leave type that team configures for automatic deductions. Seed values are in 3.10. | Must |
| FR-6.4 | `P4` | Treat everything in the list below as configuration, not code. Each is stored as data and editable at runtime with no code change and no redeploy; none is a fixed list or a constant in code. Section 3.10 records the values the company uses today, which the configuration is seeded with; where a seed value is not there, the requirement that introduces the item names it.<br><br>**Company wide:** teams; employment types; the Google Workspace domains authorised for sign in; permission grants, meaning every permission the system defines and the scope each role holds it at.<br>**Per team:** shifts, each with start time, end time, required daily duration, grace period, and timezone; the holiday calendar and its holidays; the weekly off pattern; leave types and their annual entitlement; accrual period and carry forward; the leave type automatic deductions draw from; the Leave Deduction Ladder; the PTO award ladder; the PTO validity period; the CTO application ladder; the work from home quota and the total days allowed over a period; the short day threshold; the holiday work threshold; the midnight crossing punch window; the duplicate punch window. | Must |
| FR-6.5 | `P5` | Record leave balances per month and per year for every tracked user. | Must |
| FR-6.6 | `P5` | Carry an unused balance forward from one accrual period to the next according to the configured policy. The accrual period is per team configuration, seeded as the leave year, which is the calendar year: the whole entitlement of `BR-12` is credited at its start, and prorated for a joiner or a new tenure per `FR-2.7`. Carry forward applies within one tenure only: when a tenure ends, the system posts a ledger entry bringing the balance to zero on the end date, marked as lapsed on departure, so that every balance is still worked out by adding up entries and no special case is needed for a re-hired user. If the tenure is reopened as a correction, that entry is reversed and the old balance comes back. | Must |
| FR-6.7 | `PM` | Allow a team manager to approve leave for members of their own team. The request and approval workflow ships in Phase 2; the permission and its `TEAM` scope are seeded in Phase 1. | Must |
| FR-6.8 | `P5` | Record all balance changes as immutable ledger entries. A balance shall always be derivable by replaying the ledger and shall never be a directly editable stored number. A movement is cancelled by appending its reverse, never by editing or deleting the original entry. | Must |
| FR-6.9 | `P5` | Support paternity and maternity leave as separate typed entries that do not consume the standard balance. | Must |
| FR-6.10 | `P6` | Allow `OFFICE_ADMIN` to override any outcome the system worked out, recording who authorised it and why. There are nine kinds of override: a **late arrival**, a **short day**, a **day status**, the **hours** on a day, a **CTO application**, a **PTO award**, a **leave entitlement** as prorated under `FR-2.7`, a **PTO expiry**, and an **insufficient PTO balance block** as defined in `BR-26`. An override may change an amount, remove it completely, add an outcome the engine never worked out, or permit an action the engine refused. | Must |
| FR-6.11 | `P5` | Store an override on the record it changes — the day, the award, the application, or the entitlement — as the new value sitting next to the value the system worked out, with who, why, and when. **There shall be no separate override record.** Where an override moves a balance, the movement posts to the ledger in the normal way, and a movement already posted is cancelled by a reversing entry rather than edited. | Must |
| FR-6.12 | `P5` | Never throw away a human decision in a recalculation. Recalculating a day refreshes what the engine worked out and leaves any override in place. A re-import, a punch fixed under `FR-4.12`, a calendar edit, or a policy change shall never quietly undo an `OFFICE_ADMIN` decision or an approved credit. | Must |
| FR-6.13 | `P5` | Allow `OFFICE_ADMIN` to set an opening leave balance for each user when Pulse goes live, entered by hand from the balance the old workbook shows at cutover. The system shall not compute it: historical attendance is not migrated, only the roster is imported per `FR-2.9`. Each opening balance is posted as a ledger entry identified as such and dated at cutover, so every balance thereafter is still derived by replaying the ledger. The entry carries the actor, timestamp, and a mandatory reason, and is audited. A user created after cutover has no opening balance entry; their balance accrues from their date of joining. | Must |

### 3.7 PTO and CTO

**One earned balance, two ways to spend it.** PTO is credited only by an approved award for extra work (`FR-7.1`) and expires per `FR-7.3`. It is spent either by taking a paid day off, recorded as a leave of type `PTO` under `FR-6.2` and drawn from this balance rather than from an annual entitlement, or by applying CTO to cancel an automatic deduction (`FR-7.5`). **CTO has no balance of its own.**

| ID | Phase | Requirement | Priority |
| -- | ----- | ----------- | -------- |
| FR-7.1 | `P6` | Award PTO for extra work performed beyond a user's scheduled hours, with every award requiring explicit `OFFICE_ADMIN` approval. The system detects the candidate day, names the rule that applies, and proposes an amount; it shall not post an award automatically. `OFFICE_ADMIN`'s decision is unconstrained: approve as proposed, approve a different amount, decline, or grant an award the system did not suggest. | Must |
| FR-7.2 | `P6` | Let `OFFICE_ADMIN` accept, change, or reduce to zero the proposed PTO amount at the moment of approval, including an amount no ladder row produces. The ladder decides what the system proposes; it does not limit what may be approved. Per team configuration; seed values in 3.10. | Must |
| FR-7.3 | `P6` | Expire PTO 30 days after the date the extra work was performed, so PTO earned on 5 August expires on 5 September. The validity period is per team configuration, seeded at 30 days. Where approval is granted after the expiry date has passed, the award posts with its expiry extended to 30 days from the approval date, and the extension is visible on the award. `OFFICE_ADMIN` may override an expiry. | Must |
| FR-7.4 | `P6` | Warn the user and `OFFICE_ADMIN` before PTO expires unused, and list unapproved PTO candidates so nothing is silently lost. | Should |
| FR-7.5 | `P6` | Apply CTO to offset an automatic late or absence deduction only on explicit `OFFICE_ADMIN` approval. The system names the applicable ladder row and proposes the amount; `OFFICE_ADMIN` may accept it, apply a different amount, decline it, or apply CTO on a day the system did not suggest one. An application spends PTO days and is blocked when the PTO balance is insufficient per `BR-26`, unless `OFFICE_ADMIN` explicitly overrides the block, which is audited. Per team configuration; seed values in 3.10. | Must |
| FR-7.6 | `P6` | Name, for any given day, the rule that produced each credit and each debit. Where `OFFICE_ADMIN` granted a credit the system did not suggest, record the rule as a manual grant with no ladder row. | Should |
| FR-7.7 | `P6` | Allow `OFFICE_ADMIN` to originate a PTO award or CTO application for any user and date with no system suggestion present, setting the amount themselves. Such an entry carries the same actor, timestamp, and mandatory reason as an approved suggestion, and is identified in the ledger as a manual grant. | Must |
| FR-7.8 | `P6` | Allow `OFFICE_ADMIN` to decline a suggested PTO award or CTO application. A decline records the actor, timestamp, suggested amount, and a mandatory reason; posts nothing to the ledger; and removes the candidate from the `FR-8.6` queue while remaining visible in the day's history. A declined candidate shall not be re-proposed for the same day unless that day's attendance data changes. | Must |

### 3.8 Reporting and Employee Self Service

| ID | Phase | Requirement | Priority |
| -- | ----- | ----------- | -------- |
| FR-8.1 | `P6` | Let a user view the attendance records, balances, and annual summary of any user, not only their own, as everyone could in the old workbook. This is expressed as the `EMPLOYEE` role holding the attendance read permission at `ALL` scope, so it can be narrowed from the `FR-1.2` screen without a code change. It covers this view and `FR-8.4`; the `FR-8.3` report builder, the `FR-8.5` export, and the `FR-8.6` dashboard remain restricted. | Must |
| FR-8.2 | `✔` | Prevent a user holding only the `EMPLOYEE` role from creating, editing, deleting, approving, or importing anything anywhere in the system. Their access is read only without exception. | Must |
| FR-8.3 | `P6` | Produce an attendance report for any date range, per user and per team, reproducing the columns the office administration team relies on today. | Must |
| FR-8.4 | `P6` | Produce an annual summary per user, aggregating every month of the year with no month silently omitted. | Must |
| FR-8.5 | `P6` | Export any report to Excel or CSV, so the office administration team can continue to share files during the transition. | Should |
| FR-8.6 | `P6` | Provide an exceptions dashboard listing everything needing `OFFICE_ADMIN` attention: a missing check in or check out, an unresolved late arrival, an unmatched import row, a duplicate punch, an impossible duration (a day whose worked duration exceeds 24 hours, or a check out earlier than the check in it closes), a date with no shift assigned, a required configuration value not yet set per `FR-3.13`, an exhausted leave or PTO balance, an approved PTO award approaching expiry, and every PTO and CTO awaiting approval with the rule that suggests it. Each queued item offers approve, approve with a changed amount, and decline. The dashboard also lets `OFFICE_ADMIN` start a PTO award or CTO application for a user and date that raised no suggestion, and carries every reduction of an employment period awaiting approval under `FR-2.11`, with the change that caused it and the records approval would soft delete. | Must |

### 3.9 Auditability

| ID | Phase | Requirement | Priority |
| -- | ----- | ----------- | -------- |
| FR-9.1 | `✔+` | Write an audit record for every create, update, soft delete, restore, and every approval or rejection decision, on users, tenures, roles, permission grants, teams, employment types, shifts, calendars, attendance including individual punches, leave, PTO, CTO, and policy, and for every manual override and correction. | Must |
| FR-9.2 | `✔` | Include in an audit record the actor, the action, the entity type and identifier, the before state, the after state, and the time. | Must |
| FR-9.3 | `✔` | Keep audit records append only, not editable or deletable through any application endpoint. They are retained indefinitely and are never purged, as are soft deleted records. | Must |
| FR-9.4 | `P4` | Let `OFFICE_ADMIN` view the full change history of any single punch, attendance day, or leave balance. | Should |

### 3.10 Business Rules and Seed Values

These are the rules the calculation engine implements, each expressed so it can become a test case. **Every number here is seed configuration, not a constant in code** — the value the company uses today, which the configuration is seeded with. `FR-6.4` lists every configurable item and its scope. Some rules state **behaviour** rather than a number; behaviour is not configuration and is the same for every team. **The Scope column on every table below says which a rule is**: `Per team` means `OFFICE_ADMIN` sets it for each team independently and the number shown is only the seed; `Behaviour` means it is the same for every team and is not configurable.

Hour thresholds are expressed as a **percentage of the scheduled shift**, with the equivalent on a 9 hour shift given after it. Absolute hour bands only made sense for a 9 hour day and broke silently for any other shift length.

**The Phase column** carries the §2.3 tag. A rule that is purely a shift or policy attribute is `P4` — it is set on the configuration screen and nothing computes from it yet. A rule the calculation engine implements is `P5`. The PTO award and CTO application ladders are `P6`, with the rest of `FR-7.x`.

**Working time — seeded shift configuration, per team**

BR-1 through BR-4 and BR-7 are attributes of a **shift**, and every shift belongs to a team (`FR-3.3`, `FR-3.4`). The values below are what the seeded shifts carry, not limits on what a shift may hold; BR-5 is a per team threshold in its own right. `OFFICE_ADMIN` changes any of them for any team from the `FR-6.4` configuration screen, with no code change and no redeploy.

| Rule | Phase | Scope | Statement |
| ---- | ----- | ----- | --------- |
| BR-1 | `P4` | Per team | Required daily duration is seeded at 9 hours on every shift. A team working a different day length changes it on its own shift. |
| BR-2 | `P4` | Per team | Shift windows are seeded at 09:00 to 18:00 and 10:00 to 19:00. Each team's default shift is chosen from the shifts defined for it; neither window is a company wide default. |
| BR-3 | `P4` | Per team | The GC team works a night shift providing night support. Its window is that team's shift configuration, seeded from the old workbook's 19:00 to 04:00 annotation and confirmed by `OFFICE_ADMIN` at team setup per `FR-3.13`. |
| BR-4 | `P4` | Per team | The Sales and Marketing team works a night shift on the United States Pacific timezone. The timezone is part of that team's shift definition; there is no company wide default timezone, per `FR-3.10`. |
| BR-5 | `P5` | Per team | A day where less than 89 percent of the required daily duration was clocked is counted as a short day for reporting. On a 9 hour shift that is fewer than 8 hours. |

**Grace and punctuality**

| Rule | Phase | Scope | Statement |
| ---- | ----- | ----- | --------- |
| BR-6 | `P5` | Behaviour | A check in is compliant if it occurs at or before the shift start plus the grace period. |
| BR-7 | `P4` | Per team | The grace period is seeded at 30 minutes and is held on the shift, so it is set per team. Pulse computes grace relative to the user's own shift, unlike the old workbook, which hardcoded `<= 10:30` and so was wrong for the 09:00 shift. |
| BR-8 | `P5` | Behaviour | `OFFICE_ADMIN` may override a late arrival, which then counts as compliant and waives the deduction. This is an `OFFICE_ADMIN` action under `FR-6.10`, not a manager action. |

**Leave Deduction Ladder.** The ladder is per team configuration, and `OFFICE_ADMIN` sets the bands for each team. The two below are alternative **seed profiles**, not a choice this document settles. The leave type these automatic deductions draw from is also per team configuration, seeded to Casual.

*Seed profile A, as stated by the supervisor:*

| Condition | Deduction |
| --------- | --------- |
| Arrival later than 30 minutes past shift start, about 6 percent of a 9 hour shift | 0.25 day |

*Seed profile B, as implemented in the old workbook, converted to percentages:*

| Lateness, as a percentage of the scheduled shift | Hours clocked, as a percentage of the required duration | Deduction | Absolute equivalent on a 9 hour shift |
| ------------------------------------------------ | ------------------------------------------------------- | --------- | ------------------------------------- |
| Over 10 percent up to 40 percent | 55 percent up to under 80 percent | 0.25 day | Late 1 to 3.5 hours, or clocked 5 to 7 hours |
| Over 40 percent up to 55 percent | 33 percent up to under 55 percent | 0.5 day | Late 3.5 to 5 hours, or clocked 3 to 5 hours |
| Over 55 percent | Under 33 percent | 0.75 day | Late more than 5 hours, or clocked under 3 hours |
| Did not attend | 0 percent | 1 day | Zero hours |

| Rule | Phase | Scope | Statement |
| ---- | ----- | ----- | --------- |
| BR-9 | `P5` | Behaviour | Deduction is determined by the worst applicable band of either the lateness test or the hours clocked test. |
| BR-11 | `P5` | Behaviour | A full day of `LEAVE` deducts 1 day of the type stated on it. |

**Leave entitlement and accrual**

| Rule | Phase | Scope | Statement |
| ---- | ----- | ----- | --------- |
| BR-12 | `P5` | Per team | Annual entitlement is 10 Annual, 10 Sick, and 10 Casual leaves within a year — 30 typed days, credited at the start of the leave year and prorated for a joiner per `FR-2.7`. |
| BR-13 | `P5` | Per team | **Accrual period and carry forward are set per team**, seeded as the leave year: the whole entitlement of `BR-12` is credited at its start. Where a team accrues over a shorter period instead, the per period figure is derived at calculation time from that team's annual entitlement and accrual period, never carried as a constant, so changing the entitlement changes the accrual with no code change. The old workbook's **single pooled balance**, accruing `+ 1.67` per month plus a balance brought forward, is not adopted at any team: Pulse holds the typed balances of `BR-12`. |
| BR-14 | `P5` | Per team | **Which leave types appear in this formula is set per team**, per `BR-12` and the automatic deduction type of `FR-6.3`. Balance of a leave type is `opening balance - leaves availed of that type - automatic deductions posted to it + CTO applied against those deductions`. The PTO balance, separately, is `approved awards - PTO taken as leave - CTO applications - expiries`. The arithmetic itself is the same everywhere, and Pulse derives both at query time by replaying the ledger rather than storing either as a column, per `FR-6.8`. The old workbook's `+ H` paternity and maternity term does not carry over: Pulse never deducts those days, so they post to their own typed balance and the standard balance never moves. |
| BR-15 | `P5` | Per calendar | **Each team is assigned one holiday calendar, shared with other teams**, per `FR-3.7`, so two teams on different calendars observe different holidays on the same date. Vacations are fixed: a holiday belongs to the calendar, set in advance, and is never chosen per employee. A calendar may still be corrected mid year, for example when a public holiday is announced or moved. Such a correction is audited and triggers recalculation of the affected dates for every team assigned to the calendar. |

**Work from home**

| Rule | Phase | Scope | Statement |
| ---- | ----- | ----- | --------- |
| BR-16 | `P5` | Per team | The authorised work from home quota is 5 days per month, with balance carried and reported. |
| BR-17 | `P5` | Per team | **Whether a team allows work from home at all, and how much, is that team's quota** per `BR-16`; a team set to zero has none. Where it is allowed, a work from home day is a working day and consumes no leave. |

**PTO, earned for extra work**

| Rule | Phase | Scope | Statement |
| ---- | ----- | ----- | --------- |
| BR-18 | `P6` | Per team | Half an extra working day earns 0.5 PTO. |
| BR-19 | `P6` | Per team | One full extra working day earns 1 PTO, which is one day of paid leave. |
| BR-20 | `P6` | Per team | One full night worked, followed by working the next working day as well, earns 2 PTO. |
| BR-21 | `P6` | Per team | Teams that routinely work beyond their scheduled hours, specifically night support and the Product Owners team, take PTO in return for those hours. |

**CTO, applied against lateness**

| Rule | Phase | Scope | Statement |
| ---- | ----- | ----- | --------- |
| BR-22 | `P6` | Per team | Late by 22 percent up to under 44 percent of the scheduled shift: 0.25 CTO is applied, if the user has the PTO to pay for it per `BR-26`. On a 9 hour shift that is 2 hours up to under 4. |
| BR-23 | `P6` | Per team | Late by 44 percent up to under 67 percent: 0.5 CTO is applied, if the user has the PTO to pay for it per `BR-26`. On a 9 hour shift that is 4 hours up to under 6. |
| BR-24 | `P6` | Per team | Late by 67 percent or more, having attended: 0.75 CTO is applied, if the user has the PTO to pay for it per `BR-26`. On a 9 hour shift that is 6 hours or more. |
| BR-25 | `P6` | Per team | Did not attend at all: 1 CTO is applied, if the user has the PTO to pay for it per `BR-26`, and no leave is deducted. |
| BR-26 | `P6` | Per team | **Applying CTO spends PTO.** CTO is not a balance of its own, so a CTO application is paid for out of the user's unexpired PTO. Before approving one, the system checks the user has enough. If they do, that PTO is spent and the day's leave deduction is cancelled. If they do not, the application is blocked, the deduction stands, and it comes out of **the leave type that team uses for automatic deductions**, which is per team configuration seeded to Casual. `OFFICE_ADMIN` may override the block and approve anyway, per `FR-6.10`, and the override is audited. |

**Holiday work**

| Rule | Phase | Scope | Statement |
| ---- | ----- | ----- | --------- |
| BR-27 | `P5` | Per team | A day counts as worked on a holiday when the user clocked more than 22 percent of the scheduled shift on a designated non working day. On a 9 hour shift that is more than 2 hours. This threshold decides the `FR-5.6` count only; the day's status is `HOLIDAY_WORK` whenever there are any punches at all, per `FR-5.9`. |

### 3.11 MVP Acceptance Criteria · `P7`

**All nineteen are Phase 7 work.** Each becomes demonstrable as its requirements land — 1 to 4 after Phase 4, 5 and 10 to 12 after Phase 5, the rest after Phase 6 — but none is *accepted* until Phase 7 runs them deliberately rather than incidentally.

The MVP is accepted when all of the following are demonstrably true.

1. `IT` can create a user with a team, employment type, role, and shift, set or omit their work email, soft delete them, and restore them, with every step in the audit log. A user with no work email cannot sign in; removing a work email revokes access without touching history; disabling login revokes it without removing the email.
2. `OFFICE_ADMIN` can record a check in and check out through the form, and the day's total, lateness, and any deduction appear immediately and correctly.
3. `OFFICE_ADMIN` can upload an Excel file in the specified format, see a preview separating accepted from rejected rows with a stated reason for every rejection, correct the file, re-upload, and commit.
4. A user signing in with Google can view any colleague's records and annual summary, and every attempt to create, edit, approve, or import through the API is rejected. Narrowing the `EMPLOYEE` read scope from `ALL` to `SELF` takes effect on the next request without a redeploy.
5. For a period of attendance data, per user totals match a hand calculation of the agreed policy, including lateness deductions, work from home count, PTO, and CTO.
6. Changing a team's Leave Deduction Ladder changes that team's calculations with no code change and no redeploy.
7. `OFFICE_ADMIN` can move a permission from one role to another on the access control screen, effective on the next request without a redeploy.
8. The system proposes a PTO award for a qualifying day, names the rule, and posts nothing until approved. `OFFICE_ADMIN` can change the amount before approving, decline with a reason and see nothing posted, and award PTO where nothing was proposed, recorded as a manual grant.
9. An annual summary aggregates every month with no month silently omitted (defect F1).
10. A report can be generated for an arbitrary date range, not only a calendar month.
11. Every number displayed can be traced to its ledger entries and to the named rule that produced them.
12. A night shift user working 19:00 to 04:00 has their hours computed correctly across midnight (defect F6).
13. Two teams on different holiday calendars produce different working day counts for the same period.
14. No API endpoint physically deletes a record.
15. `IT` can create a user with tracking off; they appear in the roster and audit log while producing no day records, exceptions, or deductions. An import row carrying their employee code is rejected with that reason. Switching tracking on starts producing day records from that point without erasing anything.
16. A user soft deleted on 9 August with a date of leaving of 4 August loses access at once, still appears in a July report with unchanged totals marked as no longer active, and raises an approval item listing their 5 to 8 August records. On approval those records leave every report and the leave those false absences consumed is returned by reversing entries. Restoring them brings records and balance back exactly as they were. Rejecting the approval lets `IT` correct the date and resubmit.
17. A user who left on 3 August and was re-hired on 5 November, restored as a re-hire, appears in an August to November report as employed either side of the gap with no day records, absences, or deductions inside it, and a report can span both tenures or be scoped to either. Their balance starts at zero on the new tenure, with a ledger row showing the old balance lapsing on 3 August. Soft deleting the earlier tenure raises an approval listing that tenure's records, and restoring it brings them back. The last remaining tenure cannot be soft deleted. A user soft deleted in error and restored as a correction has an unbroken employment period and loses nothing.
18. `OFFICE_ADMIN` can fix a punch imported with the wrong time, type, or user, and that day's total, lateness, and deduction are recalculated at once. The old value, who changed it, and why are visible in its history. No second punch appears to cancel the first, and re-running the import does not undo an override already applied.
19. `OFFICE_ADMIN` moves a user from Team A to Team B effective 1 September. An August report still counts Team A's holidays and weekly offs for them, September counts Team B's, a punch corrected in August recomputes under Team A, and neither team is soft deleted. Attempting to soft delete Team A while anyone is still assigned to it is rejected, naming them.

---

## 4. Non-Functional Requirements

**No `NFR-` carries a phase tag.** Each is a constraint every phase must already satisfy while it builds, not a deliverable that some phase owns. What Phase 7 adds is *measurement*: `NFR-3` and `NFR-4` timed at the `NFR-5` ceiling rather than assumed, `NFR-12` audited against WCAG 2.1 AA, `NFR-8` and `NFR-15` exercised by re-running a past period and a recalculation twice.

| ID | Category | Attribute |
| -- | -------- | --------- |
| NFR-1 | Usability | Easy to navigate and user friendly in both UX and UI. Concretely, `OFFICE_ADMIN` can record a single day's attendance correction in 3 clicks or fewer from the dashboard, and the import flow never requires leaving the browser to fix a file. |
| NFR-2 | Usability | Every screen states clearly what the numbers mean. No unexplained abbreviation appears without a tooltip or legend. |
| NFR-3 | Performance | A monthly report for the full company at the `NFR-5` ceiling (1000 users, 31 days) renders in under 2 seconds at the 95th percentile. The measurement is a requested page of results, not the whole period at once: any report, queue, or entry grid covering the full company pages or virtualises rather than returning every row. This includes the `FR-8.6` dashboard, whose backlog grows with the roster. |
| NFR-4 | Performance | An import of 40,000 rows validates and previews in under 10 seconds. |
| NFR-5 | Scale | Designed for 1000 users and at least 5 years of history. That is a sizing target, not a retention limit: nothing is purged, per `NFR-9`. It does not need to scale beyond that. |
| NFR-6 | Security | Authentication is delegated to Google. Pulse stores no passwords. No secret is committed to the repository. |
| NFR-7 | Security | All access to employee data passes through the authorisation layer. No endpoint returns data beyond the scope the requesting user's role holds for that permission, and no endpoint lets a user holding only `EMPLOYEE` change anything. |
| NFR-8 | Reliability | Leave, PTO, and CTO calculations are deterministic and reproducible. Re-running a past period on unchanged inputs and configuration produces identical output. |
| NFR-9 | Data integrity | No destructive operation exists; soft delete everywhere. Fixing a record in place is not destructive, because the old value is kept in the audit log. Three kinds of record behave differently: **working records** (punches, day records, users, tenures, shifts, calendars, configuration) are edited in place and soft deleted; **leave ledger entries** are never edited, deleted, or soft deleted, and are cancelled only by a reversing entry; **audit records** can only be added to. Nothing is ever purged: soft deleted records and audit records are retained indefinitely. |
| NFR-10 | Maintainability | Business rules live in configuration and in one calculation service, not scattered across request handlers, so a policy change is a data change. |
| NFR-11 | Auditability | The system can answer "why is this number what it is" for any balance, at any date, for any user. |
| NFR-12 | Accessibility | The interface meets WCAG 2.1 AA for colour contrast and keyboard navigation. Status is never conveyed by colour alone. |
| NFR-13 | Portability | The system runs locally with a single command for a new developer. |
| NFR-14 | Data integrity | Concurrent edits to the same record do not silently overwrite one another. A write against a stale version is rejected and the caller is shown the current state. Two `OFFICE_ADMIN` users working the same period is the normal case. |
| NFR-15 | Reliability | Any recalculation or scheduled task is idempotent and safely re-runnable. Running it twice, or resuming after a failure, does not double post a ledger entry or double count a total. |

---

## 5. Design Constraints

These are the constraints the design must respect. Each is a consequence of the requirements cited, not a new requirement. **No `DC-` carries a phase tag either**, for the reason given in §4: a constraint holds from the first line of Phase 4, and Phase 7 verifies it rather than delivering it.

| ID | Constraint | From |
| -- | ---------- | ---- |
| DC-1 | **Policy is data, not code.** Every item in the `FR-6.4` list is stored as data and editable at runtime with no code change and no redeploy. Business rules live in configuration and in a single calculation service. | FR-6.4, NFR-10 |
| DC-2 | **One access control model.** Permissions and the scope each role holds them at are stored as data and editable from an administration screen, effective on the next request. `OFFICE_ADMIN`'s permission set is a permanent superset that cannot be reduced. The four seeded roles are the complete set; a fifth needs a schema change. One role per user, relaxable later by configuration rather than schema change. | FR-1.2, FR-1.3, FR-1.4 |
| DC-3 | **Nothing is destroyed.** Soft delete everywhere; no endpoint physically deletes a user, attendance, or leave record. Working records are edited in place and soft deleted, ledger entries are cancelled only by a reversing entry, and audit records are append only. | FR-2.2, FR-6.8, FR-9.3, NFR-9 |
| DC-4 | **Derived, never stored.** A leave balance is replayed from the ledger and is never a directly editable stored number. An employment period is computed from tenures whenever needed. Date of joining and date of leaving are the deliberate exception: they are two separate attributes stored on the user because every screen and report reads them, and the operations that write a tenure write both in the same step so neither can drift. | FR-6.8, BR-14, FR-2.12, FR-2.6 |
| DC-5 | **Time is resolved through the shift.** All timestamps stored in UTC; the timezone lives on the shift; there is no company wide default timezone, and any display default never enters a calculation. Shift instants account for the daylight saving offset in force on the work date. The work date is always computed by the system, using the shift held on that date, and recomputed when the punch or assignment changes. | FR-3.10, FR-3.11, FR-5.8 |
| DC-6 | **No fallbacks that hide a gap.** A missing shift, a required configuration value not yet set, an unparseable date, a missing or unknown employee code, a missing punch, or an untracked user raises an exception, a prompt, or a stated rejection rather than a default or a silent zero. | FR-3.12, FR-3.13, FR-4.4, FR-4.8, FR-4.11, FR-2.10 |
| DC-7 | **Human decisions survive recomputation.** Overrides are stored on the record they change, next to the engine's value, with no separate override record, and a recalculation refreshes the engine's value while leaving the override in place. | FR-6.11, FR-6.12 |
| DC-8 | **Authentication is external.** Google sign in only; no passwords stored or verified; no secrets in the repository. | FR-1.1, NFR-6 |
| DC-9 | **Deterministic and re-runnable.** Calculations are reproducible on unchanged inputs; recalculations and scheduled tasks are idempotent; concurrent writes use version checks rather than last-write-wins. | NFR-8, NFR-14, NFR-15 |
| DC-10 | **Built for 1000 users and 5 years, no further.** Full-company views page or virtualise rather than materialising every row. | NFR-5, NFR-3 |
| DC-11 | **Accessible and self explanatory.** WCAG 2.1 AA contrast and keyboard navigation; status never conveyed by colour alone; no unexplained abbreviation. | NFR-12, NFR-2 |
| DC-12 | **Phase 2 features need no migration.** The schema supports employee self service leave requests, the manager approval workflow, and multi tenancy from day one, and the `MANAGER` role with its `TEAM` scoped leave approval permission is seeded in Phase 1. | 2.3, FR-6.7 |
| DC-13 | **Runs locally with a single command.** | NFR-13 |
