# TismTracker (Web) — Setup Guide

## What's new in this update
- **Messages actually get noticed**: Babylon now gets an in-app popup (and OS notification, if enabled) the moment Stink sends encouragement, plus a little red dot on the Carer tab until it's read. Previously it only showed up if you happened to open that tab.
- **Undo**: every task now has an undo button — on the row itself, and inside the task detail sheet — so a wrong tap is never permanent.
- **Progress bar moves per step**: for multi-step tasks (like Shower), the percentage now ticks up as each individual step is checked off, not just when the whole task is done.
- **Stink can see today's tasks** on their dashboard, and gets a popup/notification each time Babylon completes one.
- **Low energy mode** now has a clear "Turn off low energy mode" button, and tapping "I'm overwhelmed" starts the day directly in essentials mode instead of doing nothing until Start Day is also tapped.
- **Reset today** now fully clears the day on both phones (with a confirmation first) and Stink's phone shows a friendly "Waiting for Babylon to wake up ☀️" screen until the day is started again.
- **Nicer, friendlier feel**: soft entrance animations, a little "pop" when a task is completed, gradient buttons with press feedback, and varied celebration messages instead of the same line every time.

If you already have the app installed, re-upload these files to the same GitHub repo — both phones will pick up the change automatically next time they load (the service worker cache version was bumped so this happens promptly rather than serving a stale cached copy).

---


This version is a Progressive Web App: no Xcode, no Mac, no Apple
Developer account, no computer at all — everything below can be done
from Safari on your iPhone. It installs to the home screen and looks
and behaves like a real app.

Two things to set up, both one-time, both free:
1. **Firebase** — the free database that syncs data between your phone
   and your girlfriend's phone
2. **Hosting** — a free web address to load the app from (needed for
   "Add to Home Screen" to work properly and for notifications to work)

## Part 1 — Create your free Firebase project (~5 min)

1. On your iPhone, go to **console.firebase.google.com** in Safari and
   sign in with any Google account (make a free one if you don't have
   one).
2. Tap **Add project**, name it anything (e.g. "tismtracker"), skip
   Google Analytics (not needed), create it.
