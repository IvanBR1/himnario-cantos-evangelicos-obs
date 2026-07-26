(function () {
  const STORAGE_KEY = "obsPanelAppearance";
  const select = document.getElementById("panel-appearance");

  function applyAppearance(value) {
    const appearance = ["normal", "compact", "minimal"].includes(value)
      ? value
      : "normal";
    document.body.dataset.panelAppearance = appearance;
    if (select) select.value = appearance;
    try { localStorage.setItem(STORAGE_KEY, appearance); } catch {}
  }

  let saved = "normal";
  try { saved = localStorage.getItem(STORAGE_KEY) || "normal"; } catch {}
  applyAppearance(saved);
  select?.addEventListener("change", () => applyAppearance(select.value));
}());

