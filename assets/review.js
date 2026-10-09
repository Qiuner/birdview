// Generated from src/viewer/review.mts. Do not edit directly.
"use strict";
(() => {
  // src/viewer/review.mts
  var pages = [...document.querySelectorAll(".sheet-page")];
  function show(index) {
    pages.forEach((page) => {
      page.hidden = page.dataset.sheet !== String(index);
    });
    document.querySelectorAll(".tabs [data-goto]").forEach((tab) => tab.setAttribute("aria-pressed", String(tab.dataset.goto === String(index))));
  }
  document.querySelectorAll("[data-goto]").forEach((button) => {
    button.onclick = () => {
      show(Number(button.dataset.goto));
      if (button.closest(".recommend")) document.querySelector(".tabs, .sheet-page:not([hidden])")?.scrollIntoView({ block: "start" });
    };
  });
  pages.forEach((page) => {
    page.querySelectorAll(".node[data-node]").forEach((node) => {
      const link = (on) => page.querySelectorAll(`.node[data-node="${node.dataset.node}"]`).forEach((item) => item.classList.toggle("linked", on));
      node.addEventListener("pointerenter", () => link(true));
      node.addEventListener("pointerleave", () => link(false));
    });
  });
  document.querySelectorAll(".theme-toggle").forEach((button) => {
    button.onclick = () => {
      const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem("birdview-theme", theme);
      } catch {
      }
    };
  });
})();
