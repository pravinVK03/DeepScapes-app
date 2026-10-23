# DeepScapes

DeepScapes is an authenticated, project-centric workspace for keeping notes, tasks, documents, media, references, web research, collaborators, and project history together in one **Scape**.

**Live app:** [deepscapes.vercel.app](https://deepscapes.vercel.app)

## Why DeepScapes

Projects often scatter across notes, browser tabs, files, and chat threads. A Scape keeps that working context together: collect material, collaborate with the right people, research in an embedded browser, then return exactly where you left off.

### Product highlights

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
- Vercel Web Analytics for privacy-friendly visitor and page-view reporting.
- Responsive layouts for desktop and mobile.

## Try it

1. Create an account with email/password or Google.
2. Start a blank Scape or choose a template.
3. Add notes, tasks, links, or files; PDFs and presentations can be opened or downloaded.
4. Invite collaborators as viewers or editors.
5. Use the embedded browser for research, then save the session to resume its tabs and context later.

## Architecture at a glance

- **App:** Next.js App Router, React, TypeScript, and Tailwind CSS.
- **Identity and data:** Supabase Auth, PostgreSQL, and private Storage buckets.
- **Browsing:** Steel Sessions API, with server-side authorization, rate limits, checkpoints, and redacted activity traces.
- **Operations:** Vercel hosting, Web Analytics, structured feedback storage, and optional Gmail delivery to the project owner.

## Technology

- [Next.js 16](https://nextjs.org/) with the App Router and Route Handlers
- React 19 and TypeScript
- Tailwind CSS 4
- Supabase Auth, PostgreSQL, and Storage
- Steel Sessions API for embedded remote browsing
- Vercel for production hosting and Web Analytics

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
FEEDBACK_TO_EMAIL=your-feedback-inbox@gmail.com
GMAIL_CLIENT_ID=your-google-oauth-client-id
GMAIL_CLIENT_SECRET=your-google-oauth-client-secret
GMAIL_TOKEN_ENCRYPTION_KEY=a-random-secret-with-at-least-32-characters
```

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser | Supabase project URL used by the browser client. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser | Supabase publishable key used for authentication and signed uploads. |
| `SUPABASE_URL` | Server | Supabase project URL used by Route Handlers. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Database and storage access through the backend. Never expose this value publicly. |
| `STEEL_API_KEY` | Server only | Creates, resumes, traces, and closes remote browser sessions. |
| `STEEL_SESSION_TIMEOUT_MS` | Server only | Requested Steel hard session lifetime. Defaults to 15 minutes; Steel caps it to the account plan. |
| `FEEDBACK_TO_EMAIL` | Server only | Gmail address that receives each feedback submission. Set this explicitly in every deployed environment. |
| `GMAIL_CLIENT_ID` | Server only | Google OAuth web-client ID for the owner-controlled Gmail inbox. |
| `GMAIL_CLIENT_SECRET` | Server only | Google OAuth web-client secret. Never expose it to the browser. |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | Server only | Random secret (32+ characters) used to encrypt the Gmail refresh token before it is stored privately in Supabase. |

Restart the development server after changing environment variables. Keep all server-only values out of Git and never use `NEXT_PUBLIC_` for secrets.

## Supabase setup

1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Run [`supabase-schema.sql`](./supabase-schema.sql). Existing projects should run it again after upgrades; its `if not exists` statements safely add performance indexes without changing existing Scapes.
4. Enable **Email** and **Google** in Authentication → Providers.
5. Add local and production URLs in Authentication → URL Configuration.

Suggested redirect URLs:

```text
http://localhost:3000/login
https://deepscapes.vercel.app/login
```

### Required: passwordless sign-up code email

DeepScapes uses a code-first sign-up flow: **email → code → optional profile**. The app intentionally does not disclose whether an address is already registered until the recipient proves they own that inbox. Configure this once in the Supabase dashboard:

1. Go to **Authentication → Providers → Email** and enable the Email provider. Keep **Confirm email** enabled for any legacy email/password accounts.
2. Go to **Authentication → Email Templates → Magic Link** (named **Magic Link / OTP** in some dashboard versions). This is the template used by the current DeepScapes code flow — not the default Confirm signup template.
3. Set the subject to:

```text
Your DeepScapes verification code
```

4. Replace the entire template body with the following HTML, then save it. It deliberately uses `{{ .Token }}` and does **not** contain `{{ .ConfirmationURL }}`: users receive a code to enter in DeepScapes, not an automatic sign-in link.

```html
<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f7fb;color:#172554;font-family:Arial,Helvetica,sans-serif;">
    <main style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #dbeafe;border-radius:20px;padding:36px;">
      <p style="margin:0 0 20px;font-size:12px;font-weight:700;letter-spacing:2px;color:#1d4ed8;">DEEPSCAPES</p>
      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">Your DeepScapes verification code</h1>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Welcome to DeepScapes — a project-centric workspace for your notes, tasks, files, research, and collaborators.</p>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Enter this verification code in DeepScapes to continue securely. If this is your first visit, you can finish your profile or skip it for later.</p>
      <p style="margin:0 0 22px;padding:16px;border-radius:12px;background:#eff6ff;font-size:28px;font-weight:700;letter-spacing:8px;text-align:center;color:#172554;">{{ .Token }}</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">If you did not start this sign-up, you can safely ignore this email. Need help? Contact padmanathank.dev@gmail.com.</p>
    </main>
  </body>
</html>
```

5. In **Authentication → URL Configuration**, set the Site URL to `https://deepscapes.vercel.app` and keep the login URL above in the redirect allow list.
6. Create a fresh test account. The app should show **Enter your verification code**, and the email should contain the code. After confirmation, new users can complete their profile or skip it; existing users continue directly to their Scapes.

Google sign-in does not need this extra code: Google already confirms ownership of the selected Google account during OAuth.

The application creates its private `deepscapes-resources` storage bucket when the first authenticated upload is prepared. Files upload directly from the browser with a short-lived signed upload token; the server never exposes the service-role key.

Feedback is first saved as JSON in the private `deepscapes-feedback` bucket and then copied to the configured Gmail inbox. A mail-provider failure never discards the stored submission.

### Gmail feedback inbox (no custom domain required)

Use a personal or organization Gmail account and do not use Resend. In Google Cloud Console, create a project, enable the Gmail API, configure the OAuth consent screen, and create a **Web application** OAuth client. Add this exact authorized redirect URI:

```text
https://deepscapes.vercel.app/api/feedback/gmail/callback
```

Add the three Gmail variables plus `FEEDBACK_TO_EMAIL` to Vercel **Production**, redeploy, then sign in to that recipient Gmail account. Open the profile menu and select **Connect feedback inbox** to approve the `gmail.send` permission (plus basic identity verification that ensures only the configured inbox can be connected). The encrypted refresh token is held in the private `deepscapes-private-config` bucket, and every saved feedback item is then delivered to that same Gmail inbox. If the OAuth consent screen remains in Testing, add this Gmail account as a test user.

## Authentication and permissions

New accounts receive a personal `username's Scape`. Usernames are derived safely from account metadata or email and receive a short suffix when necessary.

Scape access is enforced by server Route Handlers:

- **Owner:** full control, including collaboration settings and Scape deletion.
- **Editor:** can modify Scape content but cannot change ownership or collaborators.
- **Viewer:** read-only access.

Audit actors are assigned from the authenticated server session, preventing clients from impersonating another collaborator in the activity history. Viewer accounts cannot change content, collaboration settings, or start and manage remote browser sessions.

## Remote browsing

Each Scape can create a named, interactive Steel browser session. Search terms open in Google, while URLs navigate the current remote browser without replacing it. The embedded viewer itself expands to full screen, so fullscreen browsing does not create a second viewer or local browser tab.

DeepScapes keeps the Steel profile identifier and periodically checkpoints every open tab, title, URL, scroll position, and non-sensitive form state. Password, payment, token, and one-time-code fields are excluded. **Save & end** captures the latest checkpoint, releases the paid Steel session, and clears the browser UI. Selecting an ended session asks whether to continue its history or create a named copy; either path reconstructs the saved tab set while the Steel profile restores cookies and browser storage.

The app also imports Steel agent traces, including navigation, clicks, scrolling, page URLs, errors, and session lifecycle events. Typed values remain redacted in the activity timeline. A short disconnect reloads the same viewer; a terminated session can be rebuilt from its latest checkpoint. Steel still applies the account's hard lifetime (currently 15 minutes on Launch, one hour on Scale, and up to 24 hours on Enterprise), so DeepScapes checkpoints and rolls an actively viewed session before that limit when Steel returns an expiry timestamp.

## Rate limits and cost controls

Current per-user or per-IP limits include:

| Operation | Limit |
| --- | --- |
| Steel session starts | 6 per user per hour and 20 per user per day |
| Steel navigation and checkpoints | 40 per user per hour |
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

## Quality checks

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

Before a release, run the type check, `npm run lint`, `npm run build`, and `npm audit --omit=dev`. The build is the final compatibility check for the Next.js production runtime.

## Deployment

The production project is deployed on Vercel. Configure the environment variables required by the capabilities you enable (Supabase is required; Steel and Gmail are optional), then deploy from `main` or run:

```bash
npx vercel --prod
```

Keep `.env.local`, Supabase service-role credentials, Steel API keys, Gmail OAuth secrets, and encryption keys out of Git.

## Operational notes

- The in-memory rate limiter is a cost guard, not a distributed limiter. Use Redis or Vercel KV before operating at multi-instance scale.
- Signed resource URLs are currently issued for long-lived access. Rotate or shorten them before introducing stricter revocation requirements.
- Web Analytics is enabled globally through `@vercel/analytics`; use the Vercel Analytics dashboard to monitor visitor and page-view trends.
