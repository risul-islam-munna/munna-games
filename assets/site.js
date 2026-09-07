/* Dual Play — progressive enhancement only. The site is fully usable without JS. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- current year in footers ---- */
  var year = String(new Date().getFullYear());
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = year; });

  /* ---- mobile nav ---- */
  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  if (header && toggle) {
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    header.querySelectorAll(".nav a").forEach(function (a) {
      a.addEventListener("click", function () {
        header.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---- sticky header shadow ---- */
  if (header) {
    var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- iOS install dialog ---- */
  var iosDialog = document.getElementById("ios-dialog");
  if (iosDialog) {
    document.querySelectorAll("[data-open-ios]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (typeof iosDialog.showModal === "function") iosDialog.showModal();
        else iosDialog.setAttribute("open", "");
      });
    });
    iosDialog.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", function () { iosDialog.close(); });
    });
    iosDialog.addEventListener("click", function (e) {
      var b = iosDialog.getBoundingClientRect();
      var inside = e.clientX >= b.left && e.clientX <= b.right &&
                   e.clientY >= b.top && e.clientY <= b.bottom;
      if (!inside) iosDialog.close();
    });
  }

  /* ---- scroll reveal ---- */
  var reveals = document.querySelectorAll(".reveal");
  if (!reduceMotion && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
  }

})();
