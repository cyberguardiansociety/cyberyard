# CyberYardHub — Project Context

This document exists so that another developer (human or AI) can pick up this
project with zero prior context and continue building it correctly. Read this
before touching any code.

**This is an existing, in-progress project.** It is not a template and not a
fresh scaffold. Do not regenerate it from scratch, do not "improve" the
architecture wholesale, and do not restyle it. Extend what's here.

---

## 1. Project Purpose

CyberYardHub is a futuristic-themed cybersecurity CTF (Capture the Flag)
learning platform. Users register an account, land on a dashboard, track
points/rank/solved challenges, browse a leaderboard, and (as of this export)
browse and open CTF challenges. The brand tagline is **"Secure Today.
Stronger Tomorrow."**

The project is being built **incrementally, phase by phase**, with the UI/UX
shell built out first and real backend-powered functionality (actual flag
validation, real scoring, live leaderboard data) intentionally deferred until
directed. Each phase so far has been delivered as updates to one growing
front-end codebase.

---

## 2. Current Technology

- **Plain HTML + CSS + vanilla JavaScript.** No framework (no React/Vue),
  no build step, no bundler, no package.json.
- **No backend.** Everything runs client-side in the browser.
- **Persistence:** the browser's `window.storage` API (an artifact-provided
  key/value store — `window.storage.get/set/delete/list`, each call optionally
  scoped `shared: true/false`). This is **not** `localStorage`/`sessionStorage`
  — those are unsupported in the artifact environment this project was built
  in. If you move this project outside that environment (e.g., a real static
  host), `window.storage` will not exist and you must swap in a real backend
  or a browser-storage shim.
- **Auth:** passwords are hashed client-side with the browser's native
  `crypto.subtle.digest('SHA-256', ...)` before being stored. There is no
  server, so this is **not production-grade security** — it exists only so
  the prototype doesn't store plaintext passwords. A real backend must own
  authentication before this goes live.
- **Fonts:** Google Fonts, loaded via `@import` in `css/style.css`
  (`Chakra Petch` for headings/display, `Inter` for body text).
- **Icons:** hand-written inline SVGs (no icon library/font).
- **Images:** one raster asset, the CyberYardHub logo (`assets/images/logo.jpg`),
  used across the navbar, hero, auth panels, and footer.

---

## 3. Complete Project Structure

```
CyberYardHub/
├── index.html              All markup, all views/pages (single HTML document,
│                            JS-driven view switching — see Architecture below)
├── css/
│   └── style.css           All styling: design tokens, layout, components,
│                            animations, responsive rules
├── js/
│   └── script.js           All application logic: routing, auth, session,
│                            dashboard/profile/leaderboard/challenges data
│                            and rendering, nav state, UI helpers
├── assets/
│   ├── images/
│   │   └── logo.jpg        The CyberYardHub logo (real image file, decoded
│   │                       from the base64 that used to be inline in the HTML)
│   └── icons/               Currently empty — see "Design Decisions" below
└── PROJECT_CONTEXT.md       This file
```

This structure is the result of a **reorganization only**. The project was
previously a single self-contained `index.html` file with inline `<style>`,
inline `<script>`, and the logo embedded as a base64 data URI (this was done
deliberately at the time, to keep the whole app portable as one artifact
file). Nothing about the design, markup, styling, or behavior was changed
during this reorganization — only *where* the code lives.

---

## 4. All Completed Features

### Foundation & branding
- Full design system: near-black/navy background (`#04060c`), neon cyan/blue/
  purple accents, angular clip-path geometry instead of rounded corners,
  Chakra Petch + Inter typography, ambient glow/gradient backgrounds, a subtle
  floating-particle layer, grid overlay.
- Logo integrated into navbar, hero, all auth panels, and footer.

### Homepage
- Hero section with animated staggered entrance, headline, sub-copy, primary
  CTA ("Start Hacking") and secondary CTA ("Explore Platform", smooth-scrolls
  to Features).
- Feature grid (4 cards, SVG icons).
- "Getting started" band with numbered steps.
- Smooth scrolling throughout.

### Authentication system
- **Login** — email/password, inline validation, password show/hide toggle,
  "keep me signed in" checkbox, banner-level error alerts. A successful
  login navigates straight to the dashboard with no success banner.
- **Register** — username/email/password/confirm, password toggles on both
  fields, terms checkbox, per-field inline validation errors, live strength
  meter and requirement checklist.
- **No emailed password recovery** — the "forgot password" and "reset
  password" screens, the `/api/auth/forgot-password` and
  `/api/auth/reset-password` endpoints, the `PasswordResetToken` issuance
  path and the reset email template were all removed. A self-hosted range
  does not need an unauthenticated credential-mutation surface, and
  `security:audit` now asserts both the frontend and the API stay that way.
  Passwords are still changed from an authenticated session via Settings →
  Change password (which revokes every other session).
- **Logout** — clears the server session, returns to the landing page, and
  resets nav state everywhere.
- Accounts and sessions persist via the server session (httpOnly cookie);
  see Architecture. Passwords are hashed with Argon2id server-side.

### Navigation system
- One global navbar used across every view: logo, product links (Home,
  Dashboard, Challenges, Leaderboard, Profile, Settings), guest state
  (Log in / Get started) vs. authenticated state (avatar + dropdown menu).
