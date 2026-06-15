# Misfit Island Hub — Setup Guide

## What you have
- `public/index.html` — the app (goes on Netlify)
- `netlify/functions/` — 4 backend functions (talk to Notion)
- `netlify.toml` — Netlify config
- `package.json` — dependencies

---

## Step 1 — Connect Misfit Island Hub integration to each Notion database

In Notion, open each of your three databases and add the integration:
1. Open **Action Items** → click **···** (top right) → **Connections** → search for **Misfit Island Hub** → connect
2. Repeat for **Agenda Items**
3. Repeat for **Decisions**

---

## Step 2 — Configure the database schemas

Once the integration is connected, open this URL in your browser (after deploying to Netlify):

```
https://YOUR-SITE.netlify.app/.netlify/functions/notion-setup
```

This will configure all three databases with the correct fields (Status, Priority, Owner, Section, etc.) in one shot.

---

## Step 3 — Create a GitHub repository

1. Go to github.com and create a **free account** (or log in)
2. Click **New repository** → name it `misfit-island-hub` → **Create repository**
3. Upload all the files from this folder maintaining the folder structure:
   ```
   misfit-island-hub/
   ├── public/
   │   └── index.html
   ├── netlify/
   │   └── functions/
   │       ├── notion-get.js
   │       ├── notion-save.js
   │       ├── notion-delete.js
   │       └── notion-setup.js
   ├── netlify.toml
   └── package.json
   ```

---

## Step 4 — Deploy to Netlify

1. Go to **netlify.com** → sign up with your Moleaer email → **Add new site** → **Import from Git**
2. Connect to GitHub → select **misfit-island-hub** repo
3. Build settings:
   - **Build command:** (leave blank)
   - **Publish directory:** `public`
4. Click **Deploy site**

---

## Step 5 — Add environment variables in Netlify

In Netlify → **Site configuration** → **Environment variables** → **Add a variable** for each:

| Key | Value |
|-----|-------|
| `NOTION_KEY` | *(your Notion API key)* |
| `NOTION_DB_ACTIONS` | *(Actions database ID)* |
| `NOTION_DB_AGENDA` | *(Agenda database ID)* |
| `NOTION_DB_DECISIONS` | *(Decisions database ID)* |
| `NOTION_DB_SETTINGS` | *(Hub Settings database ID)* |
| `TENANT_ID` | *(Azure AD Tenant ID — from Sam)* |
| `CLIENT_ID` | *(Azure AD App Client ID — from Sam)* |
| `CLIENT_SECRET` | *(Azure AD Client Secret — from Sam)* |
| `SENDER_EMAIL` | `andrea@moleaer.com` |
| `ANTHROPIC_API_KEY` | *(from IT/Nick — needed for transcript analysis)* |

> ⚠️ Never put actual secret values in any committed file. All credentials live here in the Netlify UI only.

After adding variables → **Trigger deploy** to redeploy with the new variables.

---

## Step 6 — Run setup

Visit: `https://YOUR-SITE.netlify.app/.netlify/functions/notion-setup`

You should see: `{"success":true,"message":"All three databases configured successfully",...}`

---

## Step 7 — Share with the team

Your app is live at: `https://YOUR-SITE.netlify.app`

Share this link with the team. When they open it they'll be asked to pick their name — after that they're in and can:
- Add agenda items
- Update action item status and priority
- View the run of show
- Log decisions

---

## Troubleshooting

**"Offline" badge in the header** — Netlify functions aren't responding. Check environment variables are set correctly and trigger a redeploy.

**Databases empty after setup** — Run the setup endpoint again: `/netlify/functions/notion-setup`

**Changes not showing for other users** — Data refreshes when switching tabs or changing the meeting date. Pull-to-refresh coming in a future update.

**Need to reset a user's name** — Open browser console and type: `localStorage.removeItem('misfit_user')` then refresh.

---

## Future: Auto-pull Teams transcripts

Once IT enables `OnlineMeetings.Read` permission in your Microsoft 365 tenant, the Transcript tab can pull the recording directly from Teams without any manual download. Remind IT this is needed when the hub is live.
