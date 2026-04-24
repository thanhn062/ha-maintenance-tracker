"""Constants for the Maintenance Tracker integration."""

from __future__ import annotations

DOMAIN = "maintenance_tracker"
STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.registry"
DEFAULT_DUE_SOON_THRESHOLD = 2
EVENT_TRACKERS_UPDATED = f"{DOMAIN}_updated"
EVENT_TRACKER_DUE = f"{DOMAIN}_due"

CONF_DUE_SOON_THRESHOLD = "due_soon_threshold"
CONF_NOTIFY_ON_DUE = "notify_on_due"
CONF_NOTIFY_HOUR = "notify_hour"

SERVICE_CREATE_TRACKER = "create_tracker"
SERVICE_UPDATE_TRACKER = "update_tracker"
SERVICE_DELETE_TRACKER = "delete_tracker"
SERVICE_RESET = "reset"
SERVICE_RELOAD = "reload"

DEFAULT_NOTIFY_ON_DUE = False
DEFAULT_NOTIFY_HOUR = 7

WS_TYPE_LIST = f"{DOMAIN}/list_trackers"
WS_TYPE_GET = f"{DOMAIN}/get_tracker"