- Avatar dropdown: name/email header, Dashboard, Profile, Settings, Log out.
  Closes on outside click.
- Mobile hamburger menu: slide-in drawer with backdrop-to-dismiss, animated
  hamburger→X icon, same links, same auth state handling.
- **Active-page indicator**: a single `currentNav` variable drives `.active`
  styling on every matching `[data-nav]` element simultaneously — top navbar,
  mobile drawer, and every per-page sidebar all light up together.
- Every "app" page (Dashboard, Profile, Leaderboard, Challenges, Challenge
  Detail) is a **protected route**: if there's no session, the router
  redirects to Login with an explicit on-screen message rather than failing
  silently.

### Dashboard (protected)
- Sidebar (Overview / Challenges / Leaderboard / Profile / Settings / Log out)
  + main content: welcome header, 4 stat cards (points, rank, challenges
  solved, streak — **mock data**), profile summary card, skill-progress bars
  by category, recent-activity feed, achievements grid (earned vs. locked),
  quick-action buttons.

### Profile page (protected)
- Its own dedicated route (not just a scroll-anchor inside the dashboard):
  large avatar hero with Edit Profile button (shows a "coming soon" toast —
  editing isn't wired up), stat cards, About/bio placeholder, skill progress,
  recent activity, achievements. Username/email/join-date are real (pulled
  from the session/account); the rest is the same illustrative mock data used
  on the dashboard.

### Leaderboard (protected)
- Top-3 podium (medal-colored rank badges, avatar, points, solved count).
- Ranked table for positions 4–10.
- A "your position" row (with a **You** tag) appended after an ellipsis
  divider, using the logged-in user's real name/avatar initial plus mock
  rank/points.
- Data lives in one array, `MOCK_LEADERBOARD`, shaped like a future API
  response (`rank`, `username`, `points`, `solved`, `online`).

### Challenges system (frontend only — see section 9)
- **Challenge list page**: progress bar ("X / Y solved"), live search,
  category filter pills (Web Exploitation / Cryptography / Forensics / Binary
  Exploitation), difficulty filter pills (Easy / Medium / Hard / Insane),
  responsive card grid. Cards show category, difficulty badge (color-coded),
  title, one-line teaser, points, and a "Solved" badge where applicable.
  Empty state when filters/search return nothing.
- **Challenge detail page**: back link, title, difficulty badge, solved
  badge, category tag, global solve count, points, full description, and a
  flag-submission form.
- **Flag submission UI**: text input + "Submit Flag" button. On submit it
  shows a loading state ("Verifying…") and then an **info-style banner**
  explicitly stating that submission isn't connected to a backend yet. This
  is intentional — see section 9, do not wire up real validation without
  being asked.
- Mock data: `MOCK_CHALLENGES`, an array of 15 challenges shaped like a
  future `GET /api/challenges` response (`id`, `title`, `category`,
  `difficulty`, `points`, `solved`, `solves`, `teaser`, `description`). Three
  are marked solved and intentionally match the "recent activity" entries
  already shown on the Dashboard/Profile pages (Baby SQLi, Weak Cipher,
  Hidden in Plain Sight), for narrative consistency.

---

## 5. Features Currently In Progress

Nothing is mid-edit as of this export — every feature described above is in
a working, clickable, non-broken state. The Challenges system was the most
recently completed phase.

That said, the Challenges system is **UI-complete but backend-empty**: the
list/filter/detail/flag-submission UI is fully built, but flag checking,
scoring, and persistence of "solved" state across sessions are not
implemented (see section 9).

---

## 6. Known Bugs / Limitations

- **No real backend.** Everything (auth, stats, leaderboard, challenges) is
  either `window.storage`-backed (accounts/sessions) or hardcoded mock data
  (points, rank, solved counts, leaderboard rows, challenge list). None of
  the numbers you see (3,420 points, rank #128, 27 solved, etc.) are computed
  from real activity — they're the same static demo values shown everywhere
  for narrative consistency.
- **Password hashing is client-side only.** SHA-256 via `crypto.subtle` is
  reasonable for a prototype but is not a substitute for real
  backend-owned authentication (no salting strategy, no rate limiting, no
  server-side verification).
- **`window.storage` is an artifact-environment API**, not a browser
  standard. If this project is deployed as a plain static site outside that
  environment, account/session persistence will break until it's replaced
  with real backend calls (or, at minimum, a different storage shim).
- **Solved/unsolved challenge state does not persist per-user.** The `solved`
  flag on each mock challenge is hardcoded in the data array, not derived
  from anything the logged-in user has actually done.
- **Flag submission does not validate anything.** By design (see section 9)
  — it always shows the same "not connected to a backend yet" message after
  a short simulated delay, regardless of what's typed in.
- **A previously-broken image reference was found and fixed during this
  export.** The Forgot Password page's logo `<img>` had an unresolved
  `{{LOGO_B64}}` templating placeholder left over from an early build step
  (a find-and-replace step that ran before that page existed), so its logo
  was a broken image. This is now fixed — it points to the real logo asset
  like every other instance. If you ever see a stray `{{...}}`-style token
  anywhere in this codebase, treat it as a bug and resolve it the same way.
- **Settings page does not exist yet.** It appears in the nav as a
  "SOON"-tagged link everywhere (top nav, mobile drawer, every sidebar) and
  currently just triggers a toast notification (`notifySoon('Settings')`).
- **No automated tests.** All validation on this project so far has been
  manual: HTML tag-balance checks, duplicate-ID checks, and
  `node --check` on the extracted JS after every change.
- **Achievements, skill-progress percentages, and activity feeds are static
  illustrative content**, not computed from real user behavior.

---

## 7. Important Design Decisions

- **Angular geometry over rounded corners.** Buttons, cards, inputs, and
  panels use CSS `clip-path` polygons for cut corners instead of
  `border-radius`. This is a deliberate, consistent brand choice — don't
  introduce rounded corners into new components without discussing it.
- **Color tokens are CSS custom properties** defined once on `:root` in
  `css/style.css` (`--void`, `--panel`, `--cyan`, `--blue`, `--purple`,
  `--text`, `--muted`, `--danger`, etc.). Always reuse these variables in new
  CSS rather than hardcoding hex values, so the palette stays centrally
  controlled.
- **One shared page shell for all "app" pages.** Dashboard, Profile,
  Leaderboard, Challenges, and Challenge Detail all reuse the same
  `.dashboard-shell` (sidebar + main content) pattern, each with its own copy
  of the sidebar markup. This was a deliberate tradeoff: plain HTML/JS has no
  templating/component system, so the sidebar is duplicated across five
  `<section>` blocks rather than factored into a single reusable partial.
  **If this project is ever migrated to a framework (React/Vue/etc.), the
  sidebar should become one shared component** — that refactor was
  consciously deferred, not overlooked.
- **Single-page, JS-driven "view switching," not real routing.** There are
  no URLs per page (no `#/dashboard`, no History API). Every page is a
  `<section class="view" id="view-*">` inside one `index.html`, and
  `showView(name)` toggles which one has the `.active` class (CSS
  `display:none` otherwise). Navigation "functions" like `goToDashboard()`,
  `goToProfile()`, `goToChallenges()`, `goToChallengeDetail(id)` are really
  just: check auth → populate the section's DOM → call `showView()`. See
  section 8 for the full mechanism.
- **Protected routes redirect with a visible message, not silently.** Every
  `goTo*()` function for an authenticated page calls
  `redirectToLoginFromNav(actionDescription)` when there's no session, which
  shows Login with an explicit "Please log in to \_\_\_." banner. Keep this
  pattern for any new protected page.
- **Active nav state is centralized.** One JS variable (`currentNav`) plus
  one function (`updateActiveNav()`) drives `.active` styling on every
  `[data-nav="..."]` element in the DOM at once, regardless of which physical
  nav/sidebar it lives in. Don't build a second, separate active-state
  mechanism for a new page — set `currentNav` and call `updateActiveNav()`.
- **Not-yet-built features get a toast, not a dead click.** `notifySoon(
  featureName)` shows a small toast ("X is launching soon…") for anything
  that has a nav entry but no real page yet (currently: Settings). Use this
  same function for future "coming soon" placeholders instead of inventing a
  new pattern.
- **Mock data is shaped like the future API.** `MOCK_LEADERBOARD` and
  `MOCK_CHALLENGES` are arrays of plain objects using the field names a real
  backend response would use. Rendering functions (`renderLeaderboardTable`,
  `renderChallengeGrid`, etc.) consume the array generically — the intent is
  that swapping in a real `fetch()` call later requires no change to the
  rendering code, only to where the array comes from.
- **User-supplied strings are HTML-escaped before being injected via
  `innerHTML`.** See `escapeHtml()` in `js/script.js`. Any new code that
  renders challenge/leaderboard/user data through template strings must keep
  using it — this matters a lot once real user-submitted usernames/challenge
  data are involved.
- **`assets/icons/` is currently empty.** All icons in this project are
  small inline `<svg>` elements written directly in the HTML/JS template
  strings (there's no icon font or sprite sheet). The folder exists to match
  the requested project structure and to hold future standalone icon assets
  (e.g., a favicon, a PWA icon set) — it was not populated during this
  reorganization because extracting dozens of tightly-coupled inline SVGs
  into separate files would have been a large, risky refactor with no
  functional benefit, and the task was explicitly to reorganize, not
  redesign.

---

## 8. Current Architecture

**Everything lives in three files that all load together:**
`index.html` (structure) + `css/style.css` (presentation) +
`js/script.js` (behavior). There is no build step — open `index.html` in a
browser (or serve the folder statically) and it works as-is, **provided the
`window.storage` API is available** (see section 2 and section 6).

### View system
Every "page" is a `<section class="view" id="view-NAME">` inside one
`<main>`. Only the section with the `.active` class is visible
(`.view { display:none } .view.active { display:block }`). Two low-level
functions drive this:

- `showView(name)` — removes `.active` from every `.view`, adds it to
  `#view-{name}`.
- `goTo(view, anchorId)` — calls `showView`, then either scrolls to an
  in-page anchor (`anchorId`) or scrolls to top.

### Navigation dispatch
`navGo(name)` is the single entry point used by every nav link (top navbar,
mobile drawer, every sidebar). It switches on the item name and either calls
`goTo(...)` directly (Home) or a dedicated protected-route function:
`goToDashboard()`, `goToProfile()`, `goToLeaderboard()`, `goToChallenges()`.
"Not built yet" items call `notifySoon(name)` instead (currently: Settings).

Each protected-route function follows the same shape:
1. `await getSession()` — if null, call `redirectToLoginFromNav(action)` and
   stop.
2. Set `currentNav` to the matching value, call `updateActiveNav()`.
3. Populate that page's DOM (sidebar mini-profile, headline data, rendered
   lists/tables/cards) from session + mock data.
4. `showView(name)`, then scroll to top.

`goToChallengeDetail(id)` follows the same shape but is reached by clicking
a challenge card (`onclick="goToChallengeDetail(${c.id})"`), not from a nav
link — `currentNav` stays `'challenges'` so the Challenges nav item stays
highlighted while viewing a specific challenge.

### Session & account storage
Thin wrappers around `window.storage`:
- `getUser(email)` / `saveUser(user)` — key `users:{email.toLowerCase()}`,
  value is a JSON-stringified `{username, email, passwordHash, createdAt}`.
- `getSession()` / `setSession(session)` / `clearSession()` — single key
  `session`, value `{email, username}`.

All storage calls are wrapped in `try/catch` and treat failures as "no
data," per the artifact storage API's documented behavior (missing keys
throw rather than returning null).

### Auth flow
- `handleLogin(evt)` / `handleRegister(evt)` / `handleForgotPassword(evt)` —
  attached to each form's `onsubmit`. Each does inline field validation
  (regex email check, length checks, match checks), then an async
  storage/hashing step, then either a field-level error class
  (`.has-error` on the `.field` wrapper) or a banner alert
  (`showAlert(prefix, 'error'|'success', message)`).
- `handleLogout()` clears the session, resets `currentNav`, refreshes nav
  state, returns to the landing view.
- `refreshNavState()` runs on `DOMContentLoaded` and after every
  login/register/logout to toggle guest vs. authenticated UI (`#nav-guest`/
  `#nav-user`, `#mm-guest`/`#mm-user`) and populate the avatar/name/email
  everywhere they appear.

### Rendering pattern for data-driven pages
Leaderboard and Challenges both follow: keep a mock array at module scope →
a small set of pure render functions that read the array (plus any active
filter/search state) and set `.innerHTML` on a container → a `goTo*()`
function that calls those render functions before showing the view. Filters
(`challengeFilters` object: `{search, category, difficulty}`) are mutated by
`setChallengeFilter()` / `onChallengeFilterChange()`, which then re-render.

### Alerts & toasts
- `showAlert(prefix, type, message)` — generic two-state (error/success)
  banner used by the three auth forms. Looks up `#{prefix}-alert-error` /
  `#{prefix}-alert-success`.
- `showFlagAlert(type, message)` / `clearFlagAlerts()` — a three-state
  (info/success/error) variant built specifically for the flag-submission
  form, since it needs a neutral "not implemented yet" state that isn't a
  real success or failure.
- `notifySoon(feature)` — bottom-right toast for nav items with no page yet.

---

## 9. What Has NOT Been Implemented Yet

Be explicit about this with whoever/whatever picks this project up next —
these are gaps, not oversights:

1. **Any real backend.** No server, no database, no API.
2. **Real flag validation.** The Submit Flag button intentionally does not
   check anything — it always shows the same neutral banner. **Do not wire
   up client-side flag checking (e.g., comparing against a hardcoded correct
   flag in the mock data) without explicit direction** — the project owner
   has repeatedly and explicitly deferred real challenge mechanics.
3. **Real scoring / persistence of solved state.** Solving a challenge
   currently does nothing to the user's account, dashboard stats, or the
   leaderboard.
4. **Settings page.** Nav entry exists, shows a "SOON" tag, links nowhere
   real yet.
5. **Profile editing.** The Edit Profile button shows a toast; there's no
   edit form.
6. **Real leaderboard data.** `MOCK_LEADERBOARD` is static; there's no
   ranking computed from real users.
7. **Challenge hints, write-ups, attachments, or downloadable files** —
   nothing beyond title/category/difficulty/points/description exists per
   challenge.
8. **Any admin/authoring tooling** for creating or managing challenges.
9. **Password reset delivery.** The Forgot Password flow shows a generic
   "email sent" confirmation but doesn't send anything (no email service).
10. **Automated testing** of any kind.
11. **A11y pass.** Basic semantics (labels, alt text, button types) are in
    place, but there's been no dedicated accessibility audit (focus
    management on view changes, ARIA live regions for alerts/toasts,
    keyboard-only navigation of the mobile drawer/avatar menu, etc.).

