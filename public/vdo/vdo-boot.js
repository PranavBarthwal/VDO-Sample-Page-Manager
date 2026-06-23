/* ============================================================================
   VDO Boot — renders saved ad placements onto a served clone page.
   Reads window.__VDO_LAYOUT__ (injected by the clone route handler) and uses
   window.VdoAds to render each unit at its anchor.

   Two-pass for in-flow units: resolve ALL anchor elements first, THEN insert,
   so inserting a slot never shifts a later anchor's selector match.
   ============================================================================ */
(function () {
  "use strict";

  function run() {
    if (!window.VdoAds) return;
    var layout = window.__VDO_LAYOUT__ || [];
    if (!layout.length) return;

    // Pass 1: resolve anchors.
    var resolved = layout.map(function (pl) {
      var anchor = null;
      if (pl.placement !== "viewport" && pl.selector) {
        try {
          anchor = document.querySelector(pl.selector);
        } catch (e) {
          anchor = null;
        }
      }
      return { pl: pl, anchor: anchor };
    });

    // Pass 2: insert + render.
    resolved.forEach(function (r) {
      var pl = r.pl;
      try {
        if (pl.placement === "viewport" || !pl.selector) {
          window.VdoAds.render(pl.unitId, document.body, pl.config || {});
          return;
        }
        if (!r.anchor || !r.anchor.parentNode) return;
        var holder = document.createElement("div");
        holder.className = "vdo-slot";
        holder.style.margin = "18px 0";
        if (pl.position === "before") {
          r.anchor.parentNode.insertBefore(holder, r.anchor);
        } else {
          r.anchor.parentNode.insertBefore(holder, r.anchor.nextSibling);
        }
        window.VdoAds.render(pl.unitId, holder, pl.config || {});
      } catch (e) {
        /* skip a bad placement, keep the rest */
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
