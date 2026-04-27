# Maintenance Tracker

<p align="center">
  <img src=".github/images/integration-logo.jpg" alt="Maintenance Tracker" width="180">
</p>

[![Release](https://img.shields.io/github/v/release/thanhn062/ha-maintenance-tracker?style=for-the-badge)](https://github.com/thanhn062/ha-maintenance-tracker/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg?style=for-the-badge)](https://github.com/thanhn062/ha-maintenance-tracker/blob/main/LICENSE)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.8.0-blue.svg?style=for-the-badge&logo=home-assistant)](https://www.home-assistant.io/)
[![HACS](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=for-the-badge)](https://www.hacs.xyz/docs/faq/custom_repositories/)
[![Validate](https://img.shields.io/github/actions/workflow/status/thanhn062/ha-maintenance-tracker/validate.yaml?branch=main&style=for-the-badge&label=validate)](https://github.com/thanhn062/ha-maintenance-tracker/actions/workflows/validate.yaml)
[![Hassfest](https://img.shields.io/github/actions/workflow/status/thanhn062/ha-maintenance-tracker/hassfest.yaml?branch=main&style=for-the-badge&label=hassfest)](https://github.com/thanhn062/ha-maintenance-tracker/actions/workflows/hassfest.yaml)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000000)](https://www.buymeacoffee.com/thanhnatos)

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

## HACS Install

Until it is included in the default HACS catalog, add this repository as a custom repository in HACS:

1. HACS -> top-right menu -> `Custom repositories`
2. Repository: `https://github.com/thanhn062/ha-maintenance-tracker`
3. Category: `Integration`