---

## 10. Next Recommended Development Tasks

Roughly in the order they'd naturally come up, but defer entirely to
whoever's directing the project — nothing here should be started
unprompted, especially anything backend/scoring-related:

1. **Settings page** — the last "SOON" nav item; likely account preferences,
   maybe theme/notification toggles. Follow the exact same protected-route +
   shared-sidebar pattern as Profile/Leaderboard/Challenges.
2. **Design (not yet build) the real backend contract** for
   accounts/sessions/challenges/submissions/leaderboard, so the existing mock
   data shapes (`MOCK_CHALLENGES`, `MOCK_LEADERBOARD`, the `users:*`/
   `session` storage records) can be validated against it or adjusted before
   real integration work starts.
3. **Real flag submission + scoring**, once explicitly requested — this is
   the highest-impact remaining piece but has been deliberately gated behind
   direction from the project owner every time it's come up.
4. **Persist solved-state per user** and derive Dashboard/Profile stats
   (points, rank, challenges solved, skill-progress percentages, activity
   feed) from real data instead of shared mock numbers.
5. **Real leaderboard** computed from actual user standings once accounts
   have real point totals.
6. **Profile editing** (the button already exists and is wired to a toast —
   swap in a real form + save flow).
7. Only after the above: consider whether the project should move off
   plain HTML/CSS/JS onto a framework. If/when that happens, the sidebar
   duplication called out in section 7 is the first thing to componentize.

