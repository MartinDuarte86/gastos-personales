(function initIconRegistry() {
  const ICONS = Object.freeze({
    darkModeMoon: "&#x1F319;",
    darkModeSun: "&#x2600;&#xFE0F;",
    moneyBag: "&#x1F4B0;",
    chart: "&#x1F4CA;",
    calendar: "&#x1F4C5;",
    clipboard: "&#x1F4CB;",
    gear: "&#x2699;&#xFE0F;",
    tag: "&#x1F3F7;&#xFE0F;",
    pencil: "&#x270F;&#xFE0F;",
    close: "&#x2716;",
    trash: "&#x1F5D1;&#xFE0F;",
    lock: "&#x1F512;",
    repeat: "&#x1F501;",
    expense: "&#x1F4B8;",
    income: "&#x1F49A;",
    investment: "&#x1F4BC;",
    ok: "&#x2705;",
    warning: "&#x26A0;&#xFE0F;",
    error: "&#x274C;",
    redCircle: "&#x1F534;",
    greenCircle: "&#x1F7E2;",
    droplet: "&#x1F4A7;",
    hourglass: "&#x23F3;",
    arrowLeft: "&#x25C0;",
    arrowRight: "&#x25B6;"
  });

  window.AppIcons = ICONS;
  window.resolveAppIcon = (key, fallback = "") => ICONS[key] || fallback;
  window.renderAppIcons = (root = document) => {
    root.querySelectorAll("[data-app-icon]").forEach((node) => {
      const key = node.getAttribute("data-app-icon");
      node.innerHTML = ICONS[key] || "";
    });
  };
})();
