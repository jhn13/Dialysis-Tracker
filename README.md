# Dialysis Tracker

A web app for home dialysis patients. You can:
- log each session, with the "to take off" sum shown in full
- log blood pressure readings between sessions
- track supplies, which go down each time you log a session
- send your records to your medical team as Excel, CSV or a PDF report

It's a test version (0.1) for personal use. It keeps records only and gives no medical advice.

## How it fits together

| Part | Service | Cost |
|---|---|---|
| Website | Cloudflare Workers (deploys from this repo) | Free |
| Sign-in and sync between devices | Supabase | Free plan |
| Everything else | Runs in the browser, works offline | Free |

The app saves to the device first, so it works with no signal. When you're signed in, it syncs with Supabase in the background.

**Until Supabase is connected,** the app runs on one device only: no sign-in, no sync, no Face ID. That's fine for a first look. Don't rely on it for real records until it syncs, because a browser can clear its saved data.

## Setup

### 1. Put the site online (Cloudflare)
1. In Cloudflare, go to **Workers & Pages → Create application** and import the **dialysis-tracker** repository from GitHub.
2. Keep the defaults:
   - project name `dialysis-tracker`
   - build command left empty
   - deploy command `npx wrangler deploy`
3. Click **Deploy**. You'll get an address like `dialysis-tracker.joshnaylor.workers.dev`.

Every push to `main` updates the site automatically.

### 2. Create the database (Supabase)
Use a **new** Supabase project, so health records are kept apart from anything else.
1. In Supabase, create a new project. Pick the **London** region and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste in all of `supabase/schema.sql` and click **Run**.
3. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up".
4. Go to **Authentication → Users → Add user → Create new user**. Enter your email and a password, and tick **Auto Confirm User**.
5. Go to **Authentication → URL Configuration**:
   - set **Site URL** to the site's address
   - add the same address to **Redirect URLs**
6. Go to **Project Settings → API Keys**. Copy the **Project URL** and the **publishable** key into `public/js/config.js`, then push.

The publishable key is meant to be public. The database rules only let each signed-in person see their own records.

For password reset emails, use the same iCloud SMTP setup as Spotter's Logbook (**Authentication → Emails → SMTP Settings**).

### 3. Add it to your iPhone home screen
1. Open the site in Safari.
2. Tap **Share → Add to Home Screen**. It then opens full screen like an app.
3. Sign in.
4. Turn on **Settings → Unlock with Face ID**. That's set for each device.

### 4. Bring in your spreadsheet history
1. Go to **Settings → Restore from backup** and choose the `dialysis-backup_import.json` file made from your spreadsheet.
2. Import it **after** signing in, so it syncs to your account.
3. Never commit that file to this repo.

## Good to know
- **To take off** = (weight before + washback) − target weight. The UF goal is filled in from it and can be changed.
- **Supplies:** each session uses the items set as "every session". Sessions on your weekly day also use the weekly extras. Ticking "Water filters changed" uses the filter items. A **Count stock** resets the numbers to what you actually have.
- **Free plan pause:** Supabase pauses a free project after a week with no use. If the app says it can't sync, open the Supabase dashboard and click **Restore**.
- **Face ID** is a lock on this device's screen. Your password is still the real sign-in, and "Use password instead" always works when you're online.
- **Backups:** **Settings → Download backup** saves everything as one file at any time.

## Files
- `public/`: the app. It's plain HTML, CSS and JavaScript, with no build step.
- `public/js/model.js`: what's recorded and the sums (take off, stock, weeks left).
- `public/js/sync.js`: sign-in and sync.
- `supabase/schema.sql`: the database.
- `wrangler.jsonc`: Cloudflare settings.
