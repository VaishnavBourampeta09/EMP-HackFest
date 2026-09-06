import { useEffect, useState } from "react";
import demoUsers from "./data/demo_users.json";
import { DEFAULT_SETTINGS } from "./logic/tripMonitoring.js";

const STORAGE_KEY = "sentinel-state-v4";
const CHANNEL_NAME = "sentinel";

const initialState = {
  users: demoUsers,
  trip: null,
  checkin: null,
  alerts: [],
  locationUpdates: [],
  settings: { ...DEFAULT_SETTINGS },
  // A standing help request. Separate from `alerts` so the teen keeps their own
  // visible state even after the guardian acknowledges the alert.
  sos: null,
  // Hazards reported by people using the app, merged into the map alongside
  // the official City of Redmond feed.
  reports: [],
  simulation: {
    running: false,
    index: 0,
    offRoute: false,
    stopped: false,
    minutesStopped: 0,
    lastTickAt: 0,
  },
};

const safeStorage = typeof window !== "undefined" ? window.localStorage : null;

let state = load();
const listeners = new Set();
const channel =
  typeof window !== "undefined" &&
  typeof window.BroadcastChannel !== "undefined"
    ? new window.BroadcastChannel(CHANNEL_NAME)
    : null;

function load() {
  try {
    const raw = safeStorage ? safeStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return initialState;
    const saved = JSON.parse(raw);
    return {
      ...initialState,
      ...saved,
      settings: { ...initialState.settings, ...(saved.settings || {}) },
      simulation: { ...initialState.simulation, ...(saved.simulation || {}) },
    };
  } catch (error) {
    return initialState;
  }
}

function persist() {
  try {
    if (safeStorage) {
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch (error) {
    return;
  }
}

function emit(broadcast = true) {
  persist();
  if (broadcast && channel) channel.postMessage(state);
  listeners.forEach((listener) => listener(state));
}

if (channel) {
  channel.onmessage = (event) => {
    state = event.data;
    listeners.forEach((listener) => listener(state));
  };
}

export function getState() {
  return state;
}

export function setState(updater) {
  const next = typeof updater === "function" ? updater(state) : updater;
  state = { ...state, ...next };
  emit();
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => subscribe(setSnapshot), []);
  return snapshot;
}

export function resetDemo() {
  state = { ...initialState, settings: state.settings };
  emit();
}

export const createId = (prefix) =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
