class MaintenanceTrackerManager extends HTMLElement {
  static getConfigElement() {
    return document.createElement("maintenance-tracker-manager-editor");
  }

  static getStubConfig() {
    return {
      title: "Maintenance Tracker",
      mode: "manager",
      compact_count: 4,
      visibility_due_days: 3,
      visibility_overdue_days: 10,
      selected_trackers: [],
      compact_show_names: true,
      compact_show_age_lifespan: true,
      compact_show_summary: false,
      compact_show_urgency: false,
      compact_show_tile_background: true,
      compact_show_dial_background: true,
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
    this._allIconOptions = null;
    this._allIconsPromise = null;
    this._compactResetArmedId = null;
    this._eventUnsubscribe = null;
    this._subscribedHass = null;
    this._preview = false;
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

  static get ICON_SEARCH_ALIASES() {
    return {
      "mdi:hammer-wrench": ["maintenance", "repair", "fix", "tools", "service"],
      "mdi:bed": ["bedsheet", "sheet", "sheets", "linen", "blanket", "pillow", "mattress", "bedding"],
      "mdi:curtains": ["curtain", "blinds", "drapes", "shade", "window treatment"],
      "mdi:ceiling-light": ["light", "lamp", "bulb", "fixture"],
      "mdi:fan": ["cooling", "air", "circulate", "vent"],
      "mdi:sofa": ["couch", "living room", "seat"],
      "mdi:vacuum": ["clean", "cleaning", "floor", "carpet", "dust"],
      "mdi:washing-machine": ["laundry", "wash", "washer", "clothes"],
      "mdi:tshirt-crew": ["clothes", "wardrobe", "shirt", "fabric"],
      "mdi:shower": ["bathroom", "bath", "rinse"],
      "mdi:toilet": ["bathroom", "restroom", "wc"],
      "mdi:flower": ["plant", "garden", "bloom"],
      "mdi:fridge-outline": ["refrigerator", "kitchen", "cooling"],
      "mdi:microwave": ["kitchen", "appliance", "oven"],
      "mdi:air-purifier": ["filter", "air", "purifier", "purify"],
      "mdi:spray-bottle": ["clean", "cleaning", "spray", "bottle"],
      "mdi:trash-can-outline": ["trash", "garbage", "bin", "waste", "recycle"],
      "mdi:calendar-check": ["schedule", "due", "date", "plan", "reminder"],
      "mdi:tools": ["toolbox", "gear", "equipment"],
      "mdi:lightbulb": ["light", "bulb", "lamp", "lighting"],
      "mdi:lamp": ["light", "bedside", "lighting"],
      "mdi:door-sliding": ["door", "entry", "patio"],
      "mdi:window-open-variant": ["window", "glass", "screen"],
      "mdi:desk": ["office", "computer", "pc", "workstation", "table"],
      "mdi:toothbrush-paste": ["toothbrush", "toothpaste", "dental", "teeth", "bathroom"],
      "mdi:paw": ["pet", "dog", "cat", "animal", "litter"],
      "mdi:leaf": ["plant", "green", "garden", "foliage"],
      "mdi:water": ["humidifier", "water", "tank", "refill"],
      "mdi:home-heart": ["home", "house", "care"],
      "mdi:broom": ["sweep", "sweeping", "clean", "cleaning", "floor"],
    };
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
    this._ensureEventSubscription();
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
    this._ensureEventSubscription();
    this._render();
  }

  disconnectedCallback() {
    this._teardownEventSubscription();
  }

  getCardSize() {
    return Math.max(3, Math.ceil((this._trackers?.length || 1) * 1.5));
  }

  get preview() {
    return this._preview;
  }

  set preview(value) {
    this._preview = value === true;
    this._render();
  }

  async _callWS(type, payload = {}) {
    return this._hass.callWS({ type, ...payload });
  }

  _ensureEventSubscription() {
    if (!this._hass?.connection) return;
    if (this._subscribedHass === this._hass && this._eventUnsubscribe) return;
    this._teardownEventSubscription();
    this._subscribedHass = this._hass;
    this._hass.connection.subscribeEvents(
      () => {
        this._lastLoadedAt = 0;
        this._loadTrackers();
      },
      "maintenance_tracker_updated",
    ).then((unsubscribe) => {
      if (this._subscribedHass !== this._hass) {
        unsubscribe?.();
        return;
      }
      this._eventUnsubscribe = unsubscribe;
    }).catch(() => {});
  }

  _teardownEventSubscription() {
    if (this._eventUnsubscribe) {
      this._eventUnsubscribe();
    }
    this._eventUnsubscribe = null;
    this._subscribedHass = null;
  }

  _showToast(message) {
    if (!message) return;
    this.dispatchEvent(new CustomEvent("hass-notification", {
      detail: { message },
      bubbles: true,
      composed: true,
    }));
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
      ? (() => {
          const trackerMap = new Map(
            this._trackers.map((tracker) => [(`${tracker.slug || tracker.id || ""}`.toLowerCase()), tracker])
          );
          return selected
            .map((item) => trackerMap.get(`${item}`.trim().toLowerCase()))
            .filter(Boolean);
        })()
      : [...this._trackers];
    if (this._config.mode === "compact" || this._config.mode === "badge") {
      const dueDays = Math.max(0, Number(this._config.visibility_due_days ?? 3));
      const overdueDays = Math.max(0, Number(this._config.visibility_overdue_days ?? 10));
      const filtered = visible.filter((tracker) => {
        const trackerOverdueDays = Math.max(0, Number(tracker.days_overdue || 0));
        if (trackerOverdueDays > 0) return trackerOverdueDays <= overdueDays;
        const daysRemaining = Math.max(0, Number(tracker.days_remaining || 0));
        return daysRemaining <= dueDays;
      });
      const compactCount = Math.max(1, Math.min(Number(this._config.compact_count || 4), 8));
      return filtered.slice(0, compactCount);
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
    return `in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
  }

  _openDialog(mode, tracker = null) {
    const localToday = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
    const trackerState = tracker
      ? { ...tracker }
      : {
          title: "",
          slug: "",
          icon: "mdi:hammer-wrench",
          lifespan_days: 14,
          last_done: localToday,
          notes: "",
          category: "",
        };
    this._dialog = {
      mode,
      tracker: trackerState,
      iconQuery: this._iconLabel(trackerState.icon || "mdi:hammer-wrench"),
      iconPickerOpen: false,
      iconPickerMode: "common",
      allIconsLoading: false,
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

  _normalizeIconQuery(value) {
    return `${value || ""}`
      .trim()
      .toLowerCase()
      .replace(/^mdi:/, "")
      .replace(/[_-]+/g, " ");
  }

  _iconLabel(icon) {
    return `${icon || ""}`
      .trim()
      .toLowerCase()
      .replace(/^mdi:/, "")
      .replace(/[_-]+/g, " ");
  }

  _iconDisplayLabel(icon) {
    return this._iconLabel(icon).replace(/\b\w/g, (match) => match.toUpperCase());
  }

  async _ensureAllIconsLoaded() {
    if (Array.isArray(this._allIconOptions) && this._allIconOptions.length) {
      return this._allIconOptions;
    }
    if (this._allIconsPromise) {
      return this._allIconsPromise;
    }

    this._allIconsPromise = fetch(new URL("./mdi-icons.json", import.meta.url))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`mdi icon catalog fetch failed: ${response.status}`);
        }
        return response.json();
      })
      .then((icons) => {
        const normalized = Array.isArray(icons)
          ? icons
            .map((icon) => `${icon || ""}`.trim())
            .filter(Boolean)
            .map((icon) => (icon.startsWith("mdi:") ? icon : `mdi:${icon}`))
          : [];
        this._allIconOptions = normalized.length ? normalized : MaintenanceTrackerManager.ICON_OPTIONS;
        return this._allIconOptions;
      })
      .catch(() => {
        this._allIconOptions = MaintenanceTrackerManager.ICON_OPTIONS;
        return this._allIconOptions;
      })
      .finally(() => {
        this._allIconsPromise = null;
      });

    return this._allIconsPromise;
  }

  _iconSearchTerms(icon) {
    const label = this._iconLabel(icon);
    const slug = label.replace(/\s+/g, "-");
    const compact = label.replace(/\s+/g, "");
    const aliases = MaintenanceTrackerManager.ICON_SEARCH_ALIASES[icon] || [];
    return [label, slug, compact, ...aliases.map((alias) => this._normalizeIconQuery(alias))];
  }

  _fuzzyMatches(term, token) {
    if (!token) return true;
    if (!term) return false;
    if (term.includes(token)) return true;
    let index = 0;
    for (const char of term) {
      if (char === token[index]) index += 1;
      if (index === token.length) return true;
    }
    return false;
  }

  _matchesIconQuery(icon, query) {
    const cleaned = this._normalizeIconQuery(query);
    if (!cleaned) return true;
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const terms = this._iconSearchTerms(icon);
    return tokens.every((token) => terms.some((term) => this._fuzzyMatches(term, token)));
  }

  _allIconMatches(query) {
    const icons = Array.isArray(this._allIconOptions) && this._allIconOptions.length
      ? this._allIconOptions
      : MaintenanceTrackerManager.ICON_OPTIONS;
    const matches = icons.filter((icon) => this._matchesIconQuery(icon, query));
    if (this._normalizeIconQuery(query)) {
      return matches.slice(0, 240);
    }
    return matches.slice(0, 160);
  }

  _syncDialogTrackerFromForm() {
    if (!this._dialog || !this.shadowRoot) return;
    const titleInput = this.shadowRoot.querySelector('input[name="title"]');
    const lifespanInput = this.shadowRoot.querySelector('input[name="lifespan_days"]');
    const lastDoneInput = this.shadowRoot.querySelector('input[name="last_done"]');
    const categoryInput = this.shadowRoot.querySelector('input[name="category"]');
    const notesInput = this.shadowRoot.querySelector('textarea[name="notes"]');
    if (titleInput) this._dialog.tracker.title = titleInput.value;
    if (lifespanInput) this._dialog.tracker.lifespan_days = Number(lifespanInput.value || 14);
    if (lastDoneInput) this._dialog.tracker.last_done = lastDoneInput.value;
    if (categoryInput) this._dialog.tracker.category = categoryInput.value;
    if (notesInput) this._dialog.tracker.notes = notesInput.value;
  }

  _keepFieldVisible(field) {
    if (!field) return;
    const scrollIntoView = () => {
      field.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
    };
    requestAnimationFrame(() => {
      setTimeout(scrollIntoView, 120);
      setTimeout(scrollIntoView, 320);
    });
  }

  _bindDialogFieldFocus(field, { preventEnterSubmit = false } = {}) {
    if (!field) return;
    field.addEventListener("focus", () => {
      this._keepFieldVisible(field);
    });
    if (preventEnterSubmit) {
      field.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
      });
    }
  }

  _rerenderDialogAndRestoreIconInput(selectionStart = null, selectionEnd = null) {
    this._syncDialogTrackerFromForm();
    this._render();
    requestAnimationFrame(() => {
      const nextInput = this.shadowRoot?.querySelector('input[name="icon"]');
      if (!nextInput) return;
      nextInput.focus();
      const end = nextInput.value.length;
      const startPos = selectionStart == null ? end : Math.min(selectionStart, end);
      const endPos = selectionEnd == null ? end : Math.min(selectionEnd, end);
      nextInput.setSelectionRange(startPos, endPos);
    });
  }

  _resolveIconValue(value, fallback = "mdi:hammer-wrench") {
    const raw = `${value || ""}`.trim();
    if (!raw) return fallback || "mdi:hammer-wrench";
    if (raw.includes(":")) return raw;
    const slug = raw
      .toLowerCase()
      .replace(/[_\s]+/g, "-")
      .replace(/[^a-z0-9-]+/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    const candidate = `mdi:${slug}`;
    return MaintenanceTrackerManager.ICON_OPTIONS.includes(candidate) ? candidate : (fallback || candidate);
  }

  _filteredIcons(query) {
    const icons = MaintenanceTrackerManager.ICON_OPTIONS;
    return icons.filter((icon) => this._matchesIconQuery(icon, query));
  }

  _groupedIcons(query) {
    const groups = MaintenanceTrackerManager.ICON_GROUPS.map((group) => ({
      label: group.label,
      icons: group.icons.filter((icon) => this._matchesIconQuery(icon, query)),
    })).filter((group) => group.icons.length);

    if (groups.length || !this._normalizeIconQuery(query)) return groups;
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
      icon: this._resolveIconValue(`${data.get("icon") || ""}`.trim(), this._dialog?.tracker?.icon),
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
      this._showToast(`${tracker.title} reset.`);
    } catch (err) {
      this._error = err?.message || String(err);
      this._render();
    }
  }

  _clearCompactResetArm() {
    this._compactResetArmedId = null;
  }

  async _handleCompactTrackerTap(tracker) {
    if (!tracker) return;
    if (this._compactResetArmedId === tracker.id) {
      this._compactResetArmedId = null;
      await this._resetTracker(tracker);
      return;
    }
    this._compactResetArmedId = tracker.id;
    this._render();
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
        : this._summaryText(tracker).replace(/^in /, "In ");
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
              <span>Age: ${ageDays} day${ageDays === 1 ? "" : "s"}</span>
              <span>Lifespan: ${lifespanDays} day${lifespanDays === 1 ? "" : "s"}</span>
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
    const showDialBackground = this._config.compact_show_dial_background !== false;
    const isResetArmed = this._compactResetArmedId === tracker.id;
    const compactIcon = isResetArmed ? "mdi:refresh" : (tracker.icon || "mdi:hammer-wrench");
    const compactIconColor = isResetArmed ? "#ffffff" : urgency.color;
    const compactCenterFillBg = isResetArmed ? "#d9485f" : null;
    return `
      <button class="compact-tile ${showTileBackground ? "compact-tile-surface" : "compact-tile-plain"}" title="${isResetArmed ? `Tap again to reset ${tracker.title}` : `${tracker.title}: ${tracker.days_since_done} day${tracker.days_since_done === 1 ? "" : "s"} passed, ${urgency.label}`}" data-compact-id="${tracker.id}">
        <div class="compact-dial-wrap ${showDialBackground ? "compact-dial-wrap-solid" : "compact-dial-wrap-transparent"}" style="--tracker-color:${urgency.color};--tracker-accent:${urgency.accent};">
          <svg class="compact-dial" viewBox="0 0 60 60" aria-hidden="true">
            <circle class="dial-bg" cx="30" cy="30" r="24"></circle>
            <circle class="dial-progress" cx="30" cy="30" r="24" style="stroke:${urgency.color};stroke-dasharray:${circumference};stroke-dashoffset:${dashOffset};"></circle>
          </svg>
          <div class="compact-dial-center">
            <div class="compact-dial-center-fill" style="color:${compactIconColor};${compactCenterFillBg ? `background:${compactCenterFillBg};` : ""}">
              <ha-icon icon="${compactIcon}"></ha-icon>
            </div>
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

  _renderVisibilityEmptyState(mode) {
    const modeLabel = mode === "badge" ? "badge" : "compact";
    return `
      <div class="empty-state empty-state-visibility empty-state-${modeLabel}">
        <div class="empty-state-icon">
          <ha-icon icon="mdi:calendar-check-outline"></ha-icon>
        </div>
        <div class="empty-state-copy">
          <div class="empty-state-title">Maintenance Task</div>
          <div class="empty-state-detail">No tasks are due in the current visibility window.</div>
        </div>
      </div>
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
    const iconPickerMode = this._dialog.iconPickerMode || "common";
    const groupedIcons = iconPickerMode === "all" ? [] : this._groupedIcons("");
    const allIcons = iconPickerMode === "all" ? this._allIconMatches(this._dialog.iconQuery) : [];
    const hasQuery = Boolean(this._normalizeIconQuery(this._dialog.iconQuery));
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
                <input name="icon" id="icon-search-input" value="${this._dialog.iconQuery || ""}" placeholder="Search icons" autocomplete="off" autocapitalize="off" spellcheck="false" />
                <div class="icon-picker-actions">
                  <button type="button" class="action ${iconPickerMode === "common" ? "action-primary" : ""}" id="show-common-icons">Common icons</button>
                  <button type="button" class="action ${iconPickerMode === "all" ? "action-primary" : ""}" id="show-all-icons">All Icons</button>
                </div>
              </div>
              ${this._dialog.iconPickerOpen ? `
                <div class="icon-picker-panel">
                  <div class="icon-picker-help">${this._dialog.allIconsLoading
                    ? "Loading the full Material Design Icons catalog..."
                    : iconPickerMode === "all"
                      ? (hasQuery
                        ? "Search results from the full Material Design Icons catalog."
                        : "Press Enter in the search field to search all icons.")
                      : "Common icons for common tasks. This list stays fixed; press Enter in the search field to search all icons."}</div>
                  ${iconPickerMode === "all" ? `
                    ${allIcons.length ? `
                      <div class="icon-grid icon-grid-all">
                        ${allIcons.map((icon) => `
                          <button type="button" class="icon-tile ${icon === tracker.icon ? "icon-tile-active" : ""}" data-icon-choice="${icon}">
                            <ha-icon icon="${icon}"></ha-icon>
                            <span>${this._iconDisplayLabel(icon)}</span>
                          </button>
                        `).join("")}
                      </div>
                    ` : `<div class="icon-empty">No icons match that search.</div>`}
                  ` : groupedIcons.length ? groupedIcons.map((group) => `
                    <div class="icon-group">
                      <div class="icon-group-label">${group.label}</div>
                      <div class="icon-grid">
                        ${group.icons.map((icon) => `
                          <button type="button" class="icon-tile ${icon === tracker.icon ? "icon-tile-active" : ""}" data-icon-choice="${icon}">
                            <ha-icon icon="${icon}"></ha-icon>
                            <span>${this._iconDisplayLabel(icon)}</span>
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
            <div class="dialog-bottom-spacer" aria-hidden="true"></div>
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
    const hideForVisibility = (isCompact || isBadge) && !displayTrackers.length && this._preview !== true;
    this.style.display = hideForVisibility ? "none" : "block";

    if (hideForVisibility) {
      this.shadowRoot.innerHTML = `<style>:host{display:none;}</style>`;
      return;
    }

    const compactMarkup = displayTrackers.length
      ? displayTrackers.map((tracker) => this._renderCompactTracker(tracker)).join("")
      : this._renderVisibilityEmptyState("compact");
    const badgeMarkup = displayTrackers.length
      ? displayTrackers.map((tracker) => this._renderBadgeTracker(tracker)).join("")
      : this._renderVisibilityEmptyState("badge");

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
        }
        .compact-dial-wrap-solid {
          --compact-dial-track-bg: rgba(52, 58, 68, 0.88);
          --compact-dial-center-bg: rgba(18, 22, 28, 0.94);
        }
        .compact-dial-wrap-transparent {
          --compact-dial-track-bg: rgba(18, 22, 28, 0.22);
          --compact-dial-center-bg: rgba(18, 22, 28, 0.42);
        }
        .compact-dial {
          width: 60px;
          height: 60px;
          transform: rotate(-90deg);
        }
        .compact-dial .dial-bg {
          stroke: var(--compact-dial-track-bg, rgba(18, 22, 28, 0.36));
        }
        .compact-dial-center {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .compact-dial-center-fill {
          width: 36px;
          height: 36px;
          border-radius: 999px;
          background: var(--compact-dial-center-bg, rgba(18, 22, 28, 0.88));
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--tracker-color);
        }
        .compact-dial-center-fill ha-icon {
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
          color: var(--primary-text-color);
        }
        .compact-summary {
          font-size: 0.66rem;
          color: var(--primary-text-color);
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
        .dialog-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-items: stretch;
          flex-wrap: unset;
        }
        .dialog-bottom-spacer {
          height: 280px;
          pointer-events: none;
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
        .empty-state-visibility {
          border: 1px dashed rgba(127,127,127,0.22);
          min-height: 74px;
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--primary-text-color);
          background: color-mix(in srgb, var(--card-background-color, #1c1f24) 72%, transparent);
        }
        .empty-state-compact,
        .empty-state-badge {
          grid-column: 1 / -1;
          width: 100%;
          box-sizing: border-box;
        }
        .empty-state-icon {
          width: 34px;
          height: 34px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(42,157,143,0.14);
          color: #2a9d8f;
        }
        .empty-state-icon ha-icon {
          --mdc-icon-size: 18px;
        }
        .empty-state-copy {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .empty-state-title {
          font-size: 0.9rem;
          font-weight: 600;
          line-height: 1.2;
        }
        .empty-state-detail {
          font-size: 0.78rem;
          line-height: 1.3;
          color: var(--secondary-text-color);
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
          padding: 36px 16px 20px;
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
          max-height: calc(100dvh - 56px);
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
          grid-template-columns: auto 1fr;
          grid-template-areas:
            "preview input"
            "actions actions";
          gap: 8px;
          align-items: center;
        }
        .icon-picker-preview {
          grid-area: preview;
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
        #icon-search-input {
          grid-area: input;
          min-width: 0;
        }
        .icon-picker-actions {
          grid-area: actions;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
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
        .icon-grid-all {
          max-height: min(44dvh, 420px);
          overflow-y: auto;
          padding-right: 4px;
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
          .compact-dial-center-fill {
            width: 32px;
            height: 32px;
          }
          .compact-dial-center-fill ha-icon {
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
            padding: 24px 10px 14px;
          }
          .dialog {
            max-height: calc(100dvh - 36px);
            border-radius: 18px;
          }
          .dialog-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr));
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
      this._clearCompactResetArm();
      this._openDialog("create");
    });
    this.shadowRoot.addEventListener("click", (event) => {
      if (!this._compactResetArmedId) return;
      const armedTile = event.target.closest?.(`[data-compact-id="${this._compactResetArmedId}"]`);
      if (armedTile) return;
      this._clearCompactResetArm();
      requestAnimationFrame(() => this._render());
    }, { capture: true });
    this.shadowRoot.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        this._clearCompactResetArm();
        const tracker = this._trackers.find((item) => item.id === button.dataset.id);
        if (!tracker) return;
        const action = button.dataset.action;
        if (action === "edit") this._openDialog("edit", tracker);
        if (action === "delete") this._deleteTracker(tracker);
        if (action === "reset") this._resetTracker(tracker);
      });
    });
    this.shadowRoot.querySelectorAll("[data-compact-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const tracker = this._trackers.find((item) => item.id === button.dataset.compactId);
        if (!tracker) return;
        this._handleCompactTrackerTap(tracker);
      });
    });
    this.shadowRoot.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        this._clearCompactResetArm();
        this._closeDialog();
      });
    });
    this.shadowRoot.getElementById("tracker-form")?.addEventListener("submit", (event) => {
      this._submitDialog(event);
    });
    const titleInput = this.shadowRoot.querySelector('input[name="title"]');
    const iconInput = this.shadowRoot.querySelector('input[name="icon"]');
    const previewTitle = this.shadowRoot.querySelector(".dialog-preview-title");
    const previewIcon = this.shadowRoot.querySelector(".dialog-preview-center ha-icon");
    const iconBarPreview = this.shadowRoot.querySelector(".icon-picker-preview ha-icon");
    const showCommonIcons = this.shadowRoot.getElementById("show-common-icons");
    const showAllIcons = this.shadowRoot.getElementById("show-all-icons");
    const applyIconFilter = (query) => {
      if (this._dialog?.iconPickerMode === "all") {
        const allTiles = Array.from(this.shadowRoot.querySelectorAll(".icon-grid-all .icon-tile"));
        if (!allTiles.length) {
          this._rerenderDialogAndRestoreIconInput(iconInput?.selectionStart, iconInput?.selectionEnd);
          return;
        }
        let visibleCount = 0;
        allTiles.forEach((tile) => {
          const icon = tile.dataset.iconChoice || "";
          const visible = this._matchesIconQuery(icon, query);
          tile.hidden = !visible;
          if (visible) visibleCount += 1;
        });
        const emptyState = this.shadowRoot.querySelector(".icon-empty");
        if (emptyState) {
          emptyState.hidden = visibleCount > 0;
        }
        return;
      }
      this.shadowRoot.querySelectorAll(".icon-group").forEach((group) => {
        let visibleCount = 0;
        group.querySelectorAll(".icon-tile").forEach((tile) => {
          const icon = tile.dataset.iconChoice || "";
          const visible = this._matchesIconQuery(icon, query);
          tile.hidden = !visible;
          if (visible) visibleCount += 1;
        });
        group.hidden = visibleCount === 0;
      });
      const emptyState = this.shadowRoot.querySelector(".icon-empty");
      if (emptyState) {
        const hasVisible = Array.from(this.shadowRoot.querySelectorAll(".icon-tile")).some((tile) => !tile.hidden);
        emptyState.hidden = hasVisible;
      }
    };
    if (titleInput && previewTitle) {
      this._bindDialogFieldFocus(titleInput, { preventEnterSubmit: true });
      titleInput.addEventListener("input", () => {
        if (this._dialog) {
          this._dialog.tracker.title = titleInput.value;
        }
        previewTitle.textContent = titleInput.value.trim() || "Tracker title";
      });
    }
    const lifespanInput = this.shadowRoot.querySelector('input[name="lifespan_days"]');
    this._bindDialogFieldFocus(lifespanInput, { preventEnterSubmit: true });
    lifespanInput?.addEventListener("input", () => {
      if (this._dialog) {
        this._dialog.tracker.lifespan_days = Number(lifespanInput.value || 14);
      }
    });
    const lastDoneInput = this.shadowRoot.querySelector('input[name="last_done"]');
    this._bindDialogFieldFocus(lastDoneInput, { preventEnterSubmit: true });
    lastDoneInput?.addEventListener("input", () => {
      if (this._dialog) {
        this._dialog.tracker.last_done = lastDoneInput.value;
      }
    });
    const categoryInput = this.shadowRoot.querySelector('input[name="category"]');
    this._bindDialogFieldFocus(categoryInput, { preventEnterSubmit: true });
    categoryInput?.addEventListener("input", () => {
      if (this._dialog) {
        this._dialog.tracker.category = categoryInput.value;
      }
    });
    const notesInput = this.shadowRoot.querySelector('textarea[name="notes"]');
    this._bindDialogFieldFocus(notesInput);
    notesInput?.addEventListener("input", () => {
      if (this._dialog) {
        this._dialog.tracker.notes = notesInput.value;
      }
    });
    if (iconInput && previewIcon) {
      this._bindDialogFieldFocus(iconInput);
      iconInput.addEventListener("input", () => {
        if (!this._dialog) return;
        this._syncDialogTrackerFromForm();
        this._dialog.iconQuery = iconInput.value.trim();
      });
      iconInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        if (!this._dialog) return;
        this._syncDialogTrackerFromForm();
        const selectionStart = iconInput.selectionStart;
        const selectionEnd = iconInput.selectionEnd;
        this._dialog.iconQuery = iconInput.value.trim();
        this._dialog.iconPickerOpen = true;
        this._dialog.iconPickerMode = "all";
        if (!this._allIconOptions && !this._dialog.allIconsLoading) {
          this._dialog.allIconsLoading = true;
          this._rerenderDialogAndRestoreIconInput(selectionStart, selectionEnd);
          void this._ensureAllIconsLoaded().then(() => {
            if (!this._dialog) return;
            this._dialog.allIconsLoading = false;
            this._rerenderDialogAndRestoreIconInput(selectionStart, selectionEnd);
            requestAnimationFrame(() => {
              this.shadowRoot?.querySelector('input[name="icon"]')?.blur();
            });
          });
          return;
        }
        this._rerenderDialogAndRestoreIconInput(selectionStart, selectionEnd);
        requestAnimationFrame(() => {
          this.shadowRoot?.querySelector('input[name="icon"]')?.blur();
        });
      });
    }
    showCommonIcons?.addEventListener("click", () => {
      if (!this._dialog) return;
      this._syncDialogTrackerFromForm();
      this._dialog.iconPickerOpen = true;
      this._dialog.iconPickerMode = "common";
      this._render();
    });
    showAllIcons?.addEventListener("click", () => {
      if (!this._dialog) return;
      this._syncDialogTrackerFromForm();
      this._dialog.iconPickerOpen = true;
      this._dialog.iconPickerMode = "all";
      if (!this._allIconOptions && !this._dialog.allIconsLoading) {
        this._dialog.allIconsLoading = true;
        this._render();
        void this._ensureAllIconsLoaded().then(() => {
          if (!this._dialog) return;
          this._dialog.allIconsLoading = false;
          this._render();
        });
        return;
      }
      this._render();
    });
    this.shadowRoot.querySelectorAll("[data-icon-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        const icon = button.dataset.iconChoice;
        if (!iconInput || !this._dialog) return;
        this._dialog.tracker.icon = icon;
        this._dialog.iconQuery = this._iconLabel(icon);
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
      visibility_due_days: 3,
      visibility_overdue_days: 10,
      selected_trackers: [],
      compact_show_names: true,
      compact_show_age_lifespan: true,
      compact_show_summary: false,
      compact_show_urgency: false,
      compact_show_tile_background: true,
      compact_show_dial_background: true,
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
          <div class="picker-title">Visibility</div>
          <label>
            Show when due within days
            <input id="visibility-due-days" type="number" min="0" max="3650" value="${Number(this._config?.visibility_due_days ?? 3)}" />
          </label>
          <label>
            Show while overdue up to days
            <input id="visibility-overdue-days" type="number" min="0" max="3650" value="${Number(this._config?.visibility_overdue_days ?? 10)}" />
          </label>
        </div>
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
            <label class="picker-item">
              <input id="compact-show-dial-background" type="checkbox" ${this._config?.compact_show_dial_background !== false ? "checked" : ""} />
              <span>Show dial surfaces</span>
            </label>
          </div>
        </div>
        <div class="picker">
          <div class="picker-title">Trackers to display</div>
          <div class="help">Leave all unchecked to use automatic ordering. In compact mode, selected trackers keep the order you choose and the first visible ${Number(this._config?.compact_count || 4)} are shown.</div>
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
    this.shadowRoot.getElementById("compact-count").addEventListener("change", (event) => {
      this._emitConfig({ compact_count: Number(event.target.value || 4) });
    });
    this.shadowRoot.getElementById("visibility-due-days").addEventListener("change", (event) => {
      this._emitConfig({ visibility_due_days: Number(event.target.value || 0) });
    });
    this.shadowRoot.getElementById("visibility-overdue-days").addEventListener("change", (event) => {
      this._emitConfig({ visibility_overdue_days: Number(event.target.value || 0) });
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
    this.shadowRoot.getElementById("compact-show-dial-background").addEventListener("change", (event) => {
      this._emitConfig({ compact_show_dial_background: event.target.checked });
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
