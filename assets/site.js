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

  /* ---- contact form ----
     Posts to a Google Apps Script web app (which stores the row in a Google
     Sheet and emails a notification). Bot defences: a hidden honeypot field, a
     minimum fill-time, and — when configured — a Cloudflare Turnstile token.
     Falls back to "email me instead" if anything isn't wired up yet.          */
  var form = document.getElementById("contact-form");
  if (form) {
    var statusEl = document.getElementById("form-status");
    var renderedAt = Date.now();
    var setStatus = function (msg, kind) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.className = "form-status show " + kind;
    };

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var endpoint = form.getAttribute("data-endpoint") || "";
      if (endpoint.indexOf("REPLACE_ME") !== -1 || endpoint === "") {
        setStatus("The contact form isn’t connected yet — please email hello@munna.dev directly.", "error");
        return;
      }

      // honeypot: real people never see or fill this field
      var hp = form.elements["company"];
      if (hp && hp.value) { form.reset(); setStatus("Thanks! Your message has been sent.", "ok"); return; }

      // time trap: a genuine person takes more than a few seconds
      if (Date.now() - renderedAt < 3500) {
        setStatus("That submitted a little too fast — please try again.", "error");
        return;
      }

      // Cloudflare Turnstile, only enforced once a real site key is set
      var widget = form.querySelector(".cf-turnstile");
      var configured = widget && (widget.getAttribute("data-sitekey") || "").indexOf("REPLACE_ME") === -1;
      if (configured) {
        var tokenField = form.querySelector('[name="cf-turnstile-response"]');
        if (!tokenField || !tokenField.value) {
          setStatus("Please complete the “I’m human” check, then send again.", "error");
          return;
        }
      }

      var btn = form.querySelector("button[type=submit]");
      if (btn) { btn.setAttribute("aria-disabled", "true"); btn.textContent = "Sending…"; }

      fetch(endpoint, { method: "POST", body: new FormData(form) })
        .then(function () {
          form.reset();
          if (window.turnstile && configured) { try { window.turnstile.reset(); } catch (_) {} }
          renderedAt = Date.now();
          setStatus("Thanks! Your message has been sent — I’ll get back to you soon.", "ok");
        })
        .catch(function () {
          setStatus("Couldn’t send that. Please email hello@munna.dev instead.", "error");
        })
        .finally(function () {
          if (btn) { btn.removeAttribute("aria-disabled"); btn.textContent = "Send message"; }
        });
    });
  }
})();
