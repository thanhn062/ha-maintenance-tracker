class MaintenanceTrackerManager extends HTMLElement {
  static getConfigElement() {
    return document.createElement("maintenance-tracker-manager-editor");
  }

  static getStubConfig() {
    return {
      title: "Maintenance Tracker",
      mode: "manager",
      compact_count: 4,
      selected_trackers: [],
      compact_show_names: true,
      compact_show_age_lifespan: true,
      compact_show_summary: false,
      compact_show_urgency: false,
      compact_show_tile_background: true,
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._trackers = [];
    this._loading = false;
    this._error = "";
    this._dialog = null;
    this._refreshPending = false;
    this._suspendTrackerRefresh = false;
    this._lastLoadedAt = 0;
    this._loadIntervalMs = 60 * 60 * 1000;
  }

  static get ICON_OPTIONS() {
    return [
      "mdi:hammer-wrench",
      "mdi:bed",
      "mdi:curtains",
      "mdi:ceiling-light",
      "mdi:fan",
      "mdi:sofa",
      "mdi:vacuum",
      "mdi:washing-machine",
      "mdi:tshirt-crew",
      "mdi:shower",
      "mdi:toilet",
      "mdi:flower",
      "mdi:fridge-outline",
      "mdi:microwave",
      "mdi:air-purifier",
      "mdi:spray-bottle",
      "mdi:trash-can-outline",
      "mdi:calendar-check",
      "mdi:tools",
      "mdi:lightbulb",
      "mdi:lamp",
      "mdi:door-sliding",
      "mdi:window-open-variant",
      "mdi:desk",
      "mdi:toothbrush-paste",
      "mdi:paw",
      "mdi:leaf",
      "mdi:water",
      "mdi:home-heart",
      "mdi:broom"
    ];
  }

  static get ICON_GROUPS() {
    return [
      {
        label: "Cleaning",
        icons: [
          "mdi:vacuum",
          "mdi:broom",
          "mdi:spray-bottle",
          "mdi:trash-can-outline",
          "mdi:shower",
          "mdi:toilet",
          "mdi:washing-machine",
        ],
      },
      {
        label: "Bedroom",
        icons: [
          "mdi:bed",
          "mdi:curtains",
          "mdi:ceiling-light",
          "mdi:lamp",
          "mdi:tshirt-crew",
        ],
      },
      {
        label: "Home",
        icons: [
          "mdi:hammer-wrench",
          "mdi:tools",
          "mdi:home-heart",
          "mdi:door-sliding",
          "mdi:window-open-variant",
          "mdi:desk",
          "mdi:sofa",
        ],
      },
      {
        label: "Kitchen",
        icons: [
          "mdi:fridge-outline",
          "mdi:microwave",
          "mdi:water",
          "mdi:calendar-check",
        ],
      },
      {
        label: "Air And Light",
        icons: [
          "mdi:fan",
          "mdi:air-purifier",
          "mdi:lightbulb",
          "mdi:ceiling-light",
        ],
      },
      {
        label: "Plants And Pets",
        icons: [
          "mdi:flower",
          "mdi:leaf",
          "mdi:paw",
        ],
      },
    ];
  }

  setConfig(config) {
    this._config = {
      title: "Maintenance Tracker",
      mode: "manager",
      compact_count: 4,
      selected_trackers: [],
      compact_show_names: true,
      compact_show_percentage: true,
      compact_show_urgency: false,
      compact_show_tile_background: true,
      ...config,
    };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._dialog && this._suspendTrackerRefresh) {
      return;
    }
    const shouldRefresh = !this._lastLoadedAt || (Date.now() - this._lastLoadedAt) >= this._loadIntervalMs;
    if (shouldRefresh && !this._refreshPending) {
      this._refreshPending = true;
      Promise.resolve().then(async () => {
        this._refreshPending = false;
        await this._loadTrackers();
      });
    }
  }

  connectedCallback() {
    this._render();
  }

  getCardSize() {
    return Math.max(3, Math.ceil((this._trackers?.length || 1) * 1.5));
  }

  async _callWS(type, payload = {}) {
    return this._hass.callWS({ type, ...payload });
  }

  async _loadTrackers() {
    if (!this._hass) return;
    const initialLoad = !this._trackers.length;
    this._loading = initialLoad;
    this._error = "";
    if (initialLoad) {
      this._render();
    }
    try {
      const result = await this._callWS("maintenance_tracker/list_trackers");
      this._trackers = (result.trackers || []).sort((left, right) => {
        const priorityDiff = this._urgencyInfo(left).priority - this._urgencyInfo(right).priority;
        if (priorityDiff !== 0) return priorityDiff;
        const overdueDiff = (right.days_overdue || 0) - (left.days_overdue || 0);
        if (overdueDiff !== 0) return overdueDiff;
        const remainingDiff = (left.days_remaining || 0) - (right.days_remaining || 0);
        if (remainingDiff !== 0) return remainingDiff;
        return (left.title || "").localeCompare(right.title || "");
      });
      this._lastLoadedAt = Date.now();
    } catch (err) {
      this._error = err?.message || String(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _urgencyInfo(tracker) {
    const visual = Math.round(
      ((Number(tracker.days_since_done || 0) / Math.max(Number(tracker.lifespan_days || 1), 1)) * 100)
    );
    if (visual >= 100) {
      return {
        priority: 0,
        label: "🔴 Critical",
        color: "#ef4444",
        accent: "rgba(217,72,95,0.18)",
      };
    }
    if (visual >= 80) {
      return {
        priority: 1,
        label: "🟠 High",
        color: "#f97316",
        accent: "rgba(239,131,84,0.20)",
      };
    }
    if (visual >= 60) {
      return {
        priority: 2,
        label: "🟡 Medium",
        color: "#eab308",
        accent: "rgba(233,196,106,0.20)",
      };
    }
    return {
      priority: 3,
      label: "🟢 Low",
      color: "#22c55e",
      accent: "rgba(42,157,143,0.18)",
    };
  }

  _headerSummary() {
    const critical = this._trackers.filter((item) => this._urgencyInfo(item).priority === 0).length;
    const high = this._trackers.filter((item) => this._urgencyInfo(item).priority === 1).length;
    const medium = this._trackers.filter((item) => this._urgencyInfo(item).priority === 2).length;
    const low = this._trackers.filter((item) => this._urgencyInfo(item).priority === 3).length;
    const parts = [];
    if (critical) parts.push(`${critical} critical`);
    if (high) parts.push(`${high} high`);
    if (medium) parts.push(`${medium} medium`);
    if (low || !parts.length) parts.push(`${low} low`);
    return parts.join(" • ");
  }

  _displayTrackers() {
    const selected = Array.isArray(this._config.selected_trackers) ? this._config.selected_trackers : [];
    const selectedSet = new Set(selected.map((item) => `${item}`.trim().toLowerCase()).filter(Boolean));
    const visible = selectedSet.size
      ? this._trackers.filter((tracker) => selectedSet.has((tracker.slug || tracker.id || "").toLowerCase()))
      : [...this._trackers];
    if (this._config.mode === "compact" || this._config.mode === "badge") {
      const compactCount = Math.max(1, Math.min(Number(this._config.compact_count || 4), 8));
      return visible.slice(0, compactCount);
    }
    return visible;
  }

  _summaryText(tracker, options = {}) {
    const natural = options.natural === true;
    const overdueDays = Number(tracker.days_overdue || 0);
    const daysRemaining = Math.max(Number(tracker.days_remaining || 0), 0);

    if (overdueDays > 0) {
      if (natural && overdueDays === 1) return "yesterday";
      return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
    }
    if (tracker.status === "due") {
      return "today";
    }
    if (natural && daysRemaining === 1) {
      return "tomorrow";
    }
    return `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`;
  }

  _openDialog(mode, tracker = null) {
    this._dialog = {
      mode,
      tracker: tracker
        ? { ...tracker }
        : {
            title: "",
            slug: "",
            icon: "mdi:hammer-wrench",
            lifespan_days: 14,
            last_done: new Date().toISOString().slice(0, 10),
            notes: "",
            category: "",
          },
      iconQuery: tracker?.icon || "",
      iconPickerOpen: false,
    };
    this._suspendTrackerRefresh = true;
    this._render();
  }

  _closeDialog() {
    this._dialog = null;
    this._suspendTrackerRefresh = false;
    this._render();
  }

  _slugify(value) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  _filteredIcons(query) {
    const cleaned = (query || "").trim().toLowerCase();
    const icons = MaintenanceTrackerManager.ICON_OPTIONS;
    if (!cleaned) return icons;
    return icons.filter((icon) => icon.toLowerCase().includes(cleaned));
  }

  _groupedIcons(query) {
    const cleaned = (query || "").trim().toLowerCase();
    const groups = MaintenanceTrackerManager.ICON_GROUPS.map((group) => ({
      label: group.label,
      icons: group.icons.filter((icon) => !cleaned || icon.toLowerCase().includes(cleaned)),
    })).filter((group) => group.icons.length);

    if (groups.length || !cleaned) return groups;
    return [
      {
        label: "Matches",
        icons: this._filteredIcons(query),
      },
    ].filter((group) => group.icons.length);
  }

  async _submitDialog(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      title: `${data.get("title") || ""}`.trim(),
      slug: `${data.get("slug") || ""}`.trim() || this._slugify(`${data.get("title") || ""}`),
      icon: `${data.get("icon") || ""}`.trim(),
      lifespan_days: Number(data.get("lifespan_days") || 0),
      last_done: `${data.get("last_done") || ""}`.trim(),
      notes: `${data.get("notes") || ""}`.trim(),
      category: `${data.get("category") || ""}`.trim(),
    };

    try {
      if (this._dialog.mode === "create") {
        await this._hass.callService("maintenance_tracker", "create_tracker", payload);
      } else {
        await this._hass.callService("maintenance_tracker", "update_tracker", {
          tracker_id: this._dialog.tracker.id,
          title: payload.title,
          icon: payload.icon,
          lifespan_days: payload.lifespan_days,
          last_done: payload.last_done,
          notes: payload.notes,
          category: payload.category,
        });
      }
      this._lastLoadedAt = 0;
      this._closeDialog();
      await this._loadTrackers();
    } catch (err) {
      this._error = err?.message || String(err);
      this._render();
    }
  }

  async _deleteTracker(tracker) {
    if (!confirm(`Delete tracker "${tracker.title}"?`)) return;
    try {
      await this._hass.callService("maintenance_tracker", "delete_tracker", {
        tracker_id: tracker.id,
      });
      this._lastLoadedAt = 0;
      await this._loadTrackers();
    } catch (err) {
      this._error = err?.message || String(err);
      this._render();
    }
  }

  async _resetTracker(tracker) {
    try {
      await this._hass.callService("maintenance_tracker", "reset", {
        tracker_id: tracker.id,
      });
      this._lastLoadedAt = 0;
      await this._loadTrackers();
    } catch (err) {
      this._error = err?.message || String(err);
      this._render();
    }
  }

  _renderTracker(tracker) {
    const progress = Math.max(0, Math.min(1, Number(tracker.progress_ratio || 0)));
    const circumference = 2 * Math.PI * 42;
    const dashOffset = circumference * (1 - progress);
    const urgency = this._urgencyInfo(tracker);
    const color = urgency.color;
    const accent = urgency.accent;
    const progressPercent = Math.round(progress * 100);
    const overdueDays = Number(tracker.days_overdue || 0);
    const ageDays = Number(tracker.days_since_done || 0);
    const lifespanDays = Number(tracker.lifespan_days || 0);
    const summaryLine =
      tracker.status === "due"
        ? "Due today"
        : this._summaryText(tracker);
    return `
      <div class="tracker-card" style="--tracker-color:${color};--tracker-accent:${accent};">
        <div class="tracker-top">
          <div class="dial-wrap">
            <svg class="dial" viewBox="0 0 100 100" aria-hidden="true">
              <circle class="dial-bg" cx="50" cy="50" r="42"></circle>
              <circle class="dial-progress" cx="50" cy="50" r="42" style="stroke:${color};stroke-dasharray:${circumference};stroke-dashoffset:${dashOffset};"></circle>
            </svg>
            <div class="dial-center" style="color:${color};">
              <ha-icon icon="${tracker.icon || "mdi:hammer-wrench"}"></ha-icon>
              <div class="dial-percent">${progressPercent}%</div>
            </div>
          </div>
          <div class="tracker-main">
            <div class="tracker-title-row">
              <div class="tracker-title">${tracker.title}</div>
              ${tracker.category ? `<div class="tracker-category">${tracker.category}</div>` : ""}
            </div>
            <div class="tracker-status-row">
              <div class="tracker-status" style="color:${color};">${summaryLine}</div>
              <div class="tracker-state-chip">${urgency.label}</div>
            </div>
            <div class="tracker-meta">
              <span>Age ${ageDays} day${ageDays === 1 ? "" : "s"}</span>
              <span>Lifespan ${lifespanDays} day${lifespanDays === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
        ${tracker.notes ? `<div class="tracker-notes">${tracker.notes}</div>` : ""}
        <div class="tracker-actions">
          <button class="action action-primary" data-action="reset" data-id="${tracker.id}">Reset</button>
          <button class="action" data-action="edit" data-id="${tracker.id}">Edit</button>
          <button class="action action-danger" data-action="delete" data-id="${tracker.id}">Delete</button>
        </div>
      </div>
    `;
  }

  _renderCompactTracker(tracker) {
    const progress = Math.max(0, Math.min(1, Number(tracker.progress_ratio || 0)));
    const circumference = 2 * Math.PI * 24;
    const dashOffset = circumference * (1 - progress);
    const urgency = this._urgencyInfo(tracker);
    const ageDays = Number(tracker.days_since_done || 0);
    const lifespanDays = Number(tracker.lifespan_days || 0);
    const showNames = this._config.compact_show_names !== false;
    const showAgeLifespan = this._config.compact_show_age_lifespan !== false;
    const showSummary = this._config.compact_show_summary === true;
    const showUrgency = this._config.compact_show_urgency === true;
    const showTileBackground = this._config.compact_show_tile_background !== false;
    return `
      <button class="compact-tile ${showTileBackground ? "compact-tile-surface" : "compact-tile-plain"}" title="${tracker.title}: ${tracker.days_since_done} day${tracker.days_since_done === 1 ? "" : "s"} passed, ${urgency.label}" data-compact-id="${tracker.id}">
        <div class="compact-dial-wrap" style="--tracker-color:${urgency.color};--tracker-accent:${urgency.accent};">
          <svg class="compact-dial" viewBox="0 0 60 60" aria-hidden="true">
            <circle class="dial-bg" cx="30" cy="30" r="24"></circle>
            <circle class="dial-progress" cx="30" cy="30" r="24" style="stroke:${urgency.color};stroke-dasharray:${circumference};stroke-dashoffset:${dashOffset};"></circle>
          </svg>
          <div class="compact-dial-center">
            <ha-icon icon="${tracker.icon || "mdi:hammer-wrench"}"></ha-icon>
          </div>
        </div>
        <div class="compact-meta">
          ${showNames ? `<div class="compact-title">${tracker.title}</div>` : ""}
          ${showAgeLifespan ? `<div class="compact-subtitle">${ageDays}/${lifespanDays}</div>` : ""}
          ${showSummary ? `<div class="compact-summary">${this._summaryText(tracker, { natural: true })}</div>` : ""}
          ${showUrgency ? `<div class="compact-urgency" style="color:${urgency.color};">${urgency.label}</div>` : ""}
        </div>
      </button>
    `;
  }

  _renderBadgeTracker(tracker) {
    const urgency = this._urgencyInfo(tracker);
    return `
      <button class="badge-tile" style="--badge-accent:${urgency.color};--badge-accent-bg:${urgency.accent};" title="${tracker.title}: ${this._summaryText(tracker, { natural: true })}" data-badge-id="${tracker.id}">
        <div class="badge-icon">
          <ha-icon icon="${tracker.icon || "mdi:hammer-wrench"}"></ha-icon>
        </div>
        <div class="badge-copy">
          <div class="badge-title">${tracker.title}</div>
          <div class="badge-summary">${this._summaryText(tracker, { natural: true })}</div>
        </div>
      </button>
    `;
  }

  _renderDialog() {
    if (!this._dialog) return "";
    const tracker = this._dialog.tracker;
    const isEdit = this._dialog.mode === "edit";
    const previewTitle = tracker.title || "Tracker title";
    const previewIcon = tracker.icon || "mdi:hammer-wrench";
    const previewProgress = Math.max(
      0,
      Math.min(
        1,
        Number((tracker.days_since_done || 0) / Math.max(Number(tracker.lifespan_days || 14), 1))
      )
    );
    const previewCircumference = 2 * Math.PI * 32;
    const previewColor = "#2a9d8f";
    const groupedIcons = this._groupedIcons(this._dialog.iconQuery);
    return `
      <div class="dialog-backdrop">
        <div class="dialog">
          <div class="dialog-header">
            <div class="dialog-title">${isEdit ? "Edit tracker" : "Add tracker"}</div>
            <button class="icon-button" data-close-dialog>&times;</button>
          </div>
          <div class="dialog-preview">
            <div class="dialog-preview-dial">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle class="dial-bg" cx="50" cy="50" r="32"></circle>
                <circle class="dial-progress" cx="50" cy="50" r="32" style="stroke:${previewColor};stroke-dasharray:${previewCircumference};stroke-dashoffset:${previewCircumference * (1 - previewProgress)};"></circle>
              </svg>
              <div class="dialog-preview-center">
                <ha-icon icon="${previewIcon}"></ha-icon>
              </div>
            </div>
            <div class="dialog-preview-copy">
              <div class="dialog-preview-title">${previewTitle}</div>
              <div class="dialog-preview-subtitle">Dial preview updates while you edit</div>
            </div>
          </div>
          <form id="tracker-form">
            <label>Title<input name="title" value="${tracker.title || ""}" required /></label>
            <div class="icon-picker-shell">
              <label>Icon</label>
              <div class="icon-picker-bar">
              <div class="icon-picker-preview">
                  <ha-icon icon="${tracker.icon || "mdi:hammer-wrench"}"></ha-icon>
                </div>
                <input name="icon" id="icon-search-input" value="${tracker.icon || ""}" placeholder="Search or type mdi:bed" />
                <button type="button" class="action icon-picker-search" id="run-icon-search">Search</button>
                <button type="button" class="action icon-picker-toggle" id="toggle-icon-picker">${this._dialog.iconPickerOpen ? "Hide icons" : "Browse icons"}</button>
              </div>
              ${this._dialog.iconPickerOpen ? `
                <div class="icon-picker-panel">
                  <div class="icon-picker-help">Pick from common icons or keep typing to filter.</div>
                  ${groupedIcons.length ? groupedIcons.map((group) => `
                    <div class="icon-group">
                      <div class="icon-group-label">${group.label}</div>
                      <div class="icon-grid">
                        ${group.icons.map((icon) => `
                          <button type="button" class="icon-tile ${icon === tracker.icon ? "icon-tile-active" : ""}" data-icon-choice="${icon}">
                            <ha-icon icon="${icon}"></ha-icon>
                            <span>${icon.replace("mdi:", "")}</span>
                          </button>
                        `).join("")}
                      </div>
                    </div>
                  `).join("") : `<div class="icon-empty">No icons match that search.</div>`}
                </div>
              ` : ""}
            </div>
            <label>Lifespan days<input name="lifespan_days" type="number" min="1" value="${tracker.lifespan_days || 14}" required /></label>
            <label>Last done<input name="last_done" type="date" value="${tracker.last_done || ""}" required /></label>
            <label>Category<input name="category" value="${tracker.category || ""}" /></label>
            <label>Notes<textarea name="notes" rows="3">${tracker.notes || ""}</textarea></label>
            <div class="dialog-actions">
              <button type="button" class="action" data-close-dialog>Cancel</button>
              <button type="submit" class="action action-primary">${isEdit ? "Save" : "Create"}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  _render() {
    const displayTrackers = this._displayTrackers();
    const trackersMarkup = displayTrackers.length
      ? displayTrackers.map((tracker) => this._renderTracker(tracker)).join("")
      : `<div class="empty-state">No trackers yet. Add one to get started.</div>`;
    const isCompact = this._config.mode === "compact";
    const isBadge = this._config.mode === "badge";
    const compactMarkup = displayTrackers.length
      ? displayTrackers.map((tracker) => this._renderCompactTracker(tracker)).join("")
      : `<div class="empty-state">No trackers selected for compact view.</div>`;
    const badgeMarkup = displayTrackers.length
      ? displayTrackers.map((tracker) => this._renderBadgeTracker(tracker)).join("")
      : `<div class="empty-state">No trackers selected for badge view.</div>`;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        ha-card {
          background: transparent;
          box-shadow: none;
          border: none;
        }
        .shell {
          padding: 0;
          color: var(--primary-text-color);
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          margin-bottom: 12px;
        }
        .subtitle {
          color: var(--secondary-text-color);
          font-size: 0.92rem;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 14px;
        }
        .compact-shell {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .badge-shell {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .badge-tile {
          appearance: none;
          border: 1px solid var(--divider-color);
          border-radius: 999px;
          padding: 8px 14px 8px 9px;
          background: var(--ha-card-background, var(--card-background-color));
          color: var(--primary-text-color);
          display: inline-flex;
          align-items: center;
          gap: 9px;
          text-align: left;
          box-shadow: none;
          font: inherit;
          line-height: 1;
        }
        .badge-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: var(--badge-accent-bg);
          color: var(--badge-accent);
          flex: 0 0 auto;
        }
        .badge-icon ha-icon {
          --mdc-icon-size: 18px;
        }
        .badge-copy {
          display: grid;
          gap: 2px;
          line-height: 1.1;
        }
        .badge-title {
          font-size: 0.84rem;
          font-weight: 600;
        }
        .badge-summary {
          font-size: 0.76rem;
          font-weight: 500;
          color: var(--secondary-text-color);
          opacity: 1;
        }
        .compact-tile {
          appearance: none;
          border-radius: 18px;
          padding: 10px 8px 8px;
          color: var(--primary-text-color);
          display: grid;
          justify-items: center;
          gap: 8px;
          text-align: center;
          cursor: default;
        }
        .compact-tile-surface {
          border: var(--ha-card-border-width, 1px) solid var(--divider-color);
          background: var(--ha-card-background, var(--card-background-color));
          box-shadow: var(--ha-card-box-shadow, none);
        }
        .compact-tile-plain {
          border: none;
          background: transparent;
          box-shadow: none;
        }
        .compact-dial-wrap {
          position: relative;
          width: 60px;
          height: 60px;
          border-radius: 999px;
          background: rgba(18, 22, 28, 0.82);
        }
        .compact-dial {
          width: 60px;
          height: 60px;
          transform: rotate(-90deg);
        }
        .compact-dial-center {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--tracker-color);
        }
        .compact-dial-center ha-icon {
          --mdc-icon-size: 22px;
        }
        .compact-meta {
          min-width: 0;
          display: grid;
          gap: 2px;
        }
        .compact-title {
          font-size: 0.74rem;
          font-weight: 700;
          line-height: 1.15;
          word-break: break-word;
        }
        .compact-subtitle {
          font-size: 0.68rem;
          color: var(--secondary-text-color);
        }
        .compact-summary {
          font-size: 0.66rem;
          color: var(--secondary-text-color);
          line-height: 1.15;
        }
        .compact-urgency {
          font-size: 0.62rem;
          font-weight: 700;
          line-height: 1.1;
        }
        .tracker-card {
          border: var(--ha-card-border-width, 1px) solid var(--divider-color);
          border-radius: 20px;
          padding: 16px;
          background: var(--ha-card-background, var(--card-background-color));
          box-shadow: var(--ha-card-box-shadow, none);
        }
        .tracker-top {
          display: flex;
          gap: 14px;
        }
        .dial-wrap {
          position: relative;
          width: 92px;
          height: 92px;
          flex: 0 0 92px;
          filter: drop-shadow(0 10px 18px rgba(0,0,0,0.12));
        }
        .dial {
          width: 92px;
          height: 92px;
          transform: rotate(-90deg);
        }
        .dial-bg,
        .dial-progress {
          fill: none;
          stroke-width: 8;
          stroke-linecap: round;
        }
        .dial-bg {
          stroke: rgba(127,127,127,0.18);
        }
        .dial-progress {
          transition: stroke-dashoffset 180ms ease, stroke 180ms ease;
        }
        .dial-center {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 2px;
        }
        .dial-center ha-icon {
          --mdc-icon-size: 30px;
        }
        .dial-percent {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          opacity: 0.85;
        }
        .tracker-main {
          min-width: 0;
          flex: 1;
        }
        .tracker-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .tracker-title {
          font-size: 1rem;
          font-weight: 700;
        }
        .tracker-category {
          font-size: 0.75rem;
          color: var(--secondary-text-color);
          border: 1px solid rgba(127,127,127,0.2);
          border-radius: 999px;
          padding: 2px 8px;
        }
        .tracker-status {
          margin-top: 6px;
          font-size: 0.92rem;
          font-weight: 700;
        }
        .tracker-status-row {
          margin-top: 6px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .tracker-state-chip {
          font-size: 0.72rem;
          font-weight: 700;
          border-radius: 999px;
          padding: 4px 8px;
          background: var(--tracker-accent);
          color: var(--tracker-color);
          border: 1px solid rgba(255,255,255,0.12);
          white-space: nowrap;
        }
        .tracker-meta {
          margin-top: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          color: var(--secondary-text-color);
          font-size: 0.84rem;
        }
        .tracker-next-line {
          margin-top: 10px;
          font-size: 0.82rem;
          color: var(--secondary-text-color);
          letter-spacing: 0.01em;
        }
        .tracker-notes {
          margin-top: 12px;
          color: var(--secondary-text-color);
          font-size: 0.88rem;
          line-height: 1.35;
        }
        .tracker-actions,
        .dialog-actions {
          display: flex;
          gap: 8px;
          margin-top: 14px;
          flex-wrap: wrap;
        }
        .action,
        .add-button,
        .icon-button {
          appearance: none;
          border: none;
          border-radius: 999px;
          padding: 9px 14px;
          background: rgba(127,127,127,0.16);
          color: var(--primary-text-color);
          cursor: pointer;
          font: inherit;
        }
        .action-primary,
        .add-button {
          background: linear-gradient(135deg, #2a9d8f, #0f766e);
          color: white;
        }
        .action-danger {
          background: rgba(217,72,95,0.18);
          color: #d9485f;
        }
        .empty-state,
        .error {
          border-radius: 16px;
          padding: 14px;
          background: rgba(127,127,127,0.10);
        }
        .error {
          margin-bottom: 12px;
          color: #d9485f;
          border: 1px solid rgba(217,72,95,0.25);
        }
        .dialog-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          z-index: 9999;
          padding: 16px;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }
        .dialog {
          width: min(460px, 100%);
          background: #20252c;
          color: var(--primary-text-color);
          border-radius: 22px;
          padding: 16px;
          box-shadow: 0 18px 42px rgba(0,0,0,0.35);
          margin: auto 0;
          max-height: calc(100dvh - 32px);
          overflow-y: auto;
        }
        .dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .dialog-preview {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          border-radius: 18px;
          background:
            radial-gradient(circle at top left, rgba(42,157,143,0.12), transparent 40%),
            rgba(255,255,255,0.03);
          border: 1px solid rgba(127,127,127,0.15);
          margin-bottom: 14px;
        }
        .dialog-preview-dial {
          position: relative;
          width: 74px;
          height: 74px;
          flex: 0 0 74px;
        }
        .dialog-preview-dial svg {
          width: 74px;
          height: 74px;
          transform: rotate(-90deg);
        }
        .dialog-preview-center {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #2a9d8f;
        }
        .dialog-preview-center ha-icon {
          --mdc-icon-size: 28px;
        }
        .dialog-preview-copy {
          min-width: 0;
        }
        .dialog-preview-title {
          font-size: 1rem;
          font-weight: 700;
        }
        .dialog-preview-subtitle {
          margin-top: 4px;
          color: var(--secondary-text-color);
          font-size: 0.84rem;
        }
        .dialog-title {
          font-size: 1.08rem;
          font-weight: 700;
        }
        form {
          display: grid;
          gap: 12px;
        }
        label {
          display: grid;
          gap: 6px;
          font-size: 0.88rem;
          color: var(--secondary-text-color);
        }
        input,
        textarea {
          border: 1px solid rgba(127,127,127,0.22);
          border-radius: 12px;
          padding: 10px 12px;
          background: #171b21;
          color: var(--primary-text-color);
          font: inherit;
        }
        input:disabled {
          opacity: 0.55;
        }
        .icon-picker-shell {
          display: grid;
          gap: 6px;
        }
        .icon-picker-bar {
          display: grid;
          grid-template-columns: auto 1fr auto auto;
          gap: 8px;
          align-items: center;
        }
        .icon-picker-preview {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #171b21;
          border: 1px solid rgba(127,127,127,0.22);
          color: #2a9d8f;
        }
        .icon-picker-preview ha-icon {
          --mdc-icon-size: 24px;
        }
        .icon-picker-toggle {
          white-space: nowrap;
        }
        .icon-picker-search {
          white-space: nowrap;
        }
        .icon-picker-panel {
          border: 1px solid rgba(127,127,127,0.16);
          border-radius: 16px;
          padding: 12px;
          background: #171b21;
        }
        .icon-picker-help {
          color: var(--secondary-text-color);
          font-size: 0.82rem;
          margin-bottom: 10px;
        }
        .icon-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
          gap: 8px;
        }
        .icon-group + .icon-group {
          margin-top: 12px;
        }
        .icon-group-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--secondary-text-color);
          margin-bottom: 8px;
          padding-left: 2px;
        }
        .icon-tile {
          appearance: none;
          border: 1px solid rgba(127,127,127,0.16);
          background: #20252c;
          color: var(--primary-text-color);
          border-radius: 14px;
          padding: 10px 8px;
          display: grid;
          gap: 6px;
          justify-items: center;
          cursor: pointer;
          font: inherit;
          text-align: center;
        }
        .icon-tile ha-icon {
          --mdc-icon-size: 22px;
          color: #8ed8c9;
        }
        .icon-tile span {
          font-size: 0.72rem;
          color: var(--secondary-text-color);
          line-height: 1.1;
          word-break: break-word;
        }
        .icon-tile-active {
          border-color: rgba(42,157,143,0.5);
          background: rgba(42,157,143,0.14);
        }
        .icon-empty {
          color: var(--secondary-text-color);
          font-size: 0.84rem;
          padding: 8px 4px;
        }
        @media (max-width: 600px) {
          .badge-shell {
            gap: 8px;
          }
          .badge-tile {
            padding: 7px 12px 7px 8px;
            gap: 7px;
          }
          .badge-icon {
            width: 26px;
            height: 26px;
          }
          .badge-icon ha-icon {
            --mdc-icon-size: 17px;
          }
          .badge-title {
            font-size: 0.8rem;
          }
          .badge-summary {
            font-size: 0.72rem;
          }
          .compact-shell {
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 8px;
          }
          .compact-tile {
            padding: 8px 6px 6px;
            border-radius: 16px;
          }
          .compact-dial-wrap,
          .compact-dial {
            width: 54px;
            height: 54px;
          }
          .compact-dial-center ha-icon {
            --mdc-icon-size: 20px;
          }
          .compact-title {
            font-size: 0.68rem;
          }
          .compact-summary {
            font-size: 0.62rem;
          }
          .tracker-top {
            align-items: center;
          }
          .shell {
            padding: 0;
          }
          .dialog-backdrop {
            padding: 10px;
          }
          .dialog {
            max-height: calc(100dvh - 20px);
            border-radius: 18px;
          }
          .icon-picker-bar {
            grid-template-columns: auto 1fr;
          }
          .icon-picker-search,
          .icon-picker-toggle {
            grid-column: 1 / -1;
          }
        }
      </style>
      <ha-card>
        <div class="shell">
          <div class="header">
            ${(isCompact || isBadge) ? "" : `<div class="subtitle">${displayTrackers.length ? this._headerSummary() : "Circular dials for quick maintenance status at a glance"}</div>`}
            ${(isCompact || isBadge) ? "" : `<button class="add-button" id="add-tracker">Add tracker</button>`}
          </div>
          ${this._error ? `<div class="error">${this._error}</div>` : ""}
          ${this._loading ? `<div class="empty-state">Loading trackers...</div>` : isCompact ? `<div class="compact-shell">${compactMarkup}</div>` : isBadge ? `<div class="badge-shell">${badgeMarkup}</div>` : `<div class="grid">${trackersMarkup}</div>`}
        </div>
      </ha-card>
      ${this._renderDialog()}
    `;

    this.shadowRoot.getElementById("add-tracker")?.addEventListener("click", () => {
      this._openDialog("create");
    });
    this.shadowRoot.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const tracker = this._trackers.find((item) => item.id === button.dataset.id);
        if (!tracker) return;
        const action = button.dataset.action;
        if (action === "edit") this._openDialog("edit", tracker);
        if (action === "delete") this._deleteTracker(tracker);
        if (action === "reset") this._resetTracker(tracker);
      });
    });
    this.shadowRoot.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => this._closeDialog());
    });
    this.shadowRoot.getElementById("tracker-form")?.addEventListener("submit", (event) => {
      this._submitDialog(event);
    });
    const titleInput = this.shadowRoot.querySelector('input[name="title"]');
    const iconInput = this.shadowRoot.querySelector('input[name="icon"]');
    const previewTitle = this.shadowRoot.querySelector(".dialog-preview-title");
    const previewIcon = this.shadowRoot.querySelector(".dialog-preview-center ha-icon");
    const iconBarPreview = this.shadowRoot.querySelector(".icon-picker-preview ha-icon");
    const toggleIconPicker = this.shadowRoot.getElementById("toggle-icon-picker");
    const runIconSearch = this.shadowRoot.getElementById("run-icon-search");
    if (titleInput && previewTitle) {
      titleInput.addEventListener("input", () => {
        previewTitle.textContent = titleInput.value.trim() || "Tracker title";
      });
    }
    if (iconInput && previewIcon) {
      iconInput.addEventListener("input", () => {
        const icon = iconInput.value.trim() || "mdi:hammer-wrench";
        previewIcon.setAttribute("icon", icon);
        if (iconBarPreview) iconBarPreview.setAttribute("icon", icon);
        if (this._dialog) {
          this._dialog.tracker.icon = icon;
          this._dialog.iconQuery = iconInput.value.trim();
        }
      });
      iconInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          if (this._dialog) {
            this._dialog.iconQuery = iconInput.value.trim();
            this._dialog.iconPickerOpen = true;
            this._render();
          }
        }
      });
    }
    runIconSearch?.addEventListener("click", () => {
      if (!iconInput || !this._dialog) return;
      this._dialog.iconQuery = iconInput.value.trim();
      this._dialog.iconPickerOpen = true;
      this._render();
    });
    toggleIconPicker?.addEventListener("click", () => {
      if (!this._dialog) return;
      this._dialog.iconPickerOpen = !this._dialog.iconPickerOpen;
      this._render();
    });
    this.shadowRoot.querySelectorAll("[data-icon-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const icon = button.dataset.iconChoice;
        if (!iconInput || !this._dialog) return;
        iconInput.value = icon;
        this._dialog.tracker.icon = icon;
        this._dialog.iconQuery = icon;
        previewIcon?.setAttribute("icon", icon);
        iconBarPreview?.setAttribute("icon", icon);
        this._render();
      });
    });
  }
}

