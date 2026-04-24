"""Storage manager for Maintenance Tracker."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import date
import re
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DEFAULT_DUE_SOON_THRESHOLD, STORAGE_KEY, STORAGE_VERSION

DEFAULT_ICON = "mdi:hammer-wrench"
SLUG_REGEX = re.compile(r"^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$")


def _utc_now_iso() -> str:
    return dt_util.utcnow().isoformat().replace("+00:00", "Z")


def _local_today() -> date:
    return dt_util.as_local(dt_util.now()).date()


def _normalize_slug(value: str) -> str:
    slug = value.strip().lower().replace(" ", "_")
    if not SLUG_REGEX.match(slug):
        raise ValueError("Slug must use lowercase letters, numbers, underscores, or hyphens.")
    return slug


def _validate_icon(value: str | None) -> str:
    if not value:
        return DEFAULT_ICON
    icon = value.strip()
    if ":" not in icon:
        raise ValueError("Icon must be a valid Home Assistant icon string such as mdi:bed.")
    return icon


def _validate_last_done(value: str) -> str:
    try:
        parsed = date.fromisoformat(value)
    except ValueError as err:
        raise ValueError("last_done must use YYYY-MM-DD.") from err
    if parsed > _local_today():
        raise ValueError("last_done cannot be in the future.")
    return parsed.isoformat()


def _validate_lifespan(value: int) -> int:
    lifespan = int(value)
    if lifespan <= 0:
        raise ValueError("lifespan_days must be greater than zero.")
    return lifespan


def _derive_tracker(tracker: dict[str, Any], due_soon_threshold: int) -> dict[str, Any]:
    last_done = date.fromisoformat(tracker["last_done"])
    today = _local_today()
    days_since_done = (today - last_done).days
    lifespan_days = tracker["lifespan_days"]
    next_due_date = last_done.toordinal() + lifespan_days
    due_date = date.fromordinal(next_due_date)
    days_remaining = (due_date - today).days
    days_overdue = max(0, -days_remaining)
    is_due = days_remaining <= 0
    if days_overdue > 0:
        status = "overdue"
    elif days_remaining == 0:
        status = "due"
    elif days_remaining <= due_soon_threshold:
        status = "due_soon"
    else:
        status = "fresh"

    result = deepcopy(tracker)
    result.update(
        {
            "days_since_done": days_since_done,
            "next_due_date": due_date.isoformat(),
            "days_remaining": max(0, days_remaining),
            "days_overdue": days_overdue,
            "is_due": is_due,
            "status": status,
            "progress_ratio": min(max(days_since_done / lifespan_days, 0), 1),
        }
    )
    return result


@dataclass
class TrackerStore:
    """Manager for maintenance tracker persistence and derivation."""

    hass: HomeAssistant
    due_soon_threshold: int = DEFAULT_DUE_SOON_THRESHOLD

    def __post_init__(self) -> None:
        self._store: Store[dict[str, Any]] = Store(
            self.hass, STORAGE_VERSION, STORAGE_KEY
        )
        self._data: dict[str, Any] = {"version": 1, "trackers": []}

    async def async_load(self) -> None:
        """Load registry from storage."""
        data = await self._store.async_load()
        if not data:
            self._data = {"version": 1, "trackers": []}
            return
        trackers: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        seen_slugs: set[str] = set()
        for item in data.get("trackers", []):
            normalized = self._normalize_tracker(
                item,
                existing_ids=seen_ids,
                existing_slugs=seen_slugs,
            )
            trackers.append(normalized)
            seen_ids.add(normalized["id"])
            seen_slugs.add(normalized["slug"])
        self._data = {"version": int(data.get("version", 1)), "trackers": trackers}

    async def async_reload(self) -> None:
        """Reload from storage."""
        await self.async_load()

    async def async_save(self) -> None:
        """Persist registry."""
        await self._store.async_save(self._data)

    def list_trackers(self) -> list[dict[str, Any]]:
        """Return all trackers with derived values."""
        return [
            _derive_tracker(item, self.due_soon_threshold)
            for item in sorted(self._data["trackers"], key=lambda tracker: tracker["title"].lower())
        ]

    def get_tracker(self, tracker_id: str) -> dict[str, Any]:
        """Return one tracker with derived values."""
        tracker = self._find_tracker(tracker_id)
        return _derive_tracker(tracker, self.due_soon_threshold)

    async def async_create_tracker(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Create a tracker."""
        tracker = self._normalize_tracker(
            payload,
            existing_ids=self._existing_ids(),
            existing_slugs=self._existing_slugs(),
        )
        self._data["trackers"].append(tracker)
        await self.async_save()
        return self.get_tracker(tracker["id"])

    async def async_update_tracker(
        self, tracker_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Update a tracker."""
        current = self._find_tracker(tracker_id)
        updated = {**current, **payload}
        updated["id"] = current["id"]
        updated["slug"] = current["slug"] if "slug" not in payload else _normalize_slug(payload["slug"])
        others = self._existing_ids(excluding=current["id"])
        normalized = self._normalize_tracker(
            updated,
            existing_ids=others,
            existing_slugs=self._existing_slugs(excluding=current["id"]),
        )
        index = self._data["trackers"].index(current)
        self._data["trackers"][index] = normalized
        await self.async_save()
        return self.get_tracker(normalized["id"])

    async def async_delete_tracker(self, tracker_id: str) -> None:
        """Delete a tracker."""
        current = self._find_tracker(tracker_id)
        self._data["trackers"].remove(current)
        await self.async_save()

    async def async_reset_tracker(
        self, tracker_id: str, reset_date: str | None = None
    ) -> dict[str, Any]:
        """Reset tracker last-done date."""
        target_date = reset_date or _local_today().isoformat()
        return await self.async_update_tracker(
            tracker_id,
            {"last_done": _validate_last_done(target_date)},
        )

    def _find_tracker(self, tracker_id: str) -> dict[str, Any]:
        normalized = tracker_id.strip().lower()
        for tracker in self._data["trackers"]:
            if tracker["id"] == normalized or tracker["slug"] == normalized:
                return tracker
        raise ValueError(f"Tracker '{tracker_id}' was not found.")

    def _existing_ids(self, excluding: str | None = None) -> set[str]:
        return {
            tracker["id"]
            for tracker in self._data["trackers"]
            if tracker["id"] != excluding
        }

    def _existing_slugs(self, excluding: str | None = None) -> set[str]:
        return {
            tracker["slug"]
            for tracker in self._data["trackers"]
            if tracker["id"] != excluding
        }

    def _normalize_tracker(
        self,
        payload: dict[str, Any],
        *,
        existing_ids: set[str],
        existing_slugs: set[str],
    ) -> dict[str, Any]:
        slug = _normalize_slug(payload.get("slug") or payload.get("id") or "")
        tracker_id = _normalize_slug(payload.get("id") or slug)
        if tracker_id in existing_ids:
            raise ValueError(f"Tracker id '{tracker_id}' already exists.")
        if slug in existing_slugs:
            raise ValueError(f"Tracker slug '{slug}' already exists.")
        title = str(payload.get("title", "")).strip()
        if not title:
            raise ValueError("title is required.")
        now_iso = _utc_now_iso()
        return {
            "id": tracker_id,
            "slug": slug,
            "title": title,
            "icon": _validate_icon(payload.get("icon")),
            "lifespan_days": _validate_lifespan(payload.get("lifespan_days")),
            "last_done": _validate_last_done(payload.get("last_done")),
            "notes": str(payload.get("notes", "") or "").strip(),
            "category": str(payload.get("category", "") or "").strip(),
            "created_at": payload.get("created_at") or now_iso,
            "updated_at": now_iso,
        }
