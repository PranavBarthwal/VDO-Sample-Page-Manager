/* ============================================================================
   VDO Ads — ad-unit catalog + renderers. Depends on vdo-player.js (VdoPlayer,
   VdoSkin). Exposes window.VdoAds:

     VdoAds.units            -> array of unit definitions (the editor palette)
     VdoAds.get(id)          -> a unit definition
     VdoAds.render(id, target, config) -> { el, instance?, destroy() }
     VdoAds.SIZES            -> IAB display sizes

   Each unit definition: { id, name, category, icon, sizes?, presets?, defaults,
   render(target, config) -> handle }.
   ============================================================================ */
(function () {
  "use strict";

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // Default VAST ad tag (Google IMA sample preroll) so the player plays a real
  // ad out of the box. Override per-unit via config.adVast.
  var DEFAULT_VAST =
    "https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_preroll_skippable&sz=640x480&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&correlator=";

  // Animate an in-flow unit in as it scrolls into view.
  function attachReveal(elm, root) {
    elm.classList.add("vdo-reveal");
    if (typeof IntersectionObserver === "undefined") {
      elm.classList.add("vdo-reveal-in");
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            elm.classList.add("vdo-reveal-in");
            io.unobserve(elm);
          }
        });
      },
      { root: root || null, threshold: 0.15 }
    );
    io.observe(elm);
  }

  // IAB display sizes [w, h] + shape hint for layout.
  var SIZES = {
    leaderboard: { w: 728, h: 90, shape: "wide", label: "Leaderboard 728×90" },
    billboard: { w: 970, h: 250, shape: "wide", label: "Billboard 970×250" },
    mpu: { w: 300, h: 250, shape: "box", label: "MPU 300×250" },
    halfpage: { w: 300, h: 600, shape: "box", label: "Half-page 300×600" },
    mobile: { w: 320, h: 50, shape: "tiny", label: "Mobile 320×50" },
    "large-mobile": { w: 320, h: 100, shape: "wide", label: "Large mobile 320×100" },
  };

  function addLabelClose(node, handle) {
    var label = el("span", "vdo-ad-label", "Ad");
    var close = el("button", "vdo-ad-close", "×");
    close.title = "Close ad";
    close.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      handle.destroy();
    });
    node.appendChild(label);
    node.appendChild(close);
  }

  /* ----------------------------- Display banner --------------------------- */
  function renderBanner(target, cfg) {
    cfg = cfg || {};
    var size = SIZES[cfg.size] || SIZES.mpu;
    var a = document.createElement("a");
    a.className = "vdo-ad vdo-banner";
    a.href = cfg.url || "#";
    a.target = "_blank";
    a.rel = "noopener";
    a.style.width = size.w + "px";
    a.style.height = size.h + "px";
    a.setAttribute("data-shape", size.shape);
    if (cfg.accent) a.style.setProperty("--vdo-accent", cfg.accent);
    if (cfg.background) a.style.background = cfg.background;

    if (cfg.image) {
      var img = el("img", "vdo-banner-img");
      img.src = cfg.image;
      img.alt = "";
      a.appendChild(img);
    } else {
      var body = el("div", "vdo-banner-body");
      body.appendChild(el("span", "vdo-banner-brand", cfg.brand || "Your Brand"));
      body.appendChild(el("span", "vdo-banner-head", cfg.headline || "Discover something new"));
      if (size.shape !== "tiny") {
        body.appendChild(el("span", "vdo-banner-cta", cfg.cta || "Learn More"));
      }
      a.appendChild(body);
    }

    var handle = { el: a, destroy: function () { if (a.parentNode) a.parentNode.removeChild(a); } };
    addLabelClose(a, handle);
    target.appendChild(a);
    if (!cfg._inAnchor) attachReveal(a, cfg.scrollRoot);
    return handle;
  }

  /* --------------------------- Sticky anchor banner ----------------------- */
  function renderAnchor(target, cfg) {
    cfg = cfg || {};
    var bar = el("div", "vdo-ad vdo-anchor");
    var inner = renderBanner(bar, {
      _inAnchor: true,
      size: cfg.size || "leaderboard",
      brand: cfg.brand,
      headline: cfg.headline,
      cta: cfg.cta,
      url: cfg.url,
      accent: cfg.accent,
      image: cfg.image,
      background: cfg.background,
    });
    // The inner banner already has its own close; remove it, use the bar's.
    var innerClose = inner.el.querySelector(".vdo-ad-close");
    if (innerClose) innerClose.remove();
    var close = el("button", "vdo-ad-close", "×");
    close.title = "Close";
    var handle = {
      el: bar,
      destroy: function () { if (bar.parentNode) bar.parentNode.removeChild(bar); },
    };
    close.addEventListener("click", handle.destroy);
    bar.appendChild(close);
    target.appendChild(bar);
    return handle;
  }

  /* --------------------------- Sticky floating video ---------------------- */
  function renderFloatingVideo(target, cfg) {
    cfg = cfg || {};
    var wrap = el("div", "vdo-floating");
    wrap.setAttribute("data-corner", cfg.corner || "br");
    target.appendChild(wrap);

    var player = new window.VdoPlayer(wrap, Object.assign({
      preset: cfg.preset || "glass",
      contentAspect: cfg.contentAspect || "9:16",
      adAspect: cfg.adAspect || "16:9",
      width: cfg.width || 320,
      title: cfg.title || "Now Playing",
      autoplay: true,
      muted: true,
      loop: true,
      closeable: true,
      expandable: true,
      adVast: cfg.adVast || DEFAULT_VAST,
      autoFireAd: cfg.autoFireAd != null ? cfg.autoFireAd : 3,
      cta: cfg.cta ? { text: cfg.cta, url: cfg.url || "#", showAt: 2 } : null,
    }, cfg.player || {}));

    // Collapse tab.
    var collapse = el("button", "vdo-collapse", "▾");
    collapse.title = "Collapse";
    collapse.addEventListener("click", function () {
      var collapsed = wrap.getAttribute("data-collapsed") === "true";
      wrap.setAttribute("data-collapsed", collapsed ? "false" : "true");
    });
    wrap.appendChild(collapse);

    return {
      el: wrap,
      instance: player,
      destroy: function () { player.destroy(); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); },
    };
  }

  /* --------------------------- In-content / outstream --------------------- */
  function renderInContent(target, cfg) {
    cfg = cfg || {};
    var unit = el("div", "vdo-ad vdo-incontent");
    unit.appendChild(el("div", "vdo-incontent-tag", "Advertisement"));
    var holder = el("div");
    unit.appendChild(holder);
    target.appendChild(unit);

    var player = new window.VdoPlayer(holder, {
      preset: cfg.preset || "teads",
      contentAspect: cfg.contentAspect || "16:9",
      adAspect: cfg.adAspect || "16:9",
      width: "100%",
      fluid: true,
      title: cfg.title || "Sponsored",
      autoplay: true,
      muted: true,
      loop: true,
      closeable: true,
      adVast: cfg.adVast || DEFAULT_VAST,
      autoFireAd: cfg.autoFireAd != null ? cfg.autoFireAd : 3,
      cta: cfg.cta ? { text: cfg.cta, url: cfg.url || "#", showAt: 2 } : null,
    });

    // Outstream behavior: only play while in view (pause when scrolled away).
    var io = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              player.content.play && player.content.play().catch(function () {});
            } else {
              player.content.pause && player.content.pause();
            }
          });
        },
        { root: cfg.scrollRoot || null, threshold: 0.4 }
      );
      io.observe(unit);
    }

    attachReveal(unit, cfg.scrollRoot);

    return {
      el: unit,
      instance: player,
      destroy: function () {
        if (io) io.disconnect();
        player.destroy();
        if (unit.parentNode) unit.parentNode.removeChild(unit);
      },
    };
  }

  /* ------------------------------ Custom ad tag -------------------------- */
  // Re-create <script> nodes so pasted tag markup actually executes (innerHTML
  // alone never runs scripts).
  function runScripts(container) {
    var scripts = container.querySelectorAll("script");
    for (var i = 0; i < scripts.length; i++) {
      var old = scripts[i];
      var s = document.createElement("script");
      for (var j = 0; j < old.attributes.length; j++) {
        s.setAttribute(old.attributes[j].name, old.attributes[j].value);
      }
      s.text = old.textContent;
      old.parentNode.replaceChild(s, old);
    }
  }

  function renderCustomTag(target, cfg) {
    cfg = cfg || {};
    var box = el("div", "vdo-ad vdo-customtag");
    if (cfg.width && cfg.width !== "auto") {
      box.style.maxWidth = typeof cfg.width === "number" ? cfg.width + "px" : cfg.width;
    }
    if (cfg.minHeight) box.style.minHeight = (typeof cfg.minHeight === "number" ? cfg.minHeight + "px" : cfg.minHeight);

    var inner = el("div", "vdo-customtag-inner");
    var tag = (cfg.tag || "").trim();
    if (tag) {
      inner.innerHTML = tag;
    } else {
      box.setAttribute("data-empty", "true");
      inner.innerHTML = '<div class="vdo-customtag-empty">Paste your VDO.AI ad tag here</div>';
    }
    box.appendChild(inner);

    var handle = { el: box, destroy: function () { if (box.parentNode) box.parentNode.removeChild(box); } };
    addLabelClose(box, handle);
    target.appendChild(box);
    attachReveal(box, cfg.scrollRoot);
    if (tag) {
      try { runScripts(inner); } catch (e) {}
    }
    return handle;
  }

  /* ------------- Sticky in-content: docks to a floating player on scroll ---- */
  function renderStickyInContent(target, cfg) {
    cfg = cfg || {};
    var unit = el("div", "vdo-ad vdo-incontent vdo-sticky-incontent");
    unit.appendChild(el("div", "vdo-incontent-tag", "Advertisement"));
    var holder = el("div", "vdo-dock-holder");
    holder.appendChild(el("span", "vdo-dock-tag", "Ad"));
    var mount = el("div");
    holder.appendChild(mount);
    unit.appendChild(holder);
    target.appendChild(unit);

    var player = new window.VdoPlayer(mount, {
      preset: cfg.preset || "glass",
      contentAspect: cfg.contentAspect || "16:9",
      adAspect: cfg.adAspect || "16:9",
      width: "100%",
      fluid: true,
      title: cfg.title || "Sponsored",
      autoplay: true,
      muted: true,
      loop: true,
      closeable: true,
      adVast: cfg.adVast || DEFAULT_VAST,
      autoFireAd: cfg.autoFireAd != null ? cfg.autoFireAd : 3,
      cta: cfg.cta ? { text: cfg.cta, url: cfg.url || "#", showAt: 2 } : null,
    });

    var docked = false;
    function setDocked(d) {
      if (d === docked) return;
      docked = d;
      if (d) {
        unit.style.minHeight = holder.offsetHeight + "px"; // reserve space, no jump
        holder.classList.add("vdo-docked");
        holder.setAttribute("data-corner", cfg.corner || "br");
      } else {
        holder.classList.remove("vdo-docked");
        unit.style.minHeight = "";
      }
    }

    // Dock when the unit scrolls above the viewport top; undock on the way back.
    // A scroll listener (not IntersectionObserver) handles fast scrolls / jumps
    // reliably — IO with threshold 0 misses ratio 0 -> 0 transitions.
    var win = unit.ownerDocument.defaultView || window;
    var raf = 0;
    function apply() {
      raf = 0;
      var r = unit.getBoundingClientRect();
      setDocked(r.top < -20);
    }
    function onScroll() {
      if (!raf) raf = win.requestAnimationFrame(apply);
    }
    // capture:true catches scroll from inner scroll containers too (many real
    // publisher pages scroll an inner element, not the window).
    win.addEventListener("scroll", onScroll, { passive: true, capture: true });
    win.addEventListener("resize", onScroll);
    apply();

    attachReveal(unit, cfg.scrollRoot);

    return {
      el: unit,
      instance: player,
      destroy: function () {
        win.removeEventListener("scroll", onScroll, { capture: true });
        win.removeEventListener("resize", onScroll);
        player.destroy();
        if (unit.parentNode) unit.parentNode.removeChild(unit);
      },
    };
  }

  var UNITS = [
    {
      id: "floating-video",
      name: "Sticky Floating Video",
      category: "Video",
      icon: "🎬",
      presets: window.VdoPlayer ? window.VdoPlayer.PRESETS : [],
      placement: "viewport",
      defaults: { corner: "br", preset: "glass", width: 320, contentAspect: "9:16", adVast: DEFAULT_VAST },
      render: renderFloatingVideo,
    },
    {
      id: "in-content",
      name: "In-Content / Outstream",
      category: "Video",
      icon: "📰",
      presets: window.VdoPlayer ? window.VdoPlayer.PRESETS : [],
      placement: "in-flow",
      defaults: { preset: "teads", contentAspect: "16:9", adVast: DEFAULT_VAST },
      render: renderInContent,
    },
    {
      id: "sticky-incontent",
      name: "In-Content → Floating (sticky)",
      category: "Video",
      icon: "📌",
      presets: window.VdoPlayer ? window.VdoPlayer.PRESETS : [],
      placement: "in-flow",
      defaults: { preset: "glass", contentAspect: "16:9", corner: "br", adVast: DEFAULT_VAST },
      render: renderStickyInContent,
    },
    {
      id: "banner",
      name: "Display Banner",
      category: "Display",
      icon: "🖼️",
      sizes: Object.keys(SIZES),
      placement: "in-flow",
      defaults: { size: "mpu", brand: "Your Brand", headline: "Discover something new", cta: "Learn More" },
      render: renderBanner,
    },
    {
      id: "anchor",
      name: "Sticky Anchor Banner",
      category: "Display",
      icon: "⚓",
      sizes: ["leaderboard", "large-mobile", "mobile", "billboard"],
      placement: "viewport",
      defaults: { size: "leaderboard", brand: "Your Brand", headline: "Limited-time offer", cta: "Shop Now" },
      render: renderAnchor,
    },
    {
      id: "custom-tag",
      name: "Custom Ad Tag (VDO.AI / 3rd-party)",
      category: "Custom",
      icon: "🔌",
      placement: "in-flow",
      defaults: { tag: "", width: "auto", minHeight: 90 },
      render: renderCustomTag,
    },
  ];

  window.VdoAds = {
    SIZES: SIZES,
    units: UNITS,
    get: function (id) {
      return UNITS.filter(function (u) { return u.id === id; })[0] || null;
    },
    render: function (id, target, config) {
      var u = this.get(id);
      if (!u) throw new Error("Unknown unit: " + id);
      var cfg = Object.assign({}, u.defaults, config || {});
      return u.render(target, cfg);
    },
  };
})();
