"""Config flow for Maintenance Tracker."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult

from .const import (
    CONF_DUE_SOON_THRESHOLD,
    CONF_NOTIFY_ON_DUE,
    DEFAULT_DUE_SOON_THRESHOLD,
    DEFAULT_NOTIFY_ON_DUE,
    DOMAIN,
)


class MaintenanceTrackerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Maintenance Tracker."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Create the options flow."""
        return MaintenanceTrackerOptionsFlow(config_entry)

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            threshold = int(user_input[CONF_DUE_SOON_THRESHOLD])
            return self.async_create_entry(
                title="Maintenance Tracker",
                data={CONF_DUE_SOON_THRESHOLD: threshold},
            )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_DUE_SOON_THRESHOLD,
                        default=DEFAULT_DUE_SOON_THRESHOLD,
                    ): vol.All(vol.Coerce(int), vol.Range(min=1, max=30)),
                }
            ),
        )


class MaintenanceTrackerOptionsFlow(config_entries.OptionsFlowWithReload):
    """Handle Maintenance Tracker options."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(data=user_input)

        options_schema = vol.Schema(
            {
                vol.Required(
                    CONF_NOTIFY_ON_DUE,
                    default=self.config_entry.options.get(
                        CONF_NOTIFY_ON_DUE, DEFAULT_NOTIFY_ON_DUE
                    ),
                ): bool,
            }
        )

        return self.async_show_form(step_id="init", data_schema=options_schema)
