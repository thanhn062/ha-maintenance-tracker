"""Maintenance Tracker integration."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util

from .const import (
    CONF_DUE_SOON_THRESHOLD,
    DEFAULT_DUE_SOON_THRESHOLD,
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
LOVELACE_RESOURCES_STORAGE_VERSION = 1
LOVELACE_RESOURCES_STORAGE_KEY = "lovelace_resources"
LOVELACE_RESOURCE_ID = "maintenance_tracker_manager_local"
LOVELACE_RESOURCE_URL = f"/api/{DOMAIN}/static/maintenance-tracker-manager.js"
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


def _validate_tracker_reference(data: dict[str, Any]) -> dict[str, Any]:
    """Require either the new public tracker field or the legacy alias."""
    if not data.get("tracker") and not data.get("tracker_id"):
        raise vol.Invalid("expected tracker")
    return data


def _tracker_reference_schema(extra: dict[Any, Any] | None = None) -> vol.Schema:
    """Build a schema that accepts tracker or legacy tracker_id."""
    schema: dict[Any, Any] = {
        vol.Exclusive("tracker", "tracker_reference"): cv.string,
        vol.Exclusive("tracker_id", "tracker_reference"): cv.string,
    }
    if extra:
        schema.update(extra)
    return vol.All(vol.Schema(schema), _validate_tracker_reference)


UPDATE_SCHEMA = _tracker_reference_schema(
    {
        vol.Optional("title"): cv.string,
        vol.Optional("lifespan_days"): vol.Coerce(int),
        vol.Optional("last_done"): cv.string,
        vol.Optional("icon"): cv.string,
        vol.Optional("notes"): cv.string,
        vol.Optional("category"): cv.string,
    }
)
DELETE_SCHEMA = _tracker_reference_schema()
RESET_SCHEMA = _tracker_reference_schema({vol.Optional("date"): cv.string})


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
    await _async_ensure_lovelace_resource(hass)
    websocket_api.async_register(hass, store)
    await _async_process_due_notifications(hass)

    async def async_handle_due_check(now) -> None:
        """Process due notifications on the hourly schedule."""
        del now
        await _async_process_due_notifications(hass)

    hass.data[DOMAIN][DATA_DUE_CHECK_UNSUB] = async_track_time_change(
        hass,
        async_handle_due_check,
        minute=0,
        second=5,
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if unsub := hass.data.get(DOMAIN, {}).pop(DATA_DUE_CHECK_UNSUB, None):
        unsub()
    hass.data.get(DOMAIN, {}).pop(DATA_STORE, None)
    await _async_remove_lovelace_resource(hass)
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
        tracker_id = _extract_tracker_reference(data)
        data.pop("tracker", None)
        data.pop("tracker_id", None)
        tracker = await store.async_update_tracker(tracker_id, data)
        _fire_updated(hass, "update", tracker["id"])
        await _async_process_due_notifications(hass)

    async def async_handle_delete(call: ServiceCall) -> None:
        store = _get_store(hass)
        tracker_id = _extract_tracker_reference(call.data)
        await store.async_delete_tracker(tracker_id)
        _fire_updated(hass, "delete", tracker_id)
        await _async_process_due_notifications(hass)

    async def async_handle_reset(call: ServiceCall) -> None:
        store = _get_store(hass)
        tracker = await store.async_reset_tracker(
            _extract_tracker_reference(call.data), call.data.get("date")
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


def _extract_tracker_reference(data: dict[str, Any]) -> str:
    """Return the public tracker handle, preferring the new field name."""
    return data.get("tracker") or data["tracker_id"]


def _fire_updated(hass: HomeAssistant, action: str, tracker_id: str | None) -> None:
    hass.bus.async_fire(
        EVENT_TRACKERS_UPDATED,
        {"action": action, "tracker_id": tracker_id},
    )


async def _async_ensure_lovelace_resource(hass: HomeAssistant) -> None:
    """Ensure the frontend card resource exists for storage-mode dashboards."""
    resource_store: Store[dict[str, Any]] = Store(
        hass, LOVELACE_RESOURCES_STORAGE_VERSION, LOVELACE_RESOURCES_STORAGE_KEY
    )
    data = await resource_store.async_load() or {"items": []}
    items = list(data.get("items") or [])

    for item in items:
        if item.get("id") == LOVELACE_RESOURCE_ID or item.get("url") == LOVELACE_RESOURCE_URL:
            return

    items.append(
        {
            "id": LOVELACE_RESOURCE_ID,
            "url": LOVELACE_RESOURCE_URL,
            "type": "module",
        }
    )
    data["items"] = items
    await resource_store.async_save(data)


async def _async_remove_lovelace_resource(hass: HomeAssistant) -> None:
    """Remove the frontend card resource when the integration is unloaded."""
    resource_store: Store[dict[str, Any]] = Store(
        hass, LOVELACE_RESOURCES_STORAGE_VERSION, LOVELACE_RESOURCES_STORAGE_KEY
    )
    data = await resource_store.async_load()
    if not data:
        return

    items = list(data.get("items") or [])
    filtered = [
        item
        for item in items
        if item.get("id") != LOVELACE_RESOURCE_ID and item.get("url") != LOVELACE_RESOURCE_URL
    ]
    if len(filtered) == len(items):
        return

    data["items"] = filtered
    await resource_store.async_save(data)


async def _async_process_due_notifications(hass: HomeAssistant) -> None:
    """Process due notifications using current entry options."""
    store = hass.data.get(DOMAIN, {}).get(DATA_STORE)
    if store is None:
        return
    settings = store.get_settings()
    notify_hour = int(settings.get("notify_hour", 7))
    current_hour = dt_util.as_local(dt_util.now()).hour
    if current_hour != notify_hour:
        return
    await store.async_process_due_notifications()