---

## 11. Instructions For Another AI Continuing This Project

- **Read this file in full before making any change.** Then open
  `index.html`, `css/style.css`, and `js/script.js` and skim them —
  don't rely on this document alone, it's a map, not a replacement for
  looking at the actual code.
- **This is a continuation, not a new build.** Never regenerate the project
  from a blank template, never restyle it "for consistency" on your own
  initiative, and never remove features listed in section 4 without being
  asked. If something looks odd, assume it's an intentional decision (see
  section 7) before assuming it's a mistake — but if you do find a genuine
  bug (like the broken Forgot Password logo found during this export), fix
  it and note it, don't leave it.
- **Respect the deferred-scope boundary.** Real flag validation, real
  scoring, and a real backend have been explicitly held back multiple times
  by the project owner throughout this project's history. Do not implement
  them just because a task nearby makes it technically easy — wait to be
  asked directly.
- **Follow the existing patterns exactly** when adding a new page:
  - Copy the `.dashboard-shell` structure (sidebar + `.dash-main`) from an
    existing protected page.
  - Add a `data-nav="yourpage"` attribute to its link in every nav location
    (top navbar `#nav-links`, mobile drawer `#mm-links`, and the sidebar of
    every other protected page) so active-state highlighting stays in sync
    everywhere automatically.
  - Add a `goToYourPage()` function following the standard shape in section
    8 (check session → set `currentNav` + `updateActiveNav()` → populate DOM
    → `showView()` → scroll to top).
  - Add the `case 'yourpage':` branch to `navGo()`.
  - Reuse existing CSS classes and `:root` color tokens; don't invent new
    color values or corner-radius styles.
