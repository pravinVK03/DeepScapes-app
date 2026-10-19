# DeepScapes-app

DeepScapes is a project-centric workspace for keeping notes, tasks, files, media, references, and activity history in one Scape.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase PostgreSQL setup

1. Create a Supabase project.
2. In its SQL Editor, run [`supabase-schema.sql`](./supabase-schema.sql).
3. Copy `.env.example` to `.env.local` and set the four values from Supabase Project Settings → API.
4. Restart the development server.

## Authentication

Enable **Email** and **Google** under Supabase Authentication → Providers. Add your local and deployed URLs to Authentication → URL Configuration as redirect URLs, for example `http://localhost:3000/login`.

Email sign-up asks for a username, email, and password. Google accounts receive a safe username from their email address, adding a short suffix if it is already taken. Each new account receives a personal `username's Scape` automatically.

The app sends data through its Next.js API routes. `SUPABASE_SERVICE_ROLE_KEY` stays server-only and must never be prefixed with `NEXT_PUBLIC_` or committed to Git.

Without those variables, the prototype remains usable in local browser storage but does not sync data remotely.
