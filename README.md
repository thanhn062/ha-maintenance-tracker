# Maintenance Tracker

<p align="center">
  <img src=".github/images/maintenance-tracker-readme-tile.png" alt="Maintenance Tracker" width="180">
</p>

[![Release](https://img.shields.io/github/v/release/thanhn062/ha-maintenance-tracker?style=for-the-badge)](https://github.com/thanhn062/ha-maintenance-tracker/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg?style=for-the-badge)](https://github.com/thanhn062/ha-maintenance-tracker/blob/main/LICENSE)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.8.0-blue.svg?style=for-the-badge&logo=home-assistant)](https://www.home-assistant.io/)
[![HACS](https://img.shields.io/badge/HACS-Custom-41BDF5.svg?style=for-the-badge)](https://www.hacs.xyz/docs/faq/custom_repositories/)
[![Validate](https://img.shields.io/github/actions/workflow/status/thanhn062/ha-maintenance-tracker/validate.yaml?branch=main&style=for-the-badge&label=validate)](https://github.com/thanhn062/ha-maintenance-tracker/actions/workflows/validate.yaml)
[![Hassfest](https://img.shields.io/github/actions/workflow/status/thanhn062/ha-maintenance-tracker/hassfest.yaml?branch=main&style=for-the-badge&label=hassfest)](https://github.com/thanhn062/ha-maintenance-tracker/actions/workflows/hassfest.yaml)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000000)](https://www.buymeacoffee.com/thanhnatos)

Maintenance Tracker is a lightweight productivity integration for Home Assistant.

It is a modern revival of an older project I built about 6 years ago:
[HowManyDaysSince](https://github.com/thanhn062/HowManyDaysSince)

I wanted to bring that idea into Home Assistant in a way that feels simple, practical, and easy to live with day to day. There have been other takes on this kind of reminder tracker, but this version is built around a more intuitive and low-friction user experience.

## Features

### Display Modes
- Manager
- Compact
- Badge

### Highlights
- Integration-owned JSON storage
- Full create, update, reset, and delete task flow
- Highly customizable compact card content
- Full MDI icon selection
- Expressive colored circular progress bars
- Visibility filtering
- Notification settings
- In-line reset with confirmation in all modes

## Intended Workflow

This integration was designed to feel as close to “set it and forget it” as possible:

1. Create the task
2. Set the visibility filter
3. Complete the task when it becomes due or visible on your dashboard
4. Repeat

For the best experience, I recommend placing the Manager card inside a Bubble Card pop-up.

## Credits

Badge mode was inspired by [ha-trash-card](https://github.com/idaho/hassio-trash-card).

Thanks to its creator for the inspiration.

## HACS Install

Until it is included in the default HACS catalog, add this repository as a custom repository in HACS:

1. HACS -> top-right menu -> `Custom repositories`
2. Repository: `https://github.com/thanhn062/ha-maintenance-tracker`
3. Category: `Integration`
