# VIA SKY private analytics

The website sends consented, allowlisted events to its own Vercel API. Supabase stores production data; the password-protected dashboard is at `/admin/analytics`. Google Analytics is not used.

## Local preview

Use Node 22.13 or newer and run `npm run dev`. Open `http://127.0.0.1:8766/admin/analytics`, choose a password, and create the local dashboard. Visit the local homepage and accept analytics to generate test traffic. Local data and credentials stay in ignored `.data/` files and are separate from production.

## Connect production

1. Open the Supabase project dashboard for project `jopzslwwmzwwphtnknsn`. In SQL Editor, run `supabase/analytics.sql`, then `supabase/retention.sql`. These create private tables, reporting functions and a daily retention job. Do not enable public table access.
2. Obtain a Supabase server secret key from the project's API settings. A legacy `service_role` key also works. Keep it private; never use a publishable/anon key for this backend.
3. In your own interactive terminal, run `npm run analytics:credentials`. Choose and confirm a production dashboard password. Copy the generated hash and session secret privately into Vercel; do not paste them into chat or commit them.
4. In Vercel > Project > Settings > Environment Variables, set these values for Production:

   - `SUPABASE_URL`: `https://jopzslwwmzwwphtnknsn.supabase.co`
   - `SUPABASE_SECRET_KEY`: the server secret key
   - `ANALYTICS_ADMIN_PASSWORD_HASH`: the generated hash
   - `ANALYTICS_SESSION_SECRET`: the generated session secret
   - `ANALYTICS_ALLOWED_ORIGINS`: `https://viaskynigeria.com,https://www.viaskynigeria.com`

5. Redeploy on Vercel. The repository config builds public files into `dist/` and serves the API separately. Open `https://viaskynigeria.com/admin/analytics` and sign in with the production password.
6. Accept analytics on the live homepage, open the trip planner, and check the dashboard. Declining analytics must send no events. Production setup is disabled until the private environment variables are present.

Pushing code alone does not connect Supabase. Local passwords and test traffic are never deployed. Preview domains do not collect analytics.

## What reports mean

Reports include visitors (random browser IDs), visits (30-minute sessions), page views, service and destination interactions, planner progress, WhatsApp handoffs, source categories, device categories and approximate countries. Dates use Africa/Lagos. A WhatsApp handoff means a link was opened; it does not confirm a sent message, booking or revenue. Journey stages count sessions independently, and Umrah skips destination selection.

Names, emails, phone numbers, trip notes, travel dates, WhatsApp message contents, full referring URLs and raw IP addresses are excluded from event storage. The server uses a temporary keyed IP hash for rate limiting. Consent expires after 180 days; footer preferences allow withdrawal. Stored events are deleted after 90 days by the retention job and reporting cleanup. Reports reflect only consented traffic and start after activation.

Source categories accept known platforms such as `?utm_source=instagram`; arbitrary campaign strings and query parameters are not stored. Event names are `page_view`, `planner_open`, `service_select`, `destination_select`, `planner_step_view`, `planner_step_complete`, `whatsapp_handoff` and `whatsapp_click`.

## Validation

Run `npm test` and `npm run build`. Tests cover consent, data sanitization, authentication, rate limits, duplicate events, reporting date boundaries and Supabase request handling. SQL migrations and production integration must also be verified in the actual Supabase project after configuration.
