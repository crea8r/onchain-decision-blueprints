# Interactive Demo (Netlify)

This folder is a **static site** (no build step) suitable for Netlify.

## How it works
- Uses Phantom (or any injected `window.solana`) to sign transactions.
- Uses `@solana/web3.js` via ESM CDN.
- Talks to a **devnet deployed** program id.

## Deploy to Netlify
Option A (quick):
- Netlify → Add new site → Deploy manually → drag-drop this `demo-web/` folder

Option B (GitHub):
- Netlify → Add new site → Import from Git
- Publish directory: `demo-web`
- Build command: *(leave empty)*

## Notes
The Rust program must be deployed to devnet first. Paste its program id into the UI.
