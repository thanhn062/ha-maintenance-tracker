# AGENTS

## Project Role

- This repository is the source-first development repo for the `maintenance-tracker` Home Assistant integration.
- Test and review changes here first.
- Mirror tested integration files into the live Home Assistant config only after explicit approval for `smb-share/` edits.

## Runtime Notes

- The custom card JavaScript is served from inside the integration, not from `/config/www`.
- Keep required runtime files inside `custom_components/maintenance_tracker/` so the repository stays HACS-friendly.

## Branding Notes

- Home Assistant integration brand assets use the flat icon:
  - `custom_components/maintenance_tracker/brand/icon.png`
  - `custom_components/maintenance_tracker/brand/logo.png`
- GitHub README and broader repo branding use the tiled icon:
  - `.github/images/maintenance-tracker-readme-tile.png`
- Preserve this split unless the operator explicitly changes the branding direction.
