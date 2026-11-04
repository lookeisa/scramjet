import assert from "node:assert/strict";
import test from "node:test";
import {
  NavigationHistory,
  normalizeAddress,
  parseAddressInput,
  shouldSkipNavigation,
} from "../public/navigation.js";

test("normalizes host input and preserves explicit HTTP URLs", () => {
  assert.equal(normalizeAddress("example.com"), "https://example.com/");
  assert.equal(normalizeAddress("localhost:3001"), "https://localhost:3001/");
  assert.equal(
    normalizeAddress("http://127.0.0.1:3001/fixture/"),
    "http://127.0.0.1:3001/fixture/",
  );
});

test("distinguishes URL input from DuckDuckGo search terms", () => {
  assert.deepEqual(parseAddressInput("example.com"), {
    type: "url",
    url: "https://example.com/",
  });
  assert.deepEqual(parseAddressInput("browser proxy research"), {
    type: "search",
    query: "browser proxy research",
  });
  assert.deepEqual(parseAddressInput("fractal"), {
    type: "search",
    query: "fractal",
  });
});

test("rejects malformed, unsupported, and credential-bearing addresses", () => {
  assert.throws(() => normalizeAddress("http://["), /Invalid URL/);
  assert.throws(() => normalizeAddress("file:///etc/passwd"), /HTTP and HTTPS/);
  assert.throws(
    () => normalizeAddress("https://user:pass@example.com/"),
    /credentials/,
  );
  assert.throws(() => normalizeAddress("   "), /Enter a URL/);
});

test("navigation history supports back, forward, reload replacement, and branch truncation", () => {
  const history = new NavigationHistory();
  history.push("https://one.example/");
  history.push("https://two.example/");
  assert.equal(history.current, "https://two.example/");
  assert.equal(history.go(-1), "https://one.example/");
  assert.equal(history.canGoForward, true);
  assert.equal(history.go(1), "https://two.example/");
  history.replace("https://two.example/reloaded");
  assert.equal(history.current, "https://two.example/reloaded");
  history.go(-1);
  history.push("https://three.example/");
  assert.equal(history.canGoForward, false);
  assert.equal(history.entries.length, 2);
});

test("duplicate navigation is skipped for the current or same in-flight URL", () => {
  assert.equal(
    shouldSkipNavigation("https://one.example/", "https://one.example/"),
    true,
  );
  assert.equal(
    shouldSkipNavigation(
      "https://two.example/",
      "https://one.example/",
      "https://two.example/",
    ),
    true,
  );
  assert.equal(
    shouldSkipNavigation(
      "https://three.example/",
      "https://one.example/",
      "https://two.example/",
    ),
    false,
  );
});