- **Validate before you consider a change done.** This project has been
  hand-validated after every edit with: HTML tag-balance counts (`<div>` vs
  `</div>`, `<section>` vs `</section>`, etc.), a duplicate-`id` check across
  the whole document, `node --check` on the JS, and a cross-reference of
  every `onclick`/`oninput`/`onsubmit` handler name against defined
  functions. Do the same before handing work back.
- **Keep mock data shaped like a real API response.** When adding new mock
  data, use the same field-naming style as `MOCK_CHALLENGES` /
  `MOCK_LEADERBOARD` so a future backend swap is a data-source change, not a
  rendering rewrite.
- **Escape user-controlled strings** (`escapeHtml()`) anywhere they're
  injected via `innerHTML`. Session-derived fields that are only ever set via
  `.textContent` (like `setText()`) don't need it, but anything built as an
  HTML string does.

---

## 12. Modification 2 — Challenge Management + CTF Lifecycle

Current source includes server-enforced challenge lifecycle states `DRAFT`, `PUBLISHED`, and `ARCHIVED`, additive Prisma migration `20260919020000_challenge_lifecycle`, stable challenge slugs, publication/archive timestamps, concurrency-safe First Blood tracking, server-side challenge search/filter/sort/pagination, challenge statistics, and admin lifecycle controls.

Archived challenges are removed from active user lists and reject submissions. A user who previously solved an archived challenge may still directly view its historical challenge detail and existing extras where the existing access rules permit; new hint unlocks and submissions remain closed.

Do not use `prisma migrate reset`. Apply migrations normally and preserve all existing data.

## 13. Modification 3 — Notifications + User Activity

Modification 3 adds a server-backed notification inbox and per-user activity timeline without replacing the existing CyberYardHub UI or navigation architecture.

### Database

Additive Prisma migration: `20260919030000_notifications_user_activity`.

New enums:
- `NotificationType`: `CHALLENGE_PUBLISHED`, `CHALLENGE_SOLVED`, `FIRST_BLOOD`, `BADGE_EARNED`, `SYSTEM`, `COMMUNITY`
- `UserActivityType`: account registration, login success, challenge solve, First Blood, badge earned, profile/community/security-related activity types.

New models:
- `Notification` — owner, type, title/message, optional internal link/target, read timestamp, dedupe key, timestamps.
- `UserActivity` — owner, controlled activity type, safe description, optional target/reference fields, bounded safe metadata, timestamp.

Indexes cover owner/read state/creation time/type and owner+creation time. Both models cascade with their owning user; no existing records are deleted or rewritten by the migration.

### API

