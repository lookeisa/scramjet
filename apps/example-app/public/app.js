import {
  NavigationHistory,
  parseAddressInput,
  shouldSkipNavigation,
} from "./navigation.js";

const form = document.querySelector("#address-form");
const address = document.querySelector("#address");
const viewer = document.querySelector("#viewer");
const loading = document.querySelector("#loading");
const loadingText = document.querySelector("#loading-text");
const errorPanel = document.querySelector("#error");
const errorTitle = document.querySelector("#error-title");
const errorDetail = document.querySelector("#error-detail");
const backButton = document.querySelector("#back");
const forwardButton = document.querySelector("#forward");
const settingsButton = document.querySelector("#settings-button");
const settingsDialog = document.querySelector("#settings");
const homepageSelect = document.querySelector("#homepage");
const history = new NavigationHistory();
const preferencesKey = "fractal.example.preferences";
const defaultPreferences = { homepage: "fixture" };

function readPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(preferencesKey) ?? "{}");
    return {
      homepage: stored.homepage === "blank" ? "blank" : "fixture",
    };
  } catch {
    return { ...defaultPreferences };
  }
}

const preferences = readPreferences();

let config;
let activeController;
let activeNavigationId;
let activeNavigationUrl;
let currentNavigationId;
let sequence = 0;

function renderHistoryControls() {
  backButton.disabled = !history.canGoBack;
  forwardButton.disabled = !history.canGoForward;
}

function showLoading(message = "Requesting through Fractal...") {
  loadingText.textContent = message;
  loading.hidden = false;
  errorPanel.hidden = true;
}

function showError(title, detail) {
  loading.hidden = true;
  viewer.hidden = true;
  errorTitle.textContent = title;
  errorDetail.textContent = detail;
  errorPanel.hidden = false;
}

async function postJson(path, value, signal) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Fractal-Example-Token": config.csrfToken,
    },
    body: JSON.stringify(value),
    signal,
  });
  const result = await response.json();
  return { response, result };
}

function notifyCancel(navigationId) {
  if (!navigationId) return;
  void fetch("/api/cancel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Fractal-Example-Token": config.csrfToken,
    },
    body: JSON.stringify({ navigationId }),
  }).catch(() => {});
}

async function navigate(rawAddress, historyMode = "push") {
  let destination;
  try {
    destination = parseAddressInput(rawAddress);
  } catch (error) {
    showError("That address is invalid.", error.message);
    return;
  }
  if (destination.type === "search") {
    showError(
      "DuckDuckGo search is unavailable.",
      "This local example has no secure remote-navigation gateway. The query was not sent.",
    );
    return;
  }
  const normalized = destination.url;
  if (
    historyMode === "push" &&
    shouldSkipNavigation(
      normalized,
      history.current,
      activeController && !activeController.signal.aborted
        ? activeNavigationUrl
        : undefined,
    )
  )
    return;

  const requestSequence = ++sequence;
  activeController?.abort();
  notifyCancel(activeNavigationId);
  const navigationId = crypto.randomUUID();
  activeNavigationId = navigationId;
  activeNavigationUrl = normalized;
  activeController = new AbortController();
  address.value = normalized;
  showLoading();

  try {
    const { response, result } = await postJson(
      "/api/navigate",
      { navigationId, url: normalized },
      activeController.signal,
    );
    if (requestSequence !== sequence) return;
    if (!response.ok || !result.ok) {
      showError(
        "Fractal could not load that address.",
        result.error ?? "The request was rejected by the local example policy.",
      );
      return;
    }

    if (historyMode === "push") history.push(result.finalUrl);
    else if (historyMode === "replace") history.replace(result.finalUrl);
    address.value = result.finalUrl;
    currentNavigationId = result.navigationId;
    viewer.hidden = false;
    viewer.src = result.framePath;
    renderHistoryControls();
  } catch (error) {
    if (requestSequence !== sequence || error.name === "AbortError") return;
    showError(
      "Fractal could not load that address.",
      "The local request failed or timed out.",
    );
  } finally {
    if (requestSequence === sequence) {
      activeNavigationUrl = undefined;
      if (viewer.hidden) loading.hidden = true;
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void navigate(address.value);
});

backButton.addEventListener("click", () => {
  const target = history.go(-1);
  if (target) void navigate(target, "none");
  renderHistoryControls();
});

forwardButton.addEventListener("click", () => {
  const target = history.go(1);
  if (target) void navigate(target, "none");
  renderHistoryControls();
});

document.querySelector("#reload").addEventListener("click", () => {
  if (history.current) void navigate(history.current, "replace");
});

settingsButton.addEventListener("click", () => {
  settingsDialog.showModal();
  homepageSelect.value = preferences.homepage;
  void refreshDiagnostics();
});

document.querySelector("#settings-close").addEventListener("click", () => {
  settingsDialog.close();
});

homepageSelect.addEventListener("change", () => {
  preferences.homepage = homepageSelect.value;
  localStorage.setItem(preferencesKey, JSON.stringify(preferences));
});

document.querySelector("#diagnostics-refresh").addEventListener("click", () => {
  void refreshDiagnostics();
});

async function refreshDiagnostics() {
  const status = document.querySelector("#runtime-status");
  try {
    const response = await fetch("/api/diagnostics");
    if (!response.ok) throw new Error("Fractal diagnostics unavailable");
    const diagnostics = await response.json();
    status.textContent = "Connected to the loopback example runtime";
    document.querySelector("#transport-status").textContent =
      `${diagnostics.transport.kind} · ${diagnostics.transport.status}`;
    document.querySelector("#request-count").textContent = String(
      diagnostics.runtime.refract_requests_total,
    );
    document.querySelector("#cache-count").textContent = String(
      diagnostics.runtime.refract_cache_hits_total,
    );
    document.querySelector("#failure-count").textContent = String(
      diagnostics.runtime.refract_request_failures_total,
    );
  } catch {
    status.textContent = "Fractal runtime is unavailable";
  }
}

viewer.addEventListener("load", () => {
  const match = viewer.src.match(/\/__fractal\/view\/([0-9a-f-]{36})\//i);
  if (!match || match[1] !== currentNavigationId) return;
  loading.hidden = true;
  errorPanel.hidden = true;
  void postJson("/api/navigation-complete", {
    navigationId: currentNavigationId,
  }).catch(() => {});
});

window.addEventListener("message", (event) => {
  if (event.source !== viewer.contentWindow || event.origin !== "null") return;
  if (
    event.data?.type !== "fractal-fixture-navigate" ||
    typeof event.data.path !== "string"
  )
    return;
  const match = event.data.path.match(
    /^\/__fractal\/view\/[0-9a-f-]{36}(\/fixture\/(?:index|next)\.html)$/i,
  );
  if (!match || !config) return;
  void navigate(`${config.fixtureOrigin}${match[1]}`);
});

async function start() {
  try {
    const response = await fetch("/api/config");
    config = await response.json();
    homepageSelect.value = preferences.homepage;
    if (preferences.homepage === "fixture") {
      address.value = config.fixtureUrl;
      await navigate(config.fixtureUrl);
    }
  } catch {
    showError(
      "Fractal is unavailable.",
      "The example server could not initialize its local fixture.",
    );
  }
}

void start();
