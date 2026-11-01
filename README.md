# FitPlatform

A fitness prototype with one React application and a reusable Express REST API. Athletes, coaches, gym owners and admins have separate workspaces. The existing workspace contained code for phases 1-7; the latest pass audits and completes missing workflows rather than restarting phase 1.

## Stack and reference conventions

- React 18, TypeScript, Vite, React Router, Redux Toolkit, TanStack Query and Tailwind.
- Three.js through React Three Fiber and drei; lazy-loaded real anatomy and skin GLBs from GymBuddy.
- Express 4, Mongoose 8, MongoDB, Zod, bcrypt and cookie-based JWT authentication.
- Gemini through the backend-only `@google/genai` client. Model name and key are environment variables.
- GymBuddy supplies the folder conventions, cookie auth, API envelopes and independent mesh registry. JiraProj supplies validation and AI integration references. Direct Gemini calls are used here rather than an unnecessary agent graph.
- Following GymBuddy, authentication uses one httpOnly JWT cookie rather than access/refresh tokens. The backend checks current database roles on every authenticated request.

## Run locally

Use Node.js with the installed project dependencies and a reachable MongoDB instance.

```powershell
cd backend
Copy-Item .env.example .env
# Configure MONGODB_URI, JWT_SECRET and optionally GEMINI_API_KEY.
npm install
npm run seed
npm run seed:marketplace
npm run dev
```

In a second terminal:

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Open http://localhost:5174. The API defaults to port 3002. The browser always calls `/api/v1` on the site it loaded. Vite proxies that in development, and nginx proxies it to `API_UPSTREAM` in production. The two `*.run.app` hosts are different sites, so the phone must not call the API host directly. Keep `CORS_ORIGIN` and `FRONTEND_URL` on the API set to the frontend origin. Production requires explicit JWT_SECRET and MONGODB_URI. A missing Gemini key still allows deterministic plan generation; chat and summaries require Gemini.

Docker Compose is also provided. Review its environment settings before starting services.

## Demo accounts

Sign in offers buttons that fill these real seeded credentials; authentication still goes through the backend.

| Workspace | Email | Password |
| --- | --- | --- |
| Athlete | athlete1@fitplatform.app | Athlete1234! |
| Coach | coach1@fitplatform.app | Coach1234! |
| Gym owner | owner@fitplatform.app | Owner1234! |
| Admin | admin@fitplatform.app | ChangeMe123! |

Admin seed email/password can be overridden through ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD. The other coach is coach2@fitplatform.app; athletes run from athlete1 to athlete10. Rerunning the seed preserves existing users instead of resetting passwords. Demo passwords are for a local prototype.

## Access and workflow

1. Public registration requires an eight-character minimum password and creates an athlete only. Requests that attempt to self-assign a staff role are rejected.
2. Admin signs in to `/admin`, finds an account and grants coach or gym-owner access. Granting owner access provisions a gym. Existing gyms are reused when restoring access.
3. Users holding several roles can switch workspaces. The navbar links to the current role's tools.
4. A coach invites an existing athlete by email. The athlete accepts or declines under Settings. Only an active relationship grants access to their calendar and summaries.
5. Gym owners create email-bound invitation links for members or already approved coaches. Share the link directly; email delivery is not connected. Recipients sign in with the matching email and accept at `/join-gym`.
6. Settings controls kiosk PIN, detailed-log sharing, Excel/JSON exports and account deletion. Owners must transfer their gym before deleting the account. The prototype does not yet expose an ownership-transfer screen.

## Phase coverage

| Phase | Implementation |
| --- | --- |
| 1 | Separate frontend/API, auth, role routing, backend ownership checks, seeded staff and athletes |
| 2 | Muscle/exercise library, search, exercise details, real GymBuddy 3D explorer, muscle/skin and camera controls, mesh registry |
| 3 | Planned/blank workout logger, set entries, effort, pain, duration, calendar, insights, personal bests and attendance |
| 4 | Coach roster/filter/sort, workout templates, multi-athlete assignment, calendar rescheduling, comments and weekly AI summary |
| 5 | Owner attendance dashboard, member/coach directories, invitation links, branding, kiosk pairing/revocation, PIN and QR check-in |
| 6 | Gemini plans/chat/summaries/nudges, JSON validation, retry/fallback planning, deterministic safety limits, last 20 chat messages, usage logging and per-user rate limits |
| 7 | Responsive UI, demo credentials, PWA shell, permission tests, plan-safety tests and setup documentation |

