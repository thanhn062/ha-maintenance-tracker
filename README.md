# Maintenance Tracker

Contained Home Assistant maintenance tracker integration with:

- integration-owned JSON storage
- full CRUD services
- custom card manager UI
- circular dial presentation for at-a-glance status

## Repo Role

This repo is the feature-development source for the integration.

Workflow:

1. Implement and review changes here.
2. Mirror the tested integration files into Home Assistant for local runtime validation.
3. Extract or publish from this repo when the HACS packaging path is ready.

## Runtime Layout

```text
custom_components/
  maintenance_tracker/
    __init__.py
    config_flow.py
    const.py
    manifest.json
    services.yaml
    storage.py
    websocket_api.py
    strings.json
    static/
      maintenance-tracker-manager.js
```

## Current Notes

- The card JS is served from inside the integration, not `/config/www`, so the runtime shape stays HACS-friendly.
- The current Home Assistant test target is mirrored from this repo into the live HA config after explicit approval.

