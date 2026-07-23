# Contributed Levels

Levels designed in the in-game editor land here.

Workflow:

1. Open the level editor in the deployed game and design a level.
2. Hit **↓ Download** — you get a `.json` file.
3. Drop the file into this folder (`src/levels/contributed/`).
4. Commit and push — the site redeploys automatically and the level shows up
   in the main menu for everyone.

No code changes needed; every `.json` in this folder is auto-discovered at
build time.
