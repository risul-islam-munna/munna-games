/* Dual Play landing — achievement carousel + rank preview dialog.
   Progressive enhancement: without JS the cards are still a scrollable list. */
(function () {
  "use strict";

  var viewport = document.getElementById("rank-viewport");
  if (!viewport) return;

  var RANKS = [
    { key: "rookie", name: "Rookie", desc: "Every legend begins somewhere.", rating: 0, matches: 0, wins: 0, explored: 0 },
    { key: "explorer", name: "Explorer", desc: "Discover new games and start building your skills.", rating: 13, matches: 12, wins: 5, explored: 6 },
    { key: "challenger", name: "Challenger", desc: "Your journey is gaining momentum.", rating: 25, matches: 30, wins: 14, explored: 7 },
    { key: "skilled-player", name: "Skilled Player", desc: "Sharper decisions. Stronger gameplay.", rating: 40, matches: 65, wins: 35, explored: 8 },
    { key: "expert", name: "Expert", desc: "Experience and strategy are becoming your strengths.", rating: 55, matches: 110, wins: 68, explored: 10 },
    { key: "master", name: "Master", desc: "Precision, patience, and powerful decisions.", rating: 70, matches: 180, wins: 125, explored: 10 },
    { key: "champion", name: "Champion", desc: "An achievement earned through remarkable progress.", rating: 85, matches: 300, wins: 225, explored: 10 },
    { key: "legend", name: "Legend", desc: "The ultimate milestone in your Dual Play journey.", rating: 95, matches: 500, wins: 400, explored: 10 }
  ];

  var slides = Array.prototype.slice.call(viewport.querySelectorAll(".dp-slide"));
  var status = document.getElementById("rank-status");
  var prev = document.querySelector("[data-rank-prev]");
  var next = document.querySelector("[data-rank-next]");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var active = 0;

  function clamp(i) { return Math.max(0, Math.min(slides.length - 1, i)); }

  function setActive(i) {
    active = clamp(i);
    slides.forEach(function (s, n) { s.classList.toggle("is-active", n === active); });
    if (status) status.textContent = "Rank " + (active + 1) + " of " + slides.length + " · " + RANKS[active].name;
    if (prev) prev.disabled = active === 0;
    if (next) next.disabled = active === slides.length - 1;
  }

  function goTo(i, instant) {
    var s = slides[clamp(i)];
    var left = s.offsetLeft - (viewport.clientWidth - s.offsetWidth) / 2;
    viewport.scrollTo({ left: left, behavior: instant || reduce ? "auto" : "smooth" });
    setActive(i);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var mid = viewport.scrollLeft + viewport.clientWidth / 2;
      var best = 0, bestD = Infinity;
      slides.forEach(function (s, n) {
        var d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid);
        if (d < bestD) { bestD = d; best = n; }
      });
      if (best !== active) setActive(best);
    });
  }
  viewport.addEventListener("scroll", onScroll, { passive: true });

  if (prev) prev.addEventListener("click", function () { goTo(active - 1); });
  if (next) next.addEventListener("click", function () { goTo(active + 1); });

  viewport.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(active + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(active - 1); }
    else if (e.key === "Home") { e.preventDefault(); goTo(0); }
    else if (e.key === "End") { e.preventDefault(); goTo(slides.length - 1); }
  });

  /* ---- preview dialog ---- */
  var dialog = document.getElementById("rank-dialog");
  var dImg = document.getElementById("rank-dialog-img");
  var dTitle = document.getElementById("rank-dialog-title");
  var dDesc = document.getElementById("rank-dialog-desc");
  var dCount = document.getElementById("rank-dialog-count");
  var dSample = document.getElementById("rank-dialog-sample");
  var current = 0;
  var opener = null;

  function show(i) {
    current = clamp(i);
    var r = RANKS[current];
    dImg.src = "/dual-play/assets/ranks/" + r.key + ".webp";
    dImg.alt = "Sample Dual Play achievement card for the " + r.name + " rank, rating " + r.rating +
      " out of 100, " + r.matches + " matches, " + r.wins + " wins, " + r.explored + " of 10 games explored";
    dTitle.textContent = r.name;
    dDesc.textContent = r.desc;
    dCount.textContent = "Rank " + (current + 1) + " of " + RANKS.length;
    dSample.textContent = "Sample preview with illustrative stats: rating " + r.rating + "/100 · " +
      r.matches + " matches · " + r.wins + " wins · " + r.explored + "/10 games explored. Not a real player.";
  }

  function openRank(i, from) {
    opener = from || null;
    show(i);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  slides.forEach(function (s, n) {
    var btn = s.querySelector("[data-open-rank]");
    btn.addEventListener("click", function () {
      if (n !== active) { goTo(n); }
      openRank(n, btn);
    });
  });

  if (dialog) {
    dialog.querySelector("[data-rank-close]").addEventListener("click", function () { dialog.close(); });
    dialog.querySelector("[data-rank-dprev]").addEventListener("click", function () { show(current - 1); });
    dialog.querySelector("[data-rank-dnext]").addEventListener("click", function () { show(current + 1); });
    dialog.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { show(current + 1); }
      else if (e.key === "ArrowLeft") { show(current - 1); }
    });
    dialog.addEventListener("click", function (e) {
      var b = dialog.getBoundingClientRect();
      var inside = e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
      if (!inside) dialog.close();
    });
    dialog.addEventListener("close", function () {
      goTo(current, true);
      if (opener) opener.focus();
    });
  }

  setActive(0);
  goTo(0, true);
})();