class MaintenanceTrackerManagerEditor extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._trackers = [];
    this._loading = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._trackers.length && !this._loading) {
      this._loadTrackers();
    }
  }

  setConfig(config) {
    this._config = {
      title: "Maintenance Tracker",
      mode: "manager",
      compact_count: 4,
      selected_trackers: [],
      compact_show_names: true,
      compact_show_age_lifespan: true,
      compact_show_summary: false,
      compact_show_urgency: false,
      compact_show_tile_background: true,
      ...config,
    };
    this._render();
  }

  async _loadTrackers() {
    if (!this._hass) return;
    this._loading = true;
    this._render();
    try {
      const result = await this._hass.callWS({ type: "maintenance_tracker/list_trackers" });
      this._trackers = (result.trackers || []).sort((left, right) => (left.title || "").localeCompare(right.title || ""));
    } catch (_err) {
      this._trackers = [];
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _emitConfig(patch) {
    this._config = { ...this._config, ...patch };
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const selected = new Set((this._config?.selected_trackers || []).map((item) => `${item}`));
    const mode = this._config?.mode || "manager";
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 8px 0; }
        label { display: grid; gap: 6px; font-size: 0.9rem; }
        input, select {
          border: 1px solid rgba(127,127,127,0.22);
          border-radius: 10px;
          padding: 8px 10px;
          font: inherit;
        }
        .stack { display: grid; gap: 12px; }
        .picker {
          border: 1px solid rgba(127,127,127,0.16);
          border-radius: 12px;
          padding: 10px;
          display: grid;
          gap: 8px;
        }
        .picker-title {
          font-size: 0.85rem;
          color: var(--secondary-text-color);
        }
        .picker-grid {
          display: grid;
          gap: 8px;
        }
        .picker-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
        }
        .picker-item input {
          margin: 0;
        }
        .option-grid {
          display: grid;
          gap: 8px;
        }
        .help {
          font-size: 0.82rem;
          color: var(--secondary-text-color);
        }
      </style>
      <div class="stack">
        <label>
          Card title
          <input id="title" value="${this._config?.title || "Maintenance Tracker"}" />
        </label>
        <label>
          Display mode
          <select id="mode">
            <option value="manager" ${mode === "manager" ? "selected" : ""}>Manager</option>
            <option value="compact" ${mode === "compact" ? "selected" : ""}>Compact row</option>
            <option value="badge" ${mode === "badge" ? "selected" : ""}>Badge</option>
          </select>
        </label>
        <label>
          Display item count
          <input id="compact-count" type="number" min="1" max="8" value="${Number(this._config?.compact_count || 4)}" />
        </label>
        <div class="picker">
          <div class="picker-title">Compact display options</div>
          <div class="option-grid">
            <label class="picker-item">
              <input id="compact-show-names" type="checkbox" ${this._config?.compact_show_names !== false ? "checked" : ""} />
              <span>Show names</span>
            </label>
            <label class="picker-item">
              <input id="compact-show-age-lifespan" type="checkbox" ${this._config?.compact_show_age_lifespan !== false ? "checked" : ""} />
              <span>Show age/lifespan</span>
            </label>
            <label class="picker-item">
              <input id="compact-show-summary" type="checkbox" ${this._config?.compact_show_summary === true ? "checked" : ""} />
              <span>Show summary</span>
            </label>
            <label class="picker-item">
              <input id="compact-show-urgency" type="checkbox" ${this._config?.compact_show_urgency === true ? "checked" : ""} />
              <span>Show urgency</span>
            </label>
            <label class="picker-item">
              <input id="compact-show-tile-background" type="checkbox" ${this._config?.compact_show_tile_background !== false ? "checked" : ""} />
              <span>Show tile background</span>
            </label>
          </div>
        </div>
        <div class="picker">
          <div class="picker-title">Trackers to display</div>
          <div class="help">Leave all unchecked to use automatic ordering. In compact mode, the first selected four are shown.</div>
          ${this._loading ? `<div class="help">Loading trackers...</div>` : this._trackers.length ? `
            <div class="picker-grid">
              ${this._trackers.map((tracker) => `
                <label class="picker-item">
                  <input type="checkbox" data-slug="${tracker.slug}" ${selected.has(tracker.slug) ? "checked" : ""} />
                  <span>${tracker.title}</span>
                </label>
              `).join("")}
            </div>
          ` : `<div class="help">No trackers available yet.</div>`}
        </div>
      </div>
    `;
    this.shadowRoot.getElementById("title").addEventListener("input", (event) => {
      this._emitConfig({ title: event.target.value });
    });
    this.shadowRoot.getElementById("mode").addEventListener("change", (event) => {
      this._emitConfig({ mode: event.target.value });
    });
    this.shadowRoot.getElementById("compact-count").addEventListener("input", (event) => {
      this._emitConfig({ compact_count: Number(event.target.value || 4) });
    });
    this.shadowRoot.getElementById("compact-show-names").addEventListener("change", (event) => {
      this._emitConfig({ compact_show_names: event.target.checked });
    });
    this.shadowRoot.getElementById("compact-show-age-lifespan").addEventListener("change", (event) => {
      this._emitConfig({ compact_show_age_lifespan: event.target.checked });
    });
    this.shadowRoot.getElementById("compact-show-summary").addEventListener("change", (event) => {
      this._emitConfig({ compact_show_summary: event.target.checked });
    });
    this.shadowRoot.getElementById("compact-show-urgency").addEventListener("change", (event) => {
      this._emitConfig({ compact_show_urgency: event.target.checked });
    });
    this.shadowRoot.getElementById("compact-show-tile-background").addEventListener("change", (event) => {
      this._emitConfig({ compact_show_tile_background: event.target.checked });
    });
    this.shadowRoot.querySelectorAll("[data-slug]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const selectedTrackers = Array.from(this.shadowRoot.querySelectorAll("[data-slug]:checked"))
          .map((item) => item.dataset.slug);
        this._emitConfig({ selected_trackers: selectedTrackers });
      });
    });
  }
}

customElements.define("maintenance-tracker-manager", MaintenanceTrackerManager);
customElements.define("maintenance-tracker-manager-editor", MaintenanceTrackerManagerEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "maintenance-tracker-manager",
  name: "Maintenance Tracker Manager",
  description: "Contained maintenance tracker manager with circular dial cards.",
});
