import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium, type Browser } from "playwright";
import { startExampleServer } from "../src/server.ts";

let browserSkipReason: string | undefined;
try {
  const probe = await chromium.launch({ headless: true });
  await probe.close();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /error while loading shared libraries|Executable doesn't exist/i.test(
      message,
    )
  ) {
    browserSkipReason = `Playwright Chromium runtime unavailable: ${message.match(/error while loading shared libraries: [^\n]+/)?.[0] ?? "browser executable is missing"}`;
  } else {
    throw error;
  }
}

async function waitForEventCount(
  server: Awaited<ReturnType<typeof startExampleServer>>,
  type: string,
  count: number,
  predicate: (
    event: ReturnType<typeof server.getEvents>[number],
  ) => boolean = () => true,
) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const matches = server
      .getEvents()
      .filter((event) => event.type === type && predicate(event));
    if (matches.length >= count) return matches.at(-1)!;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const recentEvents = server
    .getEvents()
    .map(({ type: eventType, navigationId, errorCode }) =>
      [eventType, navigationId, errorCode].filter(Boolean).join(":"),
    )
    .join(", ");
  throw new Error(
    `Timed out waiting for ${count} ${type} event(s). Recent events: ${recentEvents}`,
  );
}

test(
  "renders the local site through Fractal and supports real back/forward navigation",
  { skip: browserSkipReason },
  async () => {
    const server = await startExampleServer({ port: 0, fixturePort: 0 });
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(server.appUrl);
      const fixture = page.frameLocator("#viewer");
      assert.equal(
        await page
          .locator("html")
          .evaluate((root) => getComputedStyle(root).colorScheme),
        "dark",
      );
      assert.equal(await page.getByRole("button", { name: "Go" }).count(), 0);
      await fixture.getByTestId("fixture-title").waitFor({ timeout: 10000 });
      assert.equal(
        await page.locator("#viewer").getAttribute("sandbox"),
        "allow-scripts",
      );
      assert.equal(
        await fixture.locator("#fixture-data").textContent(),
        "The relative JSON request was fetched through Fractal.",
      );
      assert.equal(
        await fixture
          .locator("img")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth > 0),
        true,
      );
      assert.match(
        await fixture
          .locator("h1")
          .evaluate((heading) => getComputedStyle(heading).fontFamily),
        /Georgia/,
      );

      await fixture.getByRole("button", { name: /Click count/ }).click();
      assert.equal(await fixture.locator("#click-count").textContent(), "1");

      await fixture
        .getByRole("link", { name: "Go to the next fixture page" })
        .click();
      await fixture
        .getByTestId("fixture-title")
        .getByText("Second fixture page")
        .waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Back" }).click();
      await fixture
        .getByTestId("fixture-title")
        .getByText("A real response through Fractal")
        .waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Forward" }).click();
      await fixture
        .getByTestId("fixture-title")
        .getByText("Second fixture page")
        .waitFor({ timeout: 10000 });

      let completedCount = server
        .getEvents()
        .filter((event) => event.type === "NAVIGATION_COMPLETED").length;
      await page.getByRole("button", { name: "Reload" }).click();
      await waitForEventCount(
        server,
        "NAVIGATION_COMPLETED",
        completedCount + 1,
      );
      await fixture
        .getByText("Second fixture page")
        .waitFor({ timeout: 10000 });

      const address = page.locator("#address");
      const requestCountBeforeSearch = server
        .getEvents()
        .filter((event) => event.type === "REQUEST_DISPATCHED").length;
      await address.fill("fractal browser proxy");
      await address.press("Enter");
      await page.getByRole("alert").waitFor({ state: "visible" });
      assert.match(
        (await page.locator("#error-title").textContent()) ?? "",
        /DuckDuckGo/,
      );
      assert.equal(
        server
          .getEvents()
          .filter((event) => event.type === "REQUEST_DISPATCHED").length,
        requestCountBeforeSearch,
      );

      await address.fill("https://example.com/");
      await address.press("Enter");
      await page.getByRole("alert").waitFor({ state: "visible" });
      assert.match(
        (await page.locator("#error-detail").textContent()) ?? "",
        /controlled local fixture/,
      );

      await address.fill(`${server.fixtureOrigin}/fixture/redirect-local`);
      completedCount = server
        .getEvents()
        .filter((event) => event.type === "NAVIGATION_COMPLETED").length;
      await address.press("Enter");
      await waitForEventCount(
        server,
        "NAVIGATION_COMPLETED",
        completedCount + 1,
      );
      await fixture
        .getByText("Second fixture page")
        .waitFor({ timeout: 10000 });

      await address.fill(`${server.fixtureOrigin}/fixture/redirect-external`);
      await address.press("Enter");
      await page.getByRole("alert").waitFor({ state: "visible" });
      assert(
        server
          .getEvents()
          .some((event) => event.type === "DESTINATION_REJECTED"),
      );

      const startedBeforeSlow = server
        .getEvents()
        .filter((event) => event.type === "NAVIGATION_STARTED").length;
      await address.fill(`${server.fixtureOrigin}/fixture/slow`);
      await address.press("Enter");
      const slowNavigation = await waitForEventCount(
        server,
        "NAVIGATION_STARTED",
        startedBeforeSlow + 1,
      );
      await waitForEventCount(
        server,
        "REQUEST_DISPATCHED",
        1,
        (event) => event.navigationId === slowNavigation.navigationId,
      );
      completedCount = server
        .getEvents()
        .filter((event) => event.type === "NAVIGATION_COMPLETED").length;
      await address.fill(`${server.fixtureOrigin}/fixture/index.html`);
      await address.press("Enter");
      await waitForEventCount(
        server,
        "NAVIGATION_COMPLETED",
        completedCount + 1,
      );
      await waitForEventCount(
        server,
        "REQUEST_CANCELLED",
        1,
        (event) => event.navigationId === slowNavigation.navigationId,
      );
      await fixture
        .getByText("A real response through Fractal")
        .waitFor({ timeout: 10000 });

      await page.getByRole("button", { name: "Settings" }).click();
      await page
        .locator("#runtime-status")
        .getByText("Connected to the loopback example runtime")
        .waitFor();
      assert.match(
        (await page.locator("#transport-status").textContent()) ?? "",
        /fetch · ready/,
      );
      assert.equal(await page.locator("#homepage").inputValue(), "fixture");
      assert.equal(
        await page
          .locator("html")
          .evaluate((root) => getComputedStyle(root).colorScheme),
        "dark",
      );
      await page.locator("#homepage").selectOption("blank");
      await page.locator("#settings-close").click();
      const startedBeforeReload = server
        .getEvents()
        .filter((event) => event.type === "NAVIGATION_STARTED").length;
      await page.reload();
      await page.locator("#settings-button").waitFor();
      assert.equal(
        server
          .getEvents()
          .filter((event) => event.type === "NAVIGATION_STARTED").length,
        startedBeforeReload,
      );
      await page.getByRole("button", { name: "Settings" }).click();
      assert.equal(await page.locator("#homepage").inputValue(), "blank");
      await page.locator("#settings-close").click();

      const dispatched = server
        .getEvents()
        .filter((event) => event.type === "REQUEST_DISPATCHED");
      assert(
        dispatched.length >= 5,
        "document, stylesheet, script, image, and JSON should use Fractal",
      );
    } finally {
      await browser?.close();
      await server.close();
    }
  },
);
