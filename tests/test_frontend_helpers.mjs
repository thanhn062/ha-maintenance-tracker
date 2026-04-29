import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const registry = new Map();

globalThis.HTMLElement = class {
  attachShadow() {
    this.shadowRoot = {};
    return this.shadowRoot;
  }
  dispatchEvent() {}
};

globalThis.CustomEvent = class {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
};

globalThis.window = {
  customCards: [],
  addEventListener() {},
  removeEventListener() {},
  visualViewport: {
    addEventListener() {},
    removeEventListener() {},
  },
  innerWidth: 1280,
  innerHeight: 720,
};

globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  documentElement: {
    clientWidth: 1280,
    clientHeight: 720,
  },
  createElement(name) {
    const ctor = registry.get(name);
    return ctor ? new ctor() : { tagName: name.toUpperCase() };
  },
};

globalThis.customElements = {
  define(name, ctor) {
    registry.set(name, ctor);
  },
  get(name) {
    return registry.get(name);
  },
};

const moduleUrl = pathToFileURL(
  path.resolve("custom_components/maintenance_tracker/static/maintenance-tracker-manager.js"),
);
await import(moduleUrl.href);

const MaintenanceTrackerManager = registry.get("maintenance-tracker-manager");

test("tracker handle prefers slug and falls back to id", () => {
  const manager = new MaintenanceTrackerManager();
  assert.equal(manager._trackerHandle({ slug: "water_filter", id: "tracker_1" }), "water_filter");
  assert.equal(manager._trackerHandle({ id: "tracker_2" }), "tracker_2");
});

test("sortTrackers orders by urgency, then overdue, then title", () => {
  const manager = new MaintenanceTrackerManager();
  const trackers = [
    { id: "fresh_b", title: "B Task", days_since_done: 1, lifespan_days: 10, days_overdue: 0, days_remaining: 9 },
    { id: "overdue", title: "A Task", days_since_done: 11, lifespan_days: 10, days_overdue: 1, days_remaining: 0 },
    { id: "fresh_a", title: "A Task", days_since_done: 1, lifespan_days: 10, days_overdue: 0, days_remaining: 9 },
  ];
  const sorted = manager._sortTrackers(trackers);
  assert.deepEqual(sorted.map((item) => item.id), ["overdue", "fresh_a", "fresh_b"]);
});

test("delete and reset service calls use the public tracker field", async () => {
  const manager = new MaintenanceTrackerManager();
  const calls = [];
  manager._hass = {
    callService: async (domain, service, payload) => {
      calls.push({ domain, service, payload });
    },
  };
  manager._loadTrackers = async () => {};
  manager._render = () => {};
  manager._showToast = () => {};

  await manager._deleteTracker({ slug: "bedsheets", id: "tracker_1" });
  await manager._resetTracker({ slug: "bedsheets", id: "tracker_1", title: "Bedsheets" });

  assert.deepEqual(calls, [
    {
      domain: "maintenance_tracker",
      service: "delete_tracker",
      payload: { tracker: "bedsheets" },
    },
    {
      domain: "maintenance_tracker",
      service: "reset",
      payload: { tracker: "bedsheets" },
    },
  ]);
});
