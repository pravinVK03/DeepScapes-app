# DeepScapes

DeepScapes is an authenticated, project-centric workspace for keeping notes, tasks, documents, media, references, web research, collaborators, and project history together in one **Scape**.

**Live app:** [deepscapes.vercel.app](https://deepscapes.vercel.app)

## What it includes

- Private accounts with email/password and Google authentication through Supabase Auth.
- A personal default Scape for every account, plus template-based and blank Scapes.
- Notes, checkbox tasks, links, documents, images, videos, and audio resources.
- Direct-to-Supabase file uploads, avoiding Vercel request-size limits.
- Embedded PDF and PowerPoint viewing, with download fallbacks.
- Image or solid-color Scape thumbnails.
- Star, edit, delete, sort, list, tile, and detail views for resources.
- Owner, editor, and viewer collaboration permissions.
- Server-attributed audit history showing which authenticated collaborator made each change.
- An embedded Steel remote browser for research without opening many local tabs.
- Per-Scape browser profiles, resumable browsing context, and detailed Steel activity traces.
- Cost guards and rate limiting around Steel, Supabase storage, authentication, and Scape persistence.
- Responsive layouts for desktop and mobile.

## Technology

- [Next.js 16](https://nextjs.org/) with the App Router and Route Handlers
- React 19 and TypeScript
- Tailwind CSS 4
- Supabase Auth, PostgreSQL, and Storage
- Steel Sessions API for embedded remote browsing
- Vercel for production hosting

## Local development

Requirements:

- Node.js 20 or newer
- npm
- A Supabase project
- A Steel account and API key if remote browsing is required

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Create `.env.local` in the project root:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STEEL_API_KEY=your-steel-api-key
RESEND_API_KEY=your-resend-api-key
FEEDBACK_FROM_EMAIL=DeepScapes Feedback <feedback@your-verified-domain.com>
FEEDBACK_TO_EMAIL=padmanathan.kdev@gmail.com
```

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser | Supabase project URL used by the browser client. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser | Supabase publishable key used for authentication and signed uploads. |
| `SUPABASE_URL` | Server | Supabase project URL used by Route Handlers. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Database and storage access through the backend. Never expose this value publicly. |
| `STEEL_API_KEY` | Server only | Creates, resumes, traces, and closes remote browser sessions. |
| `RESEND_API_KEY` | Server only | Sends an email copy of each saved feedback submission through Resend. |
| `FEEDBACK_FROM_EMAIL` | Server only | Verified sender used for feedback notifications. Defaults to Resend's onboarding sender for testing. |
| `FEEDBACK_TO_EMAIL` | Server only | Feedback notification recipient. Defaults to `padmanathan.kdev@gmail.com`. |

Restart the development server after changing environment variables.

## Supabase setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run [`supabase-schema.sql`](./supabase-schema.sql).
4. Enable **Email** and **Google** in Authentication → Providers.
5. Add local and production URLs in Authentication → URL Configuration.

Suggested redirect URLs:

```text
http://localhost:3000/login
https://deepscapes.vercel.app/login
```

The application creates its private `deepscapes-resources` storage bucket when the first authenticated upload is prepared. Files upload directly from the browser with a short-lived signed upload token; the server never exposes the service-role key.

Feedback is first saved as JSON in the private `deepscapes-feedback` bucket and then emailed through Resend. Email uses the feedback ID as an idempotency key to avoid duplicate copies. A mail-provider failure does not discard the stored submission.

## Authentication and permissions

New accounts receive a personal `username's Scape`. Usernames are derived safely from account metadata or email and receive a short suffix when necessary.

Scape access is enforced by server Route Handlers:

- **Owner:** full control, including collaboration settings and Scape deletion.
- **Editor:** can modify Scape content but cannot change ownership or collaborators.
- **Viewer:** read-only access.

Audit actors are assigned from the authenticated server session, preventing clients from impersonating another collaborator in the activity history.

## Remote browsing

Each Scape can create an interactive Steel browser session. Search terms open in Google, while URLs open directly. DeepScapes stores the Scape's Steel profile identifier and last destination so later sessions can restore cookies and local storage when supported by Steel.

The app periodically imports Steel agent traces, including navigation, clicks, scrolling, page URLs, errors, and session lifecycle events. Typed form values are deliberately redacted before storage so passwords and sensitive input are not written into the Scape activity log.

Use **Save & end** to close a session and allow Steel to persist the browser profile cleanly.

## Rate limits and cost controls

Current per-user or per-IP limits include:

| Operation | Limit |
| --- | --- |
| Steel session starts | 4 per user per hour and 20 per user per day |
| Steel trace requests | 20 per user per minute |
| Steel session closes | 12 per user per hour |
| Upload preparation | 20 per user per hour |
| Upload completion | 40 per user per hour |
| Legacy direct uploads | 12 per user per hour |
| Scape reads | 120 per user per hour |
| Scape writes | 90 per user per hour |
| Scape deletion | 10 per user per hour |
| Login username lookup | 12 per IP per 15 minutes |
| Authentication initialization | 12 per user per hour |
| Template reads | 30 per IP per hour |

Exceeded limits return HTTP `429` with a `Retry-After` header.

The current limiter is an in-memory, per-server-instance safeguard with no additional infrastructure cost. For strict limits shared across every Vercel instance, replace the store in [`lib/rate-limit.ts`](./lib/rate-limit.ts) with a durable Redis/KV-backed limiter.

## Available scripts

```bash
npm run dev       # Start the local development server
npm run build     # Create a production build
npm run start     # Run the production build
npm run lint      # Run ESLint
```

Type-check without producing build output:

```bash
npx tsc --noEmit
```

## Deployment

The production project is deployed on Vercel. Configure all five environment variables for the **Production** environment, then deploy from `main` or run:

```bash
npx vercel --prod
```

Keep `.env.local`, Supabase service-role credentials, and Steel API keys out of Git.
