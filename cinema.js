"use strict";
(() => {
  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
  const hero = document.querySelector(".gc-hero");
  const video = document.getElementById("cinema-video");
  const progress = document.getElementById("cinema-progress");
  if (!hero || !video) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let requested = 0, rendered = 0, raf = 0, duration = 0, ready = false;
  video.muted = true;
  video.pause();
  video.addEventListener("loadedmetadata", () => {
    duration = Number.isFinite(video.duration) ? video.duration : 0;
    ready = duration > 0;
    update();
  });
  video.addEventListener("error", () => {
    // In caso di problemi di rete, rimane l'immagine di copertina.
    video.style.opacity = "0";
  });
  function update() {
    const range = Math.max(hero.offsetHeight - window.innerHeight, 1);
    const top = hero.getBoundingClientRect().top;
    requested = Math.max(0, Math.min(1, -top / range));
    if (progress) progress.style.transform = "scaleX(" + requested + ")";
  }
  function tick() {
    raf = 0;
    if (ready && !reduced.matches && !video.seeking) {
      rendered += (requested - rendered) * 0.22;
      const target = Math.min(duration - 0.04, Math.max(0, rendered * duration));
      if (Math.abs(video.currentTime - target) > 0.035) {
        try { video.currentTime = target; } catch {}
      }
    }
    raf = requestAnimationFrame(tick);
  }
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
  raf = requestAnimationFrame(tick);
  window.addEventListener("pagehide", () => { if (raf) cancelAnimationFrame(raf); });
})();