## AI safeguards

All generated plans and fallback plans pass the same deterministic safety function before saving:

- Exercise IDs must belong to the library; unavailable equipment and advanced beginner exercises are excluded.
- Maximum six training days, no duplicate days, and no training the same primary muscle group on adjacent days.
- Sets per group are capped at 110% of the last seven days; groups with no baseline receive a conservative starting allowance.
- Beginners have per-exercise and starting-volume caps.
- Recent pain reduces set counts, removes target load and adds professional-assessment advice.
- Invalid model output is retried once before falling back to library exercises. Regenerating replaces upcoming planned AI workouts while preserving completed and manually assigned work.

Analytics are ordinary code, not model-generated numbers. Chat, summaries and nudges validate response shapes. Raw Gemini output is never rendered as HTML. Actual Gemini connectivity depends on the configured key and model.

## Kiosk

Register a device in Gym > Kiosk. Pair at `/kiosk/:gymId` with the one-time six-digit code. Pairing codes expire in ten minutes; paired device secrets stay in that browser's local storage and are stored hashed in MongoDB. Owners can revoke them.

Members can scan the displayed QR using a signed-in phone and explicitly approve the check-in. QR requests expire in two minutes and approval is single use. Set FRONTEND_URL to a phone-reachable HTTPS origin for real phone testing: localhost on a phone refers to the phone itself. The alternate email + four-digit PIN flow requires an active membership. Configure the PIN in Settings; five failed attempts lock it for 15 minutes.

Kiosk session reads and logout require the paired device secret. A session records attendance, displays today's workout, and expires after 90 seconds. The UI clears member state at expiry/logout. PIN fields are masked. An unplanned day still offers an explicit logout action.

## Privacy

Gym owners receive attendance and summary information, not detailed training profiles. Coaches can read detailed logs only when the athlete enables sharing. Calendar assignments and summary statistics remain available to the active coach. Comments verify that their referenced workout belongs to the selected athlete.

Settings > Your data exports an Excel workbook or a JSON archive. Both include profile, workouts, logged sets, recovery, attendance, memberships, coaching relationships, authored comments, conversations, notifications and marketplace/payment activity. Excel preserves numeric values and dates in separate filtered sheets; JSON also contains saved photo content. Excel lists photo metadata only. Exports exclude authentication secrets and kiosk PIN hashes. Account deletion removes personal training records, relationships, sessions and comments associated with those workouts. Deletion is a prototype workflow rather than a transactional compliance/retention system.

## Structure

```text
backend/src/
  config/ database/ models/ controllers/ routes/ middlewares/
  services/ai/             # prompts, validated Gemini calls, deterministic safety
  services/analytics/      # training volume, streaks, attendance, personal bests
  seed/ validations/ utils/
backend/tests/
frontend/src/
  pages/{auth,athlete,coach,gym,kiosk,admin}/
  components/{common,layout,athlete,coach,muscle,workout}/
  3d/                     # anatomical GLB mapping, selection, camera
  services/ queries/ store/ types/ tests/
frontend/public/           # PWA manifest, icon and service worker
```

## Tests and build

```powershell
cd backend
npm test
# Auth, backend role/ownership checks, admin provisioning, kiosk pairing,
# QR approval/replay, comment privacy and deterministic plan safety.
cd ../frontend
npm test
npm run build
```

Backend tests use a disposable MongoDB memory server. They do not use the configured application database. Frontend tests cover roles, the real GLB muscle-name mappings, immediate chat sending, notification state/focus, checkout callbacks and muscle exercise navigation. Backend tests also cover notifications, marketplace ownership/moderation, Excel numeric/privacy behavior and mocked Razorpay capture/signature/replay handling. Production builds report bundle-size advisories for chart and 3D dependencies.

