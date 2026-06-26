# Maintenance Tracker

<p align="center">
  <img src=".github/images/maintenance-tracker-readme-tile.png" alt="Maintenance Tracker" width="180">
</p>

[![Release](https://img.shields.io/github/v/release/thanhn062/ha-maintenance-tracker?style=for-the-badge)](https://github.com/thanhn062/ha-maintenance-tracker/releases)
[![Downloads](https://img.shields.io/github/downloads/thanhn062/ha-maintenance-tracker/total?style=for-the-badge)](https://github.com/thanhn062/ha-maintenance-tracker/releases)
[![License](https://img.shields.io/badge/license-Apache--2.0-green.svg?style=for-the-badge)](https://github.com/thanhn062/ha-maintenance-tracker/blob/main/LICENSE)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.8.0-blue.svg?style=for-the-badge&logo=home-assistant)](https://www.home-assistant.io/)
[![HACS](https://img.shields.io/badge/HACS-Default-41BDF5.svg?style=for-the-badge)](https://www.hacs.xyz/)
[![Validate](https://img.shields.io/github/actions/workflow/status/thanhn062/ha-maintenance-tracker/validate.yaml?branch=main&style=for-the-badge&label=validate)](https://github.com/thanhn062/ha-maintenance-tracker/actions/workflows/validate.yaml)
[![Hassfest](https://img.shields.io/github/actions/workflow/status/thanhn062/ha-maintenance-tracker/hassfest.yaml?branch=main&style=for-the-badge&label=hassfest)](https://github.com/thanhn062/ha-maintenance-tracker/actions/workflows/hassfest.yaml)
[![Made with AI](https://img.shields.io/badge/Made%20with-AI-lightgrey?style=for-the-badge)](https://github.com/mefengl/made-by-ai)
[![Commit Messages by AI](https://img.shields.io/badge/Commit%20Messages%20by-AI-green?style=for-the-badge)](https://github.com/mefengl/made-by-ai)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000000)](https://www.buymeacoffee.com/thanhnatos)

> Check out my other Home Assistant related creations: [HA Dyson Card](https://github.com/thanhn062/ha-dyson-card)

## Why This One?

I know what you might be thinking: *not another tracker integration.*

Fair enough. There are already other takes on this idea. But this project was built around a different goal: reducing reminder fatigue instead of creating another dashboard that slowly turns into background noise.

I have been testing this concept in different forms for about 6 years through my older project, [HowManyDaysSince](https://github.com/thanhn062/HowManyDaysSince), and this is the version that feels most natural to live with in Home Assistant.

The focus here is not on showing every recurring task all the time. The focus is the workflow.

The intended flow is simple:

1. Create the task
2. Complete it when it becomes due
3. Reset it and repeat

That is why visibility filtering is such a core part of the experience.

After you create a task in **Manager** mode, it stays out of sight until it enters the visibility window you define. That way, your Home Assistant dashboard stays useful instead of becoming a wall of maintenance reminders you unconsciously ignore. Since it already lives in a space you check every day, whether on your phone or on a wall-mounted display, it becomes the right surface for these tasks at the right time.

The goal is simple: make recurring maintenance tracking feel practical, low-friction, and easy to keep up with over time.

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
## Media
### Card content
<img width="500" height="auto" alt="card content" src="https://github.com/user-attachments/assets/e9b04c80-3dd9-4c96-b298-d180474c9e8c" />

### Demo

https://github.com/user-attachments/assets/1e7b41bd-5b1f-4424-b1e9-911101bfcca4

## Credits

Badge mode was inspired by [ha-trash-card](https://github.com/idaho/hassio-trash-card).

Thanks to its creator for the inspiration.

## HACS Install

Maintenance Tracker is available in the default HACS repository list:

1. Open HACS
2. Go to `Integrations`
3. Search for `Maintenance Tracker`
4. Download the integration

## Quick Start

After HACS downloads the repository:

1. Go to `Settings` -> `Devices & Services` -> `Add Integration`
2. Search for `Maintenance Tracker`
3. Finish adding the integration
4. Restart Home Assistant once so the card resource is loaded
5. Refresh the Home Assistant page (this is important for the card to show up on search), then search for `Maintenance Tracker Manager` when adding a card

If the card still does not appear, use a `Manual` card with:

```yaml
type: custom:maintenance-tracker-manager
```

From there, open the card and press `Add tracker` to create your first maintenance task.

## Automation
For automations, scripts, or NFC tags, use the tracker slug as the service value:

- `Bedsheets` -> `bedsheets`
- `Water Filter` -> `water_filter`
- `PC Cleanup` -> `pc_cleanup`

Example:

```yaml
action: maintenance_tracker.reset
data:
  tracker: water_filter
```

## Disclaimer

This project was built with Codex, with me serving as project manager and overseeing the direction, review, and iteration process throughout.
