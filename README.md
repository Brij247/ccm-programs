# CCM Anniversary Program Tracker

A shared web page where leaders and members can add participants to each program,
set how many people a program needs, and download everything as an Excel file.

- **Programs view:** one card per program with leaders, a progress bar and participant names.
- **By person view:** every person and the programs they lead or take part in.
- **Download Excel:** an `.xlsx` file with three sheets: Programs, Participants and By person.
- **Your name box:** shows who made the last change on each program.

Everything is free: GitHub Pages hosts the page and Firebase Firestore (free Spark plan) stores the data.
Without Firebase the page still works, but changes stay in your own browser only.

## 1. Create the free database (Firebase)

1. Go to https://console.firebase.google.com and click **Create a project**. Google Analytics is not needed.
2. In the project, open **Build > Firestore Database > Create database**.
   Pick a location near you (for India: `asia-south1`) and start in **production mode**.
3. Open the **Rules** tab, replace everything with the contents of `firestore.rules` from this folder, and click **Publish**.
4. Go to **Project settings** (gear icon) > **Your apps** > click the **</>** (Web) icon.
   Give it any nickname, skip Firebase Hosting, and click **Register app**.
5. Copy the `firebaseConfig` object it shows and paste it into `firebase-config.js`, replacing `null`:

   ```js
   export const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "...",
     appId: "...",
   };
   ```

   This config is not a password. It is safe to put on a public GitHub repo.

The first time the page opens, it loads the 17 programs automatically.

## 2. Publish on GitHub Pages (free)

1. Create a new **public** repository on https://github.com/new, for example `ccm-programs`.
   Do not add a README there.
2. From this folder run:

   ```bash
   git remote add origin https://github.com/<your-username>/ccm-programs.git
   git push -u origin main
   ```

3. On GitHub open the repo **Settings > Pages**. Under **Build and deployment**, choose
   **Deploy from a branch**, branch `main`, folder `/ (root)`, and click **Save**.
4. After about a minute the site is live at `https://<your-username>.github.io/ccm-programs/`.
   Share that link in the group.

To change anything later, edit the files, then `git add . && git commit -m "update" && git push`.

## Try it on your computer

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly by double-clicking will not work.

## Good to know

- Anyone with the link can edit, which suits a church group. Removing a name shows an **Undo** button for a few seconds.
- If two people add names at the same moment, both names are kept.
- Excel download needs an internet connection, to load the spreadsheet library.
- The free Firebase plan allows 50,000 reads and 20,000 writes per day, far more than this needs.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The page |
| `store.js` | Saves data to Firebase, or to the browser in local mode |
| `seed.js` | The starting list of 17 programs and leaders |
| `firebase-config.js` | Your Firebase settings |
| `firestore.rules` | Database rules to paste into Firebase |