## Models and PWA

The explorer uses GymBuddy's real, Draco-compressed `public/models/body.glb` and matching `skin.glb`. Decoders are hosted locally in `public/draco`, so loading does not depend on a decoder CDN. The Muscles / Skin toggle shows the supplied body in two layers; there is no separate female asset in the reference.

`3d/anatomyMapping.ts` maps named anatomical parts to the 21 seeded library keys, including Three.js-sanitized names. `BodyModel.tsx` clones cached scenes, prevents skin/bones/container meshes from intercepting hits, splits the actual rectus-abdominis triangles into upper/lower regions, and applies selection, hover and heat-map materials. Skin mode uses an x-ray overlay for highlighted muscles. A keyboard-accessible muscle selector provides another way to select every library entry. Asset provenance is recorded in `public/models/NOTICE.md`.

The service worker caches the shell and static assets. API requests remain network-only. Installability and offline behavior require a production build on HTTPS or localhost. Offline logging, push notifications and native integrations are out of scope.

## Remaining prototype boundaries

- The reference includes one anatomical body, not separate male/female models.
- Password-reset email and invitation email delivery are not connected. Password help is explicitly labeled as a stub.
- Gemini live responses require your own valid key and an available configured model; automated tests exercise deterministic safety without calling paid APIs.
- Account erasure is not transactional, and ownership transfer currently requires an administrative database operation.
- Live wearable OAuth/native health-store bridges, native mobile apps, recurring nutrition subscriptions, outbound email/SMS and browser push are not connected. Dated recovery imports and persistent in-app notifications are available.


## Connected coaching update

The athlete home now follows the approved recovery-to-training timeline; the coach workspace provides a roster and evidence/approval pane. The landing page has no 3D model and uses scoped GSAP ScrollTrigger and ScrollToPlugin effects with reduced-motion handling. The anatomy model remains available inside the explorer and kiosk.

### Recovery data

`Recovery` stores dated sleep minutes, resting heart rate, HRV, steps, fatigue and soreness with source provenance. `GET /performance/me` reads the authenticated athlete's records and reviews. `POST /performance/daily` accepts a manual check-in. `POST /performance/import` accepts consent, sourceLabel and up to 90 normalized daily records. `/performance/import/fitbit` accepts a daily Fitbit sleep summary response. Bulk imports queue one review rather than one paid AI call per historical day.

Run `npm run seed:performance` from backend to add 28 days of explicitly labeled demo data and upcoming sessions for the existing seeded athletes. It preserves personal accounts and existing records. Fitbit/Health Connect/Apple Health exports are imports; live device OAuth and native health-store bridges are not implemented. Jira's AI credentials cannot authorize access to a watch.

### Automatic validation and coach approval

The API queues a durable TrainingReview whenever an athlete submits a workout log or recovery record. The worker starts with the API, claims jobs with a lease, retries failed processing and stores rules evidence plus a schema-validated Gemini explanation. It runs in the background; the UI refreshes review status every 10 seconds. Completion checks compare logged sets, repetitions and target weights, and explicitly do not prove physical performance. Readiness is a transparent heuristic from available signals, not a clinical score. Missing and stale data are separate states. Pain and low-readiness rules override model recommendations.

Nothing silently changes a coach-assigned workout. The active assigning coach explicitly approves or declines an adjustment; changed workouts fail optimistic concurrency checks. A new AI week for a coached athlete is a draft. Approval adds safe sessions to the coach's templates; calendar assignment remains explicit in the workout builder. No existing assignment is silently replaced. Rules are rechecked at approval. The automatic worker limits AI use per athlete and falls back to disclosed rules-only explanations if Gemini is unavailable.

### Photo-capable AI companion

`/athlete/companion` and the daily sidebar use persisted conversation history. Users can choose a photo, use the phone camera, view a preview, remove it before sending, and browse their private gallery. The browser resizes images and strips metadata by re-encoding. The backend validates image signatures, MIME types and a 4MB decoded limit before sending inline image data to Gemini. Saved photos are served only through authenticated owner-scoped endpoints with no-store headers. Food estimates are approximate; photo answers must communicate uncertainty and avoid medical diagnosis.

