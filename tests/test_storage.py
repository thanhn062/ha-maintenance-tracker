from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
import unittest
from datetime import datetime, timezone


def _install_homeassistant_stubs() -> None:
    dt_module = types.ModuleType("homeassistant.util.dt")
    fixed_now = datetime(2026, 4, 29, 7, 0, 0, tzinfo=timezone.utc)
    dt_module.now = lambda: fixed_now
    dt_module.utcnow = lambda: fixed_now
    dt_module.as_local = lambda value: value

    storage_module = types.ModuleType("homeassistant.helpers.storage")

    class DummyStore:
        def __init__(self, hass, version, key):
            self.hass = hass
            self.version = version
            self.key = key
            self.saved = None

        async def async_load(self):
            return None

        async def async_save(self, data):
            self.saved = data

    storage_module.Store = DummyStore

    core_module = types.ModuleType("homeassistant.core")
    core_module.HomeAssistant = object

    helpers_module = types.ModuleType("homeassistant.helpers")
    helpers_module.storage = storage_module

    util_module = types.ModuleType("homeassistant.util")
    util_module.dt = dt_module

    homeassistant_module = types.ModuleType("homeassistant")
    homeassistant_module.core = core_module
    homeassistant_module.helpers = helpers_module
    homeassistant_module.util = util_module

    sys.modules["homeassistant"] = homeassistant_module
    sys.modules["homeassistant.core"] = core_module
    sys.modules["homeassistant.helpers"] = helpers_module
    sys.modules["homeassistant.helpers.storage"] = storage_module
    sys.modules["homeassistant.util"] = util_module
    sys.modules["homeassistant.util.dt"] = dt_module


def _load_storage_module():
    repo_root = Path(__file__).resolve().parents[1]
    package_root = repo_root / "custom_components" / "maintenance_tracker"

    custom_components_pkg = types.ModuleType("custom_components")
    custom_components_pkg.__path__ = [str(repo_root / "custom_components")]
    maintenance_tracker_pkg = types.ModuleType("custom_components.maintenance_tracker")
    maintenance_tracker_pkg.__path__ = [str(package_root)]

    sys.modules["custom_components"] = custom_components_pkg
    sys.modules["custom_components.maintenance_tracker"] = maintenance_tracker_pkg

    const_spec = importlib.util.spec_from_file_location(
        "custom_components.maintenance_tracker.const",
        package_root / "const.py",
    )
    const_module = importlib.util.module_from_spec(const_spec)
    sys.modules[const_spec.name] = const_module
    const_spec.loader.exec_module(const_module)

    storage_spec = importlib.util.spec_from_file_location(
        "custom_components.maintenance_tracker.storage",
        package_root / "storage.py",
    )
    storage_module = importlib.util.module_from_spec(storage_spec)
    sys.modules[storage_spec.name] = storage_module
    storage_spec.loader.exec_module(storage_module)
    return storage_module


_install_homeassistant_stubs()
storage = _load_storage_module()


class FakeBus:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict]] = []

    def async_fire(self, event_type, payload) -> None:
        self.events.append((event_type, payload))


class FakeServices:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict, bool]] = []

    async def async_call(self, domain, service, data, blocking=False):
        self.calls.append((domain, service, data, blocking))


class FakeHass:
    def __init__(self) -> None:
        self.bus = FakeBus()
        self.services = FakeServices()


class TrackerStoreTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.hass = FakeHass()
        self.store = storage.TrackerStore(self.hass, due_soon_threshold=2)

    def test_normalize_slug(self) -> None:
        self.assertEqual(storage._normalize_slug("Water Filter"), "water_filter")
        self.assertEqual(storage._normalize_slug("car-fluids"), "car-fluids")
        with self.assertRaises(ValueError):
            storage._normalize_slug("bad slug!")

    async def test_due_notifications_fire_once_per_cycle(self) -> None:
        self.store._data = {
            "version": 1,
            "settings": {
                "notify_on_due": True,
                "notify_hour": 7,
                "notify_persistent": True,
            },
            "trackers": [
                {
                    "id": "water_filter",
                    "slug": "water_filter",
                    "title": "Water Filter",
                    "icon": "mdi:water",
                    "lifespan_days": 7,
                    "last_done": "2026-04-22",
                    "notes": "",
                    "category": "",
                    "last_due_notification_date": None,
                    "last_due_notification_sent_at": None,
                    "created_at": "2026-04-22T00:00:00Z",
                    "updated_at": "2026-04-22T00:00:00Z",
                }
            ],
        }

        triggered = await self.store.async_process_due_notifications()

        self.assertEqual(len(triggered), 1)
        self.assertEqual(triggered[0]["id"], "water_filter")
        self.assertEqual(len(self.hass.bus.events), 1)
        self.assertEqual(self.hass.bus.events[0][1]["slug"], "water_filter")

        self.assertEqual(len(self.hass.services.calls), 2)
        notify_call, persistent_call = self.hass.services.calls
        self.assertEqual(notify_call[0:2], ("notify", "notify"))
        self.assertEqual(persistent_call[0:2], ("persistent_notification", "create"))
        self.assertEqual(notify_call[2]["title"], "Maintenance Task Due")
        self.assertEqual(notify_call[2]["message"], "Water Filter is due today.")
        self.assertEqual(
            persistent_call[2]["notification_id"],
            "maintenance_tracker_water_filter_2026-04-29",
        )

        second_trigger = await self.store.async_process_due_notifications()
        self.assertEqual(second_trigger, [])
        self.assertEqual(len(self.hass.services.calls), 2)

    def test_find_tracker_accepts_slug(self) -> None:
        self.store._data["trackers"] = [
            {
                "id": "tracker_1",
                "slug": "bedsheets",
                "title": "Bedsheets",
                "icon": "mdi:bed",
                "lifespan_days": 14,
                "last_done": "2026-04-15",
                "notes": "",
                "category": "",
                "last_due_notification_date": None,
                "last_due_notification_sent_at": None,
                "created_at": "2026-04-15T00:00:00Z",
                "updated_at": "2026-04-15T00:00:00Z",
            }
        ]

        self.assertEqual(self.store._find_tracker("bedsheets")["id"], "tracker_1")
        self.assertEqual(self.store._find_tracker("tracker_1")["slug"], "bedsheets")


if __name__ == "__main__":
    unittest.main()
