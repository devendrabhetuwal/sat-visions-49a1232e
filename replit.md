# SatVision AI

AI-powered geospatial intelligence platform. Upload GeoTIFF satellite imagery, compute vegetation and water indices in the browser, and explore the results with an AI assistant.

## Stack

- **Framework**: React 19 + TanStack Start (SSR) + TanStack Router (file-based routing)
- **Build**: Vite via `@lovable.dev/vite-tanstack-config` (handles plugins, tailwind, tsconfig paths, etc.)
- **Styling**: Tailwind CSS v4 + Radix UI components (shadcn/ui pattern)
- **Data / Auth**: Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — in `.env`)
- **Maps**: Leaflet + react-leaflet
- **Charts**: Recharts

## Running on Replit

The Lovable vite config hard-codes port 8080 with IPv6 (`::`) which Replit doesn't support. Two workarounds are in place:

1. `vite.config.ts` overrides `server.host` to `0.0.0.0` (IPv4).
2. `proxy.mjs` — a tiny TCP proxy that forwards Replit's required port 5000 → 8080.

**Run command**: `node proxy.mjs & npm run dev`  
**Workflow**: "Start application" (webview, port 5000)

## Routes

| File | URL |
|---|---|
| `src/routes/index.tsx` | `/` — landing page |
| `src/routes/auth.tsx` | `/auth` — sign in / sign up |
| `src/routes/_authenticated/` | dashboard & protected pages |
| `src/routes/docs.tsx` | `/docs` |
| `src/routes/pricing.tsx` | `/pricing` |
| `src/routes/contact.tsx` | `/contact` |
| `src/routes/about.tsx` | `/about` |
| `src/routes/share.timeseries.$id.tsx` | `/share/timeseries/:id` — public share link |

## Vercel Deployment

This app uses the **nitro `vercel` preset** (`vite.config.ts`). `npm run build` writes to `.vercel/output` (Vercel Build Output API v3) — Vercel picks this up automatically with no framework preset selected.

### Steps to deploy on Vercel

1. **Import the GitHub repo** into Vercel.
2. In the Vercel project settings → **Framework Preset**: select **Other**.
3. **Build command**: `npm run build` (already in `vercel.json`)
4. **Environment variables** — add all four in Vercel → Settings → Environment Variables:
   | Key | Value |
   |-----|-------|
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | your Supabase anon/publishable key |
   | `SUPABASE_URL` | same as above (used server-side) |
   | `SUPABASE_PUBLISHABLE_KEY` | same as above (used server-side) |
5. **Supabase dashboard** → Auth → URL Configuration:
   - Add `https://<your-vercel-domain>/auth` to **Redirect URLs**
   - Add `https://<your-vercel-domain>` to **Site URL**
6. Deploy — Vercel handles the rest.

> The `.env` file in this repo has the Supabase anon key for local dev. Copy those values to Vercel env vars.

## User preferences

- Keep the existing project structure and stack — do not restructure or migrate.
