export function normalizeAddress(value) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter a URL.");

  const isHostWithPort = /^(?:\[[^\]]+\]|[^\s/?#:\[\]]+):\d+(?:[/?#]|$)/.test(
    trimmed,
  );
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) && !isHostWithPort;
  const normalized = hasScheme ? trimmed : `https://${trimmed}`;
  const url = new URL(normalized);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS addresses are supported.");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not accepted.");
  }
  return url.href;
}

export function parseAddressInput(value) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter a URL or search terms.");

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
  const isHostWithPort = /^(?:\[[^\]]+\]|[^\s/?#:\[\]]+):\d+(?:[/?#]|$)/.test(
    trimmed,
  );
  const hostname =
    /^(?:localhost|(?:[a-z\d-]+\.)+[a-z\d-]{2,}|(?:\d{1,3}\.){3}\d{1,3}|\[[a-f\d:]+\])(?::\d+)?(?:[/?#][^\s]*)?$/i;
  if (!hasScheme && !isHostWithPort && !hostname.test(trimmed)) {
    return { type: "search", query: trimmed };
  }
  return { type: "url", url: normalizeAddress(trimmed) };
}

export function shouldSkipNavigation(url, currentUrl, inFlightUrl) {
  return (
    url === currentUrl || (inFlightUrl !== undefined && url === inFlightUrl)
  );
}

export class NavigationHistory {
  entries = [];
  index = -1;

  get current() {
    return this.entries[this.index];
  }

  get canGoBack() {
    return this.index > 0;
  }

  get canGoForward() {
    return this.index >= 0 && this.index < this.entries.length - 1;
  }

  push(url) {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(url);
    this.index = this.entries.length - 1;
  }

  replace(url) {
    if (this.index < 0) this.entries.push(url);
    else this.entries[this.index] = url;
    this.index = this.entries.length - 1;
  }

  go(delta) {
    const next = this.index + delta;
    if (next < 0 || next >= this.entries.length) return undefined;
    this.index = next;
    return this.current;
  }
}