3. On the project's overview page, tap the **`</>`** (web) icon to
   register a web app. Name it anything, skip Firebase Hosting here
   (you'll host it separately in Part 2), click Register.
4. You'll see a code block that looks like this:
   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   Copy just the `{ ... }` object part — you'll paste this into the app
   later. Keep this tab open or save it in Notes for now.
5. In the left sidebar (categories may be grouped differently depending
   on which console version you see — look under **Security**), find
   **Authentication → Get started**. Under "Sign-in method," enable
   **Email/Password**. Leave Anonymous off (or disable it if it's on)
   — email/password is what restricts access to just the two of you.
6. Go to the **Users** tab (still inside Authentication) → **Add user**.
   Create one account for your phone, e.g. email `babylon@tismtracker.app`
   with a password you choose (doesn't need to be a real inbox — Firebase
   just needs an email-shaped string). Click **Add user**.
7. Add a second user the same way for the other phone, e.g.
   `stink@tismtracker.app` with its own password.
8. For each user, click on it in the list and copy its **User UID** (a
   long string) — save both somewhere, you need them for the rules
   below.
9. Go to **Databases and storage → Firestore Database → Create
   database**. Choose any region close to you, start in **production
   mode**.
10. Once created, go to the **Rules** tab and replace the default rules
    with (swap in your two real UIDs from step 8):
    ```
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /{document=**} {
          allow read, write: if request.auth != null &&
            request.auth.uid in ['PASTE_UID_1_HERE', 'PASTE_UID_2_HERE'];
        }
      }
    }
    ```
    Click **Publish**. Now only someone signed in with one of those two
    exact accounts can read or write your data — not just anyone who
    finds the app's URL.

That's the entire backend. No servers, no code to write.

## Part 2 — Host the files somewhere with a free HTTPS address (~5 min)

iOS requires HTTPS for "Add to Home Screen" to behave like a real app
(offline support, standalone window). The easiest free option that
works entirely from a phone browser is **GitHub Pages**:

1. Go to **github.com** in Safari, make a free account if needed.
2. Tap **+ → New repository**. Name it `tismtracker`, make it Public,
   create it.
3. On the repo page, tap **Add file → Upload files**. Use the Files
   app share sheet (or "Choose Files") to select every file from the
   `TismTrackerWeb` folder in this download — `index.html`,
   `styles.css`, `app.js`, `manifest.json`, `sw.js`, and the `icons`
   folder (upload the icons folder's two PNGs too, keeping the
   `icons/` path — GitHub's uploader preserves folder structure if you
   drag/select the whole folder; if it flattens them, create the
   `icons` folder manually first by naming a file `icons/icon-192.png`
   when uploading).
4. Commit the upload.
5. Go to the repo's **Settings → Pages**. Under "Build and deployment,"
   set Source to **Deploy from a branch**, branch `main`, folder `/
   (root)`. Save.
6. After a minute or two, the same page shows your live URL, something
   like `https://yourname.github.io/tismtracker/`.

## Part 3 — Install on both phones

1. On your iPhone, open your GitHub Pages URL in **Safari** (must be
   Safari, not Chrome, for install-to-home-screen to work fully on
   iOS).
2. The first time it loads, you'll see a "One-time setup" screen —
   paste in the `firebaseConfig` object you copied in Part 1, tap
   **Save & continue**.
3. You'll land on a **Sign in** screen — enter the email and password
   for *this* phone's account (the one you created in step 6 or 7
   above, e.g. `babylon@tismtracker.app`).
4. Tap the **Share** button → **Add to Home Screen** → Add. You now
   have a TismTracker icon.
5. Open it from the home screen icon (not Safari) — pick **Babylon**.
6. Repeat steps 1–5 on your girlfriend's iPhone: same `firebaseConfig`
   (this is what makes them share data), but sign in with the *other*
   account (e.g. `stink@tismtracker.app`), and pick **Stink** instead
   of Babylon.

Each phone stays signed in after that — no need to log in again unless
you clear Safari's site data.

Both phones now read and write the same Firestore database — task
completion, mood, bad-day-mode, and streaks flow from Babylon's phone;
encouragement messages flow from Stink's phone; everything updates
live on both.

## What's different from the native spec

- **Sleep** is manual entry (bedtime/wake time you type in) instead of
  reading Apple Health — there's no way for a website to access
  HealthKit data.
- **No home screen widget** — only the app icon itself. iOS doesn't
  allow web apps to add widgets.
- **Notifications** work while the app is open or recently used, using
  the browser's Notification API — tap "Enable notifications" in
  Settings on first use. They're less reliable than a native app's
  notifications when the app has been closed for a long time; iOS
  supports real push for installed web apps (since 16.4) but it needs
  a small push-sending server to be fully reliable when the app is
  fully closed. If you find reminders aren't firing when you need
  them, let me know and I can add proper Web Push (needs one more
  small free service, not a big lift).
- Everything else — profiles, routine checklist with subtasks,
  confetti-style completion, missed-task styling, end-day flow, mood
  tracking, bad day mode, carer dashboard, encouragement messages, and
  live sync between the two phones — works the same as the spec.

## Editing the routine

Open the app as Babylon → Settings → edit the JSON schedule box → Save
schedule. It syncs to the other phone automatically. Same format as
before:

```json
{
  "id": "shower",
  "time": "09:15",
  "title": "Shower",
  "icon": "🚿",
  "subtasks": ["Get towel", "Turn shower on", "Shower", "Dry off", "Get dressed"]
}
```

## If something needs updating later

Any time you want to change the app itself (not just the routine),
edit the files and re-upload them to the same GitHub repo (Add file →
Upload files → same filenames, GitHub will offer to replace them).
Both phones pick up the change next time they load the page — no
rebuild, no App Store review, no waiting.
