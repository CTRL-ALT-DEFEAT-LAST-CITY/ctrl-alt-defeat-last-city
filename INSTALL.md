# Installing this update

Written for someone who has not done this before. If you have, the short
version is: extract the ZIP over your repository, commit, push.

**Nothing in here deletes anything.** Every file in the ZIP either replaces a
file of the same name or is new.

---

## Before you start

Make a backup. It takes ten seconds and means any mistake is undoable.

* On github.com, open your repository → **Code** ▾ → **Download ZIP**.
* Save it somewhere safe.

---

## What is in the ZIP

```
LAST_CITY_COMPLETE_UPDATE.zip
├── index.html            ← replaces yours
├── README.md             ← new
├── CHANGES.md            ← new
├── INSTALL.md            ← new (this file)
├── TEST_RESULTS.md       ← new
├── src/                  ← 8 files replaced, 9 added
├── assets/               ← WebP artwork (new)
├── supabase/             ← unchanged, included so the folder is complete
└── tests/                ← new
```

**Not in the ZIP, on purpose:**

* `assets/**/*.png` — the game now loads the WebP versions instead. Your PNG
  originals stay in your repository as editable source art. Leave them alone.
* `v2/`, `v3/`, `v3.2/` — your archived older builds. This update does not
  touch them. Leave them alone.

Because uploading files never deletes other files, both are simply left as
they are.

---

## Option A — GitHub Desktop (recommended)

1. **Extract the ZIP.** Double-click it. You get a folder whose contents are
   `index.html`, `src`, `assets`, and so on.
2. **Open your repository folder** on your computer — the one with your
   existing `index.html` in it. If you do not have it locally yet, open GitHub
   Desktop → **File → Clone repository** and pick it.
3. **Copy the extracted contents into it.** Select everything *inside* the
   extracted folder and drop it into your repository folder. Choose **Replace**
   when asked.
   > Copy the *contents*, not the folder itself. You want `index.html` sitting
   > next to your existing `v3` folder, not inside another folder.
4. **Check it worked.** Double-click `index.html`. The game should open with
   the start screen. Press **PLAY AS GUEST** and the opening cinematic plays.
5. **Commit.** GitHub Desktop now lists the changed files. Type a summary such
   as `Add city builder, defense, research and cinematic intro`, then click
   **Commit to main**.
6. **Push.** Click **Push origin**.
7. **Wait a minute**, then open your live URL:
   <https://ctrl-alt-defeat-last-city.github.io/ctrl-alt-defeat-last-city/>

---

## Option B — the github.com website

Works without installing anything, but you upload folder by folder.

1. Extract the ZIP.
2. Open your repository on github.com.
3. Click **Add file ▾ → Upload files**.
4. Drag in the loose files first: `index.html`, `README.md`, `CHANGES.md`,
   `INSTALL.md`, `TEST_RESULTS.md`.
5. Scroll down, type a short message, click **Commit changes**.
6. Repeat **Upload files** for each folder: drag the whole `src` folder in,
   commit; then `assets`, commit; then `tests`, commit.
   > GitHub keeps the folder structure when you drag a folder in, so
   > `src/game/citybuilder.js` lands in the right place.
7. Wait a minute and open your live URL.

---

## Checking it worked

On the live site:

1. The start screen loads with its artwork.
2. **PLAY AS GUEST** starts the opening cinematic. **Skip intro** ends it.
3. The navigation shows **City**, **Defense** and **Research** alongside the
   original tabs.
4. Open **City**. You see an isometric map with a build tray beside it.
5. Buy a Scavenger Camp in **Upgrades → Buildings**, then drag it from the City
   tray onto a lit plot. It goes up with a construction animation.
6. Your existing save still shows your Salvage, buildings, rebirths, pets and
   glyphs.

If all six are true, the update is live.

---

## If something looks wrong

### The page is unstyled, or tabs do nothing
A file did not upload. Open the live site, press **F12**, open the **Console**
tab and reload. A red `404` line names the missing file — upload that one file
again.

### The City tab says "City is unavailable"
`src/game/citybuilder.js` did not upload. Upload it again.

### Artwork is missing
The `assets` folder did not upload, or only partly. It must contain
`assets/zones/*.webp` and `assets/pets/*.webp`.

### Changes do not show up
Your browser cached the old files. Hard-reload: **Ctrl+Shift+R**
(**Cmd+Shift+R** on a Mac). GitHub Pages can also take a minute or two to
rebuild — check the **Actions** tab for a green tick.

### My save disappeared
Saves are stored per browser *and* per address. A guest save made on
`localhost` is not visible on the live site, and vice versa — that is normal
and is how it behaved before. If a save on the same address has gone, it was
not this update's doing: nothing here clears `localStorage`.

---

## Rolling back

If you want to undo everything:

* **GitHub Desktop** — **History**, right-click the commit, **Revert changes**,
  then push.
* **github.com** — open the commit, click **⋯ → Revert**, then confirm.

Or extract your backup ZIP over the folder and commit that.

---

## Running the tests (optional)

You do not need to. They are included so you can verify the project yourself.

```bash
cd your-repository-folder
node tests/run.js --no-browser
```

That needs only Node.js and checks syntax, asset paths, the HTML/JavaScript
contract and the save migration. For the full suite, which drives the real game
in a headless browser:

```bash
npm install --no-save playwright
node tests/run.js
```
