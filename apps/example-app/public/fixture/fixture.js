const count = document.querySelector("#click-count");
const button = document.querySelector("#count-button");
const dataLabel = document.querySelector("#fixture-data");

button?.addEventListener("click", () => {
  count.textContent = String(Number(count.textContent) + 1);
});

fetch("./data.json")
  .then((response) => {
    if (!response.ok)
      throw new Error("fixture JSON response was not successful");
    return response.json();
  })
  .then((data) => {
    dataLabel.textContent = data.message;
  })
  .catch(() => {
    dataLabel.textContent = "The Fractal-served JSON request failed.";
  });

document.addEventListener("click", (event) => {
  const anchor = event.target.closest("a[data-fractal-navigate]");
  if (!anchor) return;
  event.preventDefault();
  parent.postMessage(
    { type: "fractal-fixture-navigate", path: new URL(anchor.href).pathname },
    "*",
  );
});