The relevant GEMINI_API_KEY and GEMINI_MODEL settings were copied locally from the authorized JiraProj environment. Database, JWT, app URLs and unrelated OAuth credentials were preserved. No environment values are committed. The copied Gemini configuration was tested against the provider successfully.

### Payments

The accepted-request payment workflow is implemented; collection remains disabled because Razorpay credentials will be added later. Athletes send a package request, the provider accepts, and only then can the athlete pay the saved package fee. The server creates the order from the immutable request price, verifies the checkout signature and gateway capture, and activates coaching only after capture. Signed raw-body webhooks recover interrupted checkout. Payment records expose capture and fulfilment separately, gateway refresh, support requests and admin order reconciliation. Demo listings cannot be charged in live mode. See backend/PAYMENTS.md for setup and the limits below.

### Verification and limits

Automated checks cover recovery ingestion/consent, review queuing, plan approval ownership/replay/staleness, image validation/privacy, auth, analytics and 3D name mappings. Live verification used seeded accounts and a synthetic geometric image, not personal user photos. The front end's final design tokens and component rules are in frontend/DESIGN.md. The API remains a prototype: account erasure and multi-document approval writes are not a transactional compliance system.


## Navigation, notifications and coach discovery

The shared header has compact workspace links, an Explore/Tools menu, notifications and an account menu. Phones use an expandable navigation panel. Settings separates account information, training/privacy, invitations and exports. Shared page gutters, field labels, persistent errors, calendar day details, template editing, exercise pagination and empty/loading states were reviewed across roles.

The AI workspace has searchable named conversations, new chat, rename, archive/restore, deep links, photos and readable answers. Sending immediately adds the question and clears the composer while a separate answer placeholder waits. Failed replies can retry the same saved turn.

Notifications are stored per recipient and include coach assignments/rescheduling, invitations, ready reviews, coach decisions, marketplace requests/moderation and confirmed payments. The bell polls while signed in; users can filter unread, mark read/unread, mark all read and open the linked record. Assignment links select the scheduled calendar date. They are in-app updates, not operating-system push notifications.

`/coaches` lists only opted-in public profiles of approved coaches. Coaches edit their public profile at `/coach/profile`, publish their approach, specialties, availability and location, and invite existing athletes from their workspace. `/coaches/:coachId` shows actual published packages and their fees. No ratings or credentials are invented. Direct invitations support existing clients; paid discovery uses the package-request workflow. Detailed logs remain controlled by the athlete's sharing preference.

## Marketplace and package requests

`/marketplace` reads its catalogue from MongoDB: coach-made plans, coaching packages, meals, supplements and gear. It provides search, categories, sorting, pagination and saved offerings. Listing details show scope, price and provider. Athletes can request a package, track its status or cancel before acceptance. Providers review incoming requests, accept/decline with a response, manage drafts and submit listings for review. Admins approve publication. Food/supplement listings require an admin's explicit acknowledgement of a manually verified seller licence reference.

`npm run seed:marketplace` adds five explicitly marked demo listings and the demo coach profile without overwriting existing records. Food/supplement examples remain drafts. Demo catalogue prices illustrate the workflow and do not adopt the PDF's planning figures as commercial prices. Create and approve a genuine offering before enabling live charges.

Payment limitations: this integration collects one accepted package fee. A monthly offering collects its first period only; automatic renewal, entitlement expiry, subscriptions, Route/split payouts, tax invoices, shipping and automatic refunds are not implemented. Non-coaching orders require provider-arranged delivery. Merchant settlements/refunds remain in the merchant dashboard. Completed-payment accounts require support-assisted closure. No gateway transaction was attempted without credentials; payment tests mock the provider in an isolated database.

The PDF is a product roadmap, not evidence that external integrations or merchant approvals exist. Native health bridges, commercial seller onboarding, automatic billing/payouts and app-store distribution remain separate integration work.