Authenticated endpoints:
- `GET /api/notifications`
- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`
- `GET /api/activity`

Both feeds are owner-scoped server-side, paginated, and ordered newest first with an ID tie-breaker. Notification read mutations use the authenticated user's ID in the database predicate, preventing IDOR.

### Automatic events

- Challenge publication creates deduplicated `CHALLENGE_PUBLISHED` notifications for users who have challenge-update notifications enabled (or have no settings row yet).
- Successful first solve creates `CHALLENGE_SOLVED` activity/notification records.
- First Blood creates a `FIRST_BLOOD` activity/notification record.
- Newly awarded badges create `BADGE_EARNED` activity/notification records.
- New community replies notify the post owner with a `COMMUNITY` notification when the reply is from another user.
- Registration, successful login, email verification, password change/reset, session revocation, and community actions produce appropriate user activity records.

Solve-related activity/notifications are created in the same transaction as the solve and badge/First Blood changes. Deduplication uses a database uniqueness constraint for generated notification keys.

### Frontend

The existing SPA now includes:
- authenticated navbar notification bell with unread badge
- notification inbox with all/unread/read filters
- mark-one-read and mark-all-read actions
- notification pagination, loading, error and empty states
- Activity page with chronological pagination
- notification/activity links in the existing protected sidebar navigation
- existing Dashboard/Profile recent-activity sections now read from the real activity API

Internal notification targets are allow-listed by the frontend and generated server-side; arbitrary external redirects are not accepted.

### Security

Notifications and activity never expose another user's records. State-changing notification endpoints retain the global CSRF middleware. Zod validation is applied to query and ID parameters. Prisma ORM queries are owner-scoped and paginated. Rendered notification/activity content is escaped before HTML insertion. Metadata is bounded and restricted to primitive values; secrets, passwords, hashes, session tokens, raw flags and authentication tokens are not recorded.

No Operator role was added. Existing `USER` and `ADMIN` roles remain unchanged.

### Testing

Modification 3 should be validated with Prisma generate/migration, TypeScript type-check/build, frontend syntax/HTML/CSS checks, and live PostgreSQL/E2E tests when dependencies and a database are available. Static checks performed during this modification are documented in the final implementation report; unavailable live checks must not be represented as passed.

## Modification 4 — Advanced Gamification

Added an additive server-authoritative gamification layer while preserving the existing CyberYardHub UI and feature architecture.

### XP formula
- Challenge solve XP = `Solve.pointsAwarded + difficulty bonus`.
- Difficulty bonuses: Easy +10, Medium +20, Hard +35, Expert +50, Insane +50.
- First Blood = +50 XP.
- Newly awarded badge/achievement = +25 XP.
- Community XP is intentionally not awarded because the current community model has no server-side approval/moderation state that can safely qualify contributions.
- Every reward has a unique database `eventKey`; duplicate qualifying events cannot award XP twice.

### Level formula
Level 1 starts at 0 XP. The cumulative XP threshold for level `L` is:
`100 * (L - 1) * L / 2`.

Therefore level 2 begins at 100 XP, level 3 at 300 XP, level 4 at 600 XP, etc. Progress is calculated server-side from authoritative XP transactions.

### Streak rules
- A qualifying event is a successful unique challenge solve.
- Streak days use UTC calendar dates consistently.
- Multiple solves on the same UTC day do not increase the streak.
- A solve on the immediately following UTC day increments the streak.
- A gap greater than one day resets the current streak to 1.
- Longest streak is preserved.
- Streak milestone events currently cover 3, 5, 7, 14, 30, 60 and 100 days.
- The user's gamification profile row is locked during streak updates so concurrent solves cannot double-increment the streak.

### Achievements
The existing Badge/UserBadge architecture remains the achievement system. Criteria now additionally support level, First Blood count and difficulty milestones. Seeded achievement definitions include First Blood, solve/points/streak milestones, Level Five, Web Specialist and Hard Hitter without creating a duplicate achievement model.

### APIs
- `GET /api/gamification/me`
- `GET /api/gamification/progress`
- `GET /api/gamification/achievements`
- `GET /api/gamification/category-progress`
- `GET /api/gamification/difficulty-progress`

All endpoints require authentication and return only the authenticated user's private progression data.

### Database
Migration: `20260919040000_advanced_gamification`

Added `GamificationProfile` and `XpTransaction`, plus `XpTransactionSource`. Existing `UserActivityType` was extended with `LEVEL_UP` and `STREAK_MILESTONE`. Existing rows are preserved and each existing user receives a zero-XP level-1 gamification profile during the additive migration.

### Security / anti-abuse
XP is awarded only inside server-side challenge/badge transactions. There is no client XP mutation endpoint. Unique XP event keys prevent duplicate rewards. Level, streak and achievement state are not writable by frontend requests. Existing authentication, CSRF, validation, Prisma access controls and security-event architecture remain in place.

### Testing
Frontend syntax/HTML/CSS and static security checks are performed after the modification. Prisma generate, migration, full TypeScript type-check, production build and live PostgreSQL/E2E tests require project dependencies and a configured database; those are only reported as passed when actually executable in the environment.

## Modification 5 — Community & Social Features

Modification 5 extends the existing community system without replacing the Modifications 1–4 architecture or gamification rules. It adds controlled community categories, secure profiles, follows, blocking, post reactions, reports, admin moderation, paginated/searchable feeds, profile public-post/activity integration, and social notifications/activity records.

### Community/social APIs
- `GET /api/community/feed` and compatibility `GET /api/community/posts` — authenticated, paginated feed with category/search/sort filters.
- `GET /api/community/posts/:id` — authenticated post detail.
- `GET /api/community/posts/:id/comments` — paginated comments.
- `POST/PATCH/DELETE /api/community/posts` and `/:id` — owner-only post mutations.
- `POST/PATCH/DELETE /api/community/posts/:id/comments/:commentId` — owner-only comment mutations.
- `POST/DELETE /api/community/posts/:id/reaction` — authenticated LIKE reaction.
- `POST /api/community/reports` — authenticated post/comment reporting.
- `GET/PATCH /api/admin/community/reports/:id` and `GET /api/admin/community/reports` — ADMIN moderation.
- `DELETE /api/admin/community/posts/:id` and `DELETE /api/admin/community/posts/:id/comments/:commentId` — ADMIN content removal.
- `GET/PATCH /api/users/me/profile` and `GET /api/users/:id/profile` — public profile data plus self-edit endpoint.
- `POST/DELETE /api/users/:id/follow`, `GET /api/users/:id/followers`, `GET /api/users/:id/following`.
- `POST/DELETE /api/users/:id/block`, `GET /api/users/me/blocked`.

### Security/privacy
- Server-side ownership and role checks; no client-authoritative IDs, counts, roles, XP, or moderation state.
- CSRF/origin protection continues to apply globally to state-changing requests.
- Profile/community input uses Zod and bounded text fields; frontend renders untrusted content through `escapeHtml`.
- Blocks prevent follow/reaction/comment interactions in either direction and suppress blocked users from authenticated community feeds.
- Follow/reaction/report duplicates are prevented by database constraints and service-level handling.
- Community actions use bounded in-memory per-user rate limits appropriate to each action.
- Reports preserve moderation history when reported posts/comments are removed by using nullable target foreign keys with `SET NULL`.
- No social action awards XP; Modification 4 challenge/First Blood/badge XP remains unchanged.

### Database migration
One additive migration: `20260919050000_community_social_features`. It adds social enums, the community category column, follow/block/reaction/report tables, foreign keys, unique constraints, and indexes. No reset, truncate, destructive data deletion, or replacement of existing records is performed.

### Frontend
The existing SPA/theme remains intact. Community gains filters/search/sort/pagination, categories, likes, comments, reports, and moderation-aware interactions. Profile gains editable public fields, follower/following counts, public posts, category/difficulty progress, and existing gamification statistics.

## Modification 6 — CTF / Event Management

Modification 6 adds a server-authoritative CTF/event layer on top of the existing challenge and solve system. It is additive and preserves Modifications 1–5.

### Event lifecycle
- `DRAFT` — admin-only preparation state.
- `UPCOMING` — published event whose start time has not arrived.
- `LIVE` — derived server-side from `startAt <= now < endAt`.
- `ENDED` — derived server-side from `now >= endAt`.
- `ARCHIVED` — hidden from normal event discovery while preserving event data.

Clients cannot set lifecycle status. Publishing and archiving are admin-only; live/ended state is derived from timestamps.

### Registration
- Authenticated users can register/unregister while registration is open.
- Database uniqueness prevents duplicate registrations.
- Maximum participant capacity is enforced inside a serializable transaction to reduce concurrent over-registration.
- Withdrawal is locked once an event starts.

### Event challenges and scoring
- Events reference existing `Challenge` rows through `EventChallenge`; no second challenge or solve system exists.
- Only published challenges can be attached by admins.
- Optional event-specific challenge availability windows are server-validated.
- Event scoring is derived from existing `Solve.pointsAwarded` and `Solve.solvedAt` for solves occurring between the event start/end times.
- Event XP is not stored and no second XP system is introduced.
- Existing global XP, levels, streaks, badges and global leaderboard remain unchanged.

### Event leaderboard
- Server-calculated from event registrations and event-window solves.
- Rank ordering uses points descending, solves descending, last solve time ascending, then username for deterministic display order.
- First Blood is counted from the existing `FirstBlood` records for event challenges during the event window.

### Announcements and notifications
- ADMIN users can create, edit and remove event announcements.
- Registered participants receive announcement notifications through the existing notification service.
- Registration confirmation uses the existing notification service.
- Lifecycle notifications (starting soon, started, ending soon, ended) are server-generated with dedupe keys when event endpoints are accessed. A dedicated background scheduler is not part of this modification, so these notifications are request-triggered rather than guaranteed at an exact wall-clock instant.

### Admin controls
- Existing `USER` and `ADMIN` roles are preserved.
- Admins can create, edit, publish, archive events, manage event challenges, reorder them, manage announcements, inspect participants and view aggregate event statistics.
- The event DELETE endpoint archives rather than physically deleting event data.

### API groups
User:
- `GET /api/events`
- `GET /api/events/:id`
- `GET /api/events/:id/challenges`
- `GET /api/events/:id/leaderboard`
- `GET /api/events/:id/announcements`
- `GET /api/events/:id/stats`
- `POST /api/events/:id/register`
- `DELETE /api/events/:id/register`
- `GET /api/events/:id/my-progress`

Admin:
- `/api/admin/events...` create/update/archive/publish/challenge/announcement/participant/statistics operations.

### Database migration
One additive migration:
`20260919060000_ctf_event_management`

It adds `EventStatus`, `Event`, `EventRegistration`, `EventChallenge`, `EventAnnouncement`, event activity types and indexes/foreign keys. No reset, truncate, core-table drop, or existing-user/challenge/solve/XP/badge/notification deletion is performed.

### Security
- Existing authentication, CSRF/origin validation, admin middleware, admin rate limiting and request-size limits are reused.
- Event status, registration state, scoring, ranks and progress are server-authoritative.
- Zod validates event fields, dates, IDs, pagination and challenge ordering.
- Ownership and ADMIN checks are server-side.
- Public/user payloads omit private account/security information.
- Event announcements are plain text and frontend rendering uses the existing escaping helpers.
- Event writes have bounded rate limits.

## Modification 7 — Advanced Security + Comprehensive Testing

Modification 7 performs a production-oriented security audit across the full CyberYardHub application while preserving Modifications 1–6 and the existing UI/theme.

### Security fixes
- Revalidated server-side authentication, ADMIN authorization, ownership checks and IDOR protections across all major systems.
- Hardened Event/Phase 7 route authentication before controllers access `req.user`.
- Event leaderboard rank ties are based on points + solves; last solve time is only a display ordering tie-breaker.
- Open-event leaderboard totals now match the participant set used by the leaderboard query.
- Concurrent social block creation handles uniqueness races safely.
- Production unknown errors return a generic message and do not log raw exception messages/stacks; development retains diagnostic detail.
- Production CORS rejects localhost/loopback origins and requires `FRONTEND_URL` to match an allowed origin.
- Added `TRUST_PROXY=false` environment configuration for explicit reverse-proxy deployments.

### Dependency hardening
- Express: `^4.22.1`.
- Multer: `^2.4.0`.
- Nodemailer: `^10.0.10`; Node engine baseline: `>=20.19.0`.
- Removed `@types/nodemailer` because Nodemailer 10 provides its own types.

### Automated/static audit
Added `backend/scripts/security-audit.mjs` and `npm run security:audit`. The executed audit passed 28/28 checks covering role restrictions, raw SQL/shell/dynamic-code patterns, security middleware, cookies, upload limits, route guards, frontend navigation/escaping, dependency versions, migration destructiveness, `.env` and private-key scans.

### Actual verification status
Passed in the available environment:
- frontend Node syntax checks;
- security audit script (28/28);
- HTML duplicate-ID scan;
- CSS balance checks;
- migration destructive-operation scan;
- private-key literal scan;
- package.json validation.

Not executed successfully:
- dependency installation (timed out);
- Prisma generate/migrate;
- full TypeScript type-check/build;
- live PostgreSQL/security integration tests;
- full E2E/regression suite.

No live or dependency-dependent test is claimed as passed without actual execution.

### Database safety
No database reset, `TRUNCATE`, destructive migration, or deletion of existing users/challenges/solves/badges/XP/notifications/community records/events was performed in Modification 7. No schema migration was required for the application hardening changes.

### Production remaining risks
- Rate limiting is still single-process; use Redis/shared storage for multiple application instances.
- Live PostgreSQL/E2E verification remains outstanding until dependencies and a safe non-reset test database are available.
- Production should use Node 20+ because of the hardened Nodemailer 10 dependency.


## Modification 8 — Production / Deployment + Final Polish

Modification 8 is the final non-feature deployment/readiness pass. Existing Modifications 1–7 and the current SPA/theme are preserved.

### Production configuration
- Production requires strong, different `SESSION_SECRET` and `FLAG_HASH_SECRET` values (32+ characters), real `DATABASE_URL` credentials, HTTPS `FRONTEND_URL`, matching HTTPS `CORS_ORIGIN`, and complete SMTP configuration.
- Production rejects localhost/loopback CORS, wildcard CORS, placeholder secrets/database credentials, HTTP frontend origins, and missing SMTP credentials.
- `TRUST_PROXY` defaults to false and must only be enabled behind a trusted reverse proxy.
- `REDIS_URL` remains optional; the current rate limiter is single-process and multi-instance deployments should adopt shared Redis-backed limiting before horizontal scaling.

### Runtime hardening
- Added `X-Request-Id` correlation IDs for API requests.
- Production API errors remain generic and request identifiers are logged without secret/error-detail leakage.
- Added `GET /api/health/ready` for safe PostgreSQL readiness checks.
- Graceful SIGINT/SIGTERM shutdown stops the HTTP server, disconnects Prisma, and has a bounded timeout.
- Existing secure HttpOnly/SameSite/Secure session cookie behavior remains unchanged.

### Deployment assets
- `DEPLOYMENT.md` documents architecture, environment, migrations, SMTP, backups, challenge-file persistence, rate limiting, health checks, graceful shutdown and troubleshooting considerations.
- `Dockerfile` provides a non-root backend runtime image with a readiness healthcheck; it does not bake secrets into the image.
- `deploy/nginx.example.conf` provides an HTTPS/static-frontend/API reverse-proxy example.
- `README.md` provides concise local and production entry points.

### Frontend production behavior
The API wrapper now defaults to same-origin `/api` when the SPA is served over HTTP(S), while preserving the existing explicit meta/global API override and local `file:` development fallback. No authentication token is stored in localStorage. Existing SPA navigation and visual design are preserved.

### Testing limitations
Modification 8 source/static checks can be executed without PostgreSQL. Full dependency installation, Prisma generation/migration, production build, live PostgreSQL regression, SMTP delivery, browser accessibility/responsive verification, Docker image build and real reverse-proxy/HTTPS verification are environment-dependent and must be reported only when actually executed.
