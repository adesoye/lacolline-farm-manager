# Hosting the Lacoline Pig Farm Manager

The app is a single static HTML file — no server, no database, no build step needed.
All data is saved in the visitor's browser (localStorage).

---

## Option 1 — Netlify Drop (Easiest, free, no account needed)

1. Open your browser and go to: **https://app.netlify.com/drop**
2. Open File Explorer and navigate to this folder (the `Lacoline` folder on your Desktop)
3. Drag the entire `Lacoline` folder and drop it onto the Netlify Drop page
4. Netlify gives you a live URL instantly — e.g. `https://random-name-123.netlify.app`
5. Optional: click "Claim site" to keep it permanently with a free Netlify account

**Your app is now live.** Share the URL with anyone.

---

## Option 2 — Netlify (with account, custom domain support)

1. Go to **https://app.netlify.com** and create a free account
2. Click **"Add new site" → "Deploy manually"**
3. Drag the `Lacoline` folder into the upload area
4. Done — Netlify deploys it and gives you a URL
5. To use a custom domain (e.g. `farm.lacoline.com`): go to Site Settings → Domain Management → Add custom domain

---

## Option 3 — GitHub Pages (free, good for version control)

### Step A — Create a GitHub account
1. Go to **https://github.com** and sign up (free)

### Step B — Create a repository
1. Click the **+** button → "New repository"
2. Name it: `lacoline-farm` (or any name you like)
3. Set it to **Public** (required for free GitHub Pages)
4. Click **"Create repository"**

### Step C — Upload your files
1. On the new repo page, click **"uploading an existing file"**
2. Drag all files from the `Lacoline` folder into the upload area:
   - `index.html`
   - `netlify.toml` (optional here)
   - `vercel.json` (optional here)
   - `.gitignore`
3. Click **"Commit changes"**

### Step D — Enable GitHub Pages
1. Go to the repo → **Settings** → **Pages** (left sidebar)
2. Under "Source", select **"Deploy from a branch"**
3. Choose branch: **main**, folder: **/ (root)**
4. Click **Save**
5. Wait ~60 seconds, then your site is live at:
   `https://YOUR-USERNAME.github.io/lacoline-farm/`

---

## Option 4 — Vercel (free, fastest CDN)

1. Go to **https://vercel.com** and sign up with your GitHub account
2. Click **"Add New → Project"**
3. Import your GitHub repository (`lacoline-farm`)
4. Vercel auto-detects it as a static site — click **Deploy**
5. Your app is live at `https://lacoline-farm.vercel.app`

---

## Important notes about data

- Each person who visits the app has their **own private data** stored in their own browser
- Data does NOT sync between devices automatically
- Use the **"Backup JSON"** button in the Reports section to download your data
- Use **"Restore JSON"** to reload data on a new device or after clearing the browser
- For shared/multi-device access in the future, a backend database would be needed

---

## Files in this folder

| File | Purpose |
|---|---|
| `index.html` | The app (this is the main file served to visitors) |
| `pig-farm-manager.html` | Your local working copy (same content) |
| `netlify.toml` | Netlify hosting configuration |
| `vercel.json` | Vercel hosting configuration |
| `.gitignore` | Tells Git which files to ignore |
| `DEPLOY.md` | This guide |
