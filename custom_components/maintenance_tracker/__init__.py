"""Maintenance Tracker integration."""

from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import (
    CONF_DUE_SOON_THRESHOLD,
    CONF_NOTIFY_ON_DUE,
    DEFAULT_DUE_SOON_THRESHOLD,
    DEFAULT_NOTIFY_ON_DUE,
    DOMAIN,
    EVENT_TRACKERS_UPDATED,
    SERVICE_CREATE_TRACKER,
    SERVICE_DELETE_TRACKER,
    SERVICE_RELOAD,
    SERVICE_RESET,
    SERVICE_UPDATE_TRACKER,
)
from .storage import TrackerStore
from . import websocket_api

DATA_STORE = "store"
DATA_SERVICES_REGISTERED = "services_registered"
DATA_DUE_CHECK_UNSUB = "due_check_unsub"
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
LOGGER = logging.getLogger(__name__)

CREATE_SCHEMA = vol.Schema(
    {
        vol.Required("slug"): cv.string,
        vol.Required("title"): cv.string,
        vol.Required("lifespan_days"): vol.Coerce(int),
        vol.Required("last_done"): cv.string,
        vol.Optional("icon"): cv.string,
        vol.Optional("notes"): cv.string,
        vol.Optional("category"): cv.string,
    }
)
UPDATE_SCHEMA = vol.Schema(
    {
        vol.Required("tracker_id"): cv.string,
        vol.Optional("title"): cv.string,
        vol.Optional("lifespan_days"): vol.Coerce(int),
        vol.Optional("last_done"): cv.string,
        vol.Optional("icon"): cv.string,
        vol.Optional("notes"): cv.string,
        vol.Optional("category"): cv.string,
    }
)
DELETE_SCHEMA = vol.Schema({vol.Required("tracker_id"): cv.string})
RESET_SCHEMA = vol.Schema(
    {
        vol.Required("tracker_id"): cv.string,
        vol.Optional("date"): cv.string,
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the integration from YAML."""
    hass.data.setdefault(DOMAIN, {})
    await _async_register_services(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up the integration from a config entry."""
    threshold = int(entry.data.get(CONF_DUE_SOON_THRESHOLD, DEFAULT_DUE_SOON_THRESHOLD))
    store = TrackerStore(hass, due_soon_threshold=threshold)
    await store.async_load()
    hass.data.setdefault(DOMAIN, {})[DATA_STORE] = store
    entry.runtime_data = store
    static_path = Path(__file__).parent / "static"
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                f"/api/{DOMAIN}/static",
                str(static_path),
                cache_headers=False,
            )
        ]
    )
    websocket_api.async_register(hass, store)
    await _async_process_due_notifications(hass)

    async def async_handle_due_check(now) -> None:
        """Process due notifications on the daily schedule."""
        del now
        await _async_process_due_notifications(hass)

    hass.data[DOMAIN][DATA_DUE_CHECK_UNSUB] = async_track_time_change(
        hass,
        async_handle_due_check,
        hour=0,
        minute=0,
        second=5,
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if unsub := hass.data.get(DOMAIN, {}).pop(DATA_DUE_CHECK_UNSUB, None):
        unsub()
    hass.data.get(DOMAIN, {}).pop(DATA_STORE, None)
    return True


async def _async_register_services(hass: HomeAssistant) -> None:
    """Register integration services once."""
    if hass.data[DOMAIN].get(DATA_SERVICES_REGISTERED):
        return

    async def async_handle_create(call: ServiceCall) -> None:
        store = _get_store(hass)
        tracker = await store.async_create_tracker(dict(call.data))
        _fire_updated(hass, "create", tracker["id"])
        await _async_process_due_notifications(hass)

    async def async_handle_update(call: ServiceCall) -> None:
        store = _get_store(hass)
        data = dict(call.data)
        tracker_id = data.pop("tracker_id")
        tracker = await store.async_update_tracker(tracker_id, data)
        _fire_updated(hass, "update", tracker["id"])
        await _async_process_due_notifications(hass)

    async def async_handle_delete(call: ServiceCall) -> None:
        store = _get_store(hass)
        tracker_id = call.data["tracker_id"]
        await store.async_delete_tracker(tracker_id)
        _fire_updated(hass, "delete", tracker_id)
        await _async_process_due_notifications(hass)

    async def async_handle_reset(call: ServiceCall) -> None:
        store = _get_store(hass)
        tracker = await store.async_reset_tracker(
            call.data["tracker_id"], call.data.get("date")
        )
        _fire_updated(hass, "reset", tracker["id"])
        await _async_process_due_notifications(hass)

    async def async_handle_reload(call: ServiceCall) -> None:
        store = _get_store(hass)
        await store.async_reload()
        _fire_updated(hass, "reload", None)
        await _async_process_due_notifications(hass)

    hass.services.async_register(
        DOMAIN,
        SERVICE_CREATE_TRACKER,
        _wrap_errors(async_handle_create),
        schema=CREATE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_UPDATE_TRACKER,
        _wrap_errors(async_handle_update),
        schema=UPDATE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_DELETE_TRACKER,
        _wrap_errors(async_handle_delete),
        schema=DELETE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_RESET,
        _wrap_errors(async_handle_reset),
        schema=RESET_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_RELOAD,
        _wrap_errors(async_handle_reload),
    )
    hass.data[DOMAIN][DATA_SERVICES_REGISTERED] = True


def _wrap_errors(handler):
    async def wrapped(call: ServiceCall) -> None:
        try:
            await handler(call)
        except ValueError as err:
            raise HomeAssistantError(str(err)) from err

    return wrapped


def _get_store(hass: HomeAssistant) -> TrackerStore:
    store = hass.data.get(DOMAIN, {}).get(DATA_STORE)
    if store is None:
        raise HomeAssistantError(
            "Maintenance Tracker is not configured. Add the integration first."
        )
    return store


def _fire_updated(hass: HomeAssistant, action: str, tracker_id: str | None) -> None:
    hass.bus.async_fire(
        EVENT_TRACKERS_UPDATED,
        {"action": action, "tracker_id": tracker_id},
    )
async def _async_process_due_notifications(hass: HomeAssistant) -> None:
    """Process due notifications using current entry options."""
    store = hass.data.get(DOMAIN, {}).get(DATA_STORE)
    if store is None:
        return
    entry = next(iter(hass.config_entries.async_entries(DOMAIN)), None)
    if entry is None:
        return
    enabled = bool(entry.options.get(CONF_NOTIFY_ON_DUE, DEFAULT_NOTIFY_ON_DUE))
    await store.async_process_due_notifications(
        enabled=enabled,
    )
