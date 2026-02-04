# Interactive Demo (Netlify)

This folder is a **static site** (no build step) suitable for Netlify.

## How it works
This is an **interactive explainer** (not a live devnet demo):
- teaches Blueprint → Mission → Checkpoints
- provides a happy-path walkthrough
- lets viewers toggle common hiccups (conflicting attestations, terms drift, timeouts)

## Deploy to Netlify
Option A (quick):
- Netlify → Add new site → Deploy manually → drag-drop this `demo-web/` folder

Option B (GitHub):
- Netlify → Add new site → Import from Git
- Publish directory: `demo-web`
- Build command: *(leave empty)*

## Notes
The Rust program must be deployed to devnet first. Paste its program id into the UI.
