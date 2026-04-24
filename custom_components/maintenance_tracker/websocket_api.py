"""WebSocket commands for Maintenance Tracker."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN, WS_TYPE_GET, WS_TYPE_LIST, WS_TYPE_UPDATE_SETTINGS
from .storage import TrackerStore

SCHEMA_LIST = {vol.Required("type"): WS_TYPE_LIST}
SCHEMA_GET = {vol.Required("type"): WS_TYPE_GET, vol.Required("tracker_id"): str}
SCHEMA_UPDATE_SETTINGS = {
    vol.Required("type"): WS_TYPE_UPDATE_SETTINGS,
    vol.Optional("notify_on_due"): bool,
    vol.Optional("notify_hour"): vol.All(vol.Coerce(int), vol.Range(min=0, max=23)),
}


def async_register(hass: HomeAssistant, store: TrackerStore) -> None:
    """Register tracker websocket commands."""

    @websocket_api.websocket_command(SCHEMA_LIST)
    @websocket_api.async_response
    async def ws_list(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        connection.send_result(
            msg["id"],
            {"trackers": store.list_trackers(), "settings": store.get_settings()},
        )

    @websocket_api.websocket_command(SCHEMA_GET)
    @websocket_api.async_response
    async def ws_get(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        try:
            tracker = store.get_tracker(msg["tracker_id"])
        except ValueError as err:
            connection.send_error(msg["id"], "tracker_not_found", str(err))
            return
        connection.send_result(msg["id"], {"tracker": tracker})

    @websocket_api.websocket_command(SCHEMA_UPDATE_SETTINGS)
    @websocket_api.async_response
    async def ws_update_settings(
        hass: HomeAssistant,
        connection: websocket_api.ActiveConnection,
        msg: dict[str, Any],
    ) -> None:
        payload = {
            key: msg[key]
            for key in ("notify_on_due", "notify_hour")
            if key in msg
        }
        try:
            settings = await store.async_update_settings(payload)
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_settings", str(err))
            return
        connection.send_result(msg["id"], {"settings": settings})

    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_update_settings)
