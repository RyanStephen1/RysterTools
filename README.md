# Operations Desk

This repository contains the Operations Desk homepage and the complete ADK Finance application.

| Path | Purpose |
| --- | --- |
| apps/home | Static homepage. Deploy this folder as the root of your domain. |
| apps/finance | ADK Finance. Deploy as a separate Vite app, for example at a finance subdomain. |

## Run locally

Open apps/home/index.html in a browser. For finance, run these commands from apps/finance.

    npm ci
    Copy-Item .env.example .env.local
    npm run dev

Set the project URL and public anon key in .env.local before signing in. Use the existing Supabase project to keep access to your existing finance records. For a fresh database, follow the setup guides in apps/finance. The finance production build command is npm run build and its output is dist.

After deploying finance, replace the GitHub URL on its homepage card with the deployed app URL. Document Control, Procurement & Materials, and CV Tracking are reserved homepage entries and need their own implementations or live app URLs.

## Shared Supabase

One Supabase project can back the finance app and the future modules. Keep the existing finance tables in place and give new modules distinct schemas or table prefixes. Apply row-level security and module-specific membership policies before allowing browser access. Use private Storage buckets with object policies for CVs and controlled documents. Keep service credentials in server-side secrets.

A common Supabase project provides a common identity store. Separate frontend origins need their own session handling, and auth redirect URLs must include each deployed app origin where applicable.

## Push to a new GitHub repository

Create an empty GitHub repository and use the commands GitHub shows for pushing an existing repository. Start from this folder. Commit the source and example environment files. Actual environment files and generated dependencies are excluded by the root ignore file.
