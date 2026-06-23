/* ============================================================================
   VDO Player — framework-agnostic video player widget.

   const p = new VdoPlayer(containerEl, {
     preset: 'glass'|'minimal'|'neon'|'editorial'|'cinematic',
     contentAspect: '9:16', adAspect: '16:9',
     width: 320,                  // px number, or '100%' for fluid/in-content
     contentSrc, adSrc,           // video URLs (adSrc optional; VAST hook later)
     poster, title, accent,
     autoplay: true, muted: true, loop: true,
     closeable: true, expandable: true,
   });
   p.fireAd();  // morph to adAspect, play ad, then morph back + resume content

   Exposed as window.VdoPlayer.
   ============================================================================ */
(function () {
  "use strict";

  var SAMPLE_CONTENT =
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4";
  var SAMPLE_AD =
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

  var ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    volume:
      '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm16 1.5-1.4-1.4L16 11.7l-1.6-1.6-1.4 1.4L14.6 13l-1.6 1.6 1.4 1.4L16 14.4l1.6 1.6 1.4-1.4L17.4 13z"/></svg>',
    expand:
      '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>',
  };

  function parseAspect(a) {
    if (!a) return 16 / 9;
    var parts = String(a).split(/[:/]/);
    var w = parseFloat(parts[0]);
    var h = parseFloat(parts[1]);
    if (!w || !h) return 16 / 9;
    return w / h;
  }

  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function parseSkipOffset(s) {
    if (!s) return null;
    if (/%$/.test(s)) return 5; // percent offset -> default 5s
    var p = String(s).split(":").map(parseFloat);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return parseFloat(s) || 5;
  }

  /* Fetch + parse a VAST tag (through the server proxy) into a playable ad. */
  function loadVast(vastUrl) {
    return fetch("/api/vast?url=" + encodeURIComponent(vastUrl))
      .then(function (r) {
        if (!r.ok) throw new Error("vast http " + r.status);
        return r.text();
      })
      .then(function (xml) {
        var doc = new DOMParser().parseFromString(xml, "application/xml");
        var linear = doc.querySelector("Linear");
        var skip = linear ? parseSkipOffset(linear.getAttribute("skipoffset")) : null;
        var pick = null;
        var best = -1;
        var mfs = doc.querySelectorAll("MediaFile");
        for (var i = 0; i < mfs.length; i++) {
          var m = mfs[i];
          var url = (m.textContent || "").trim();
          if (!url) continue;
          var type = (m.getAttribute("type") || "").toLowerCase();
          var delivery = (m.getAttribute("delivery") || "").toLowerCase();
          var h = parseInt(m.getAttribute("height") || "0", 10) || 0;
          var score = (type.indexOf("mp4") >= 0 ? 2000 : type.indexOf("webm") >= 0 ? 1000 : 0) +
            (delivery === "progressive" ? 500 : 0) +
            (h <= 720 ? h : 720 - (h - 720));
          if (score > best) { best = score; pick = url; }
        }
        var ct = doc.querySelector("ClickThrough");
        return {
          mediaUrl: pick,
          skip: skip,
          clickThrough: ct ? (ct.textContent || "").trim() : null,
        };
      });
  }

  function VdoPlayer(container, opts) {
    opts = opts || {};
    this.container = typeof container === "string" ? document.querySelector(container) : container;
    this.opts = opts;
    this.contentAspect = opts.contentAspect || "16:9";
    this.adAspect = opts.adAspect || "16:9";
    this.width = opts.width != null ? opts.width : 360;
    this.fluid = this.width === "100%" || opts.fluid === true;
    this.mode = "content"; // 'content' | 'ad'
    this.adSkipSeconds = opts.adSkipSeconds != null ? opts.adSkipSeconds : 5;
    this._build();
  }

  VdoPlayer.prototype._build = function () {
    var o = this.opts;
    var root = el("div", "vdo-player vdo-preset-" + (o.preset || "glass"));
    if (o.accent) root.style.setProperty("--vdo-accent", o.accent);
    if (this.fluid) {
      root.setAttribute("data-fluid", "true");
      root.style.width = "100%";
    } else {
      root.style.width = this.width + "px";
    }
    root.setAttribute("data-playing", "false");
    root.setAttribute("data-mode", "content");

    var stage = el("div", "vdo-stage");
    this.stage = stage;

    var content = el("video", "vdo-video vdo-content");
    content.src = o.contentSrc || SAMPLE_CONTENT;
    content.muted = o.muted !== false;
    content.loop = o.loop !== false;
    content.playsInline = true;
    content.setAttribute("playsinline", "");
    content.setAttribute("webkit-playsinline", "");
    if (o.poster) content.poster = o.poster;
    this.content = content;

    var ad = el("video", "vdo-video vdo-ad");
    ad.hidden = true;
    ad.muted = false;
    ad.playsInline = true;
    ad.setAttribute("playsinline", "");
    this.ad = ad;

    var scrimTop = el("div", "vdo-scrim vdo-scrim-top");
    var scrimBot = el("div", "vdo-scrim vdo-scrim-bottom");

    // Top bar
    var top = el("div", "vdo-top");
    var pill = el("span", "vdo-pill", "VDO");
    var title = el("span", "vdo-title", o.title || "Now Playing");
    var spacer = el("div", "vdo-spacer");
    top.appendChild(pill);
    top.appendChild(title);
    top.appendChild(spacer);

    if (o.expandable !== false) {
      var expandBtn = el("button", "vdo-iconbtn", ICONS.expand);
      expandBtn.title = "Fullscreen";
      var self0 = this;
      expandBtn.addEventListener("click", function () {
        self0._toggleFullscreen();
      });
      top.appendChild(expandBtn);
    }
    if (o.closeable) {
      var closeBtn = el("button", "vdo-iconbtn", ICONS.close);
      closeBtn.title = "Close";
      var self1 = this;
      closeBtn.addEventListener("click", function () {
        self1.close();
      });
      top.appendChild(closeBtn);
    }

    var admark = el("div", "vdo-admark", "AD");

    // Center play
    var center = el("div", "vdo-center");
    var centerBtn = el("div", "vdo-center-btn", ICONS.play);
    center.appendChild(centerBtn);

    // Ad meta
    var adMeta = el("div", "vdo-ad-meta");
    var adCount = el("span", null, "Ad");
    var skip = el("button", "vdo-skip", "Skip");
    skip.disabled = true;
    adMeta.appendChild(adCount);
    adMeta.appendChild(skip);
    this.adCount = adCount;
    this.skipBtn = skip;

    // Controls
    var controls = el("div", "vdo-controls");
    var progress = el("div", "vdo-progress");
    var fill = el("div", "vdo-progress-fill");
    progress.appendChild(fill);
    var row = el("div", "vdo-controls-row");
    var playBtn = el("button", "vdo-iconbtn", ICONS.play);
    var muteBtn = el("button", "vdo-iconbtn", o.muted !== false ? ICONS.mute : ICONS.volume);
    var time = el("span", "vdo-time", "0:00 / 0:00");
    row.appendChild(playBtn);
    row.appendChild(muteBtn);
    row.appendChild(time);
    controls.appendChild(progress);
    controls.appendChild(row);

    this.fill = fill;
    this.time = time;
    this.playBtn = playBtn;
    this.muteBtn = muteBtn;
    this.progress = progress;

    stage.appendChild(content);
    stage.appendChild(ad);
    stage.appendChild(scrimTop);
    stage.appendChild(scrimBot);
    stage.appendChild(admark);
    stage.appendChild(top);
    stage.appendChild(center);
    stage.appendChild(adMeta);
    stage.appendChild(controls);
    root.appendChild(stage);

    if (o.entrance) root.classList.add("vdo-enter-" + o.entrance);
    if (o.glow) root.classList.add("vdo-glow");

    this.root = root;
    this.container.appendChild(root);

    this._buildExtras(stage);
    this._applyAspect(this.contentAspect, false);
    this._wire(center, centerBtn);

    if (o.autoplay !== false) {
      var self = this;
      // Autoplay must be muted to be allowed.
      content.muted = true;
      this.muteBtn.innerHTML = ICONS.mute;
      content.play().then(function () {
        self._setPlaying(true);
      }).catch(function () {
        self._setPlaying(false);
      });
    }

    // Auto-fire the ad shortly after load (preroll-style demo) so the served
    // pitch page actually shows the ad + the aspect morph without interaction.
    if (o.autoFireAd != null) {
      var selfAd = this;
      this._autoAdTimer = setTimeout(function () {
        if (selfAd.mode === "content") selfAd.fireAd();
      }, Math.max(0, Number(o.autoFireAd) * 1000));
    }
  };

  // Optional ad-tech feature layers: story bar, CTA overlay, "Up Next" playlist.
  VdoPlayer.prototype._buildExtras = function (stage) {
    var o = this.opts;
    var self = this;

    if (o.storyBar) {
      this.root.setAttribute("data-storybar", "true");
      var bar = el("div", "vdo-storybar");
      var seg = el("div", "vdo-storyseg", "<i></i>");
      bar.appendChild(seg);
      stage.appendChild(bar);
      this._storyFill = seg.querySelector("i");
    }

    if (o.cta) {
      var cta = document.createElement("a");
      cta.className = "vdo-cta";
      cta.textContent = o.cta.text || "Learn More";
      cta.href = o.cta.url || "#";
      cta.target = "_blank";
      cta.rel = "noopener";
      stage.appendChild(cta);
      this._ctaEl = cta;
      this._ctaShowAt = o.cta.showAt != null ? o.cta.showAt : 2;
    }

    if (o.playlist && o.playlist.length) {
      var rail = el("div", "vdo-playlist");
      o.playlist.forEach(function (item, i) {
        var it = el("div", "vdo-pl-item" + (i === 0 ? " vdo-pl-active" : ""));
        var thumb = el("img", "vdo-pl-thumb");
        thumb.src = item.thumb || "";
        thumb.alt = "";
        var t = el("div", "vdo-pl-title", item.title || "Up next");
        it.appendChild(thumb);
        it.appendChild(t);
        it.addEventListener("click", function () {
          rail.querySelectorAll(".vdo-pl-item").forEach(function (n) {
            n.classList.remove("vdo-pl-active");
          });
          it.classList.add("vdo-pl-active");
          if (item.src) {
            self.content.src = item.src;
            self.content.play().then(function () { self._setPlaying(true); }).catch(function () {});
          }
          if (item.title) self.root.querySelector(".vdo-title").textContent = item.title;
        });
        rail.appendChild(it);
      });
      stage.appendChild(rail);
    }
  };

  VdoPlayer.prototype._wire = function (center, centerBtn) {
    var self = this;
    function active() {
      return self.mode === "ad" ? self.ad : self.content;
    }
    center.addEventListener("click", function () {
      self.togglePlay();
    });
    this.playBtn.addEventListener("click", function () {
      self.togglePlay();
    });
    this.muteBtn.addEventListener("click", function () {
      self.toggleMute();
    });
    this.progress.addEventListener("click", function (e) {
      var rect = self.progress.getBoundingClientRect();
      var pct = (e.clientX - rect.left) / rect.width;
      var v = active();
      if (v.duration) v.currentTime = pct * v.duration;
    });

    function onTime() {
      var v = active();
      var d = v.duration || 0;
      var c = v.currentTime || 0;
      self.fill.style.width = d ? (c / d) * 100 + "%" : "0%";
      self.time.textContent = fmt(c) + " / " + fmt(d);
      // Story-style segmented progress (content only).
      if (self._storyFill && self.mode === "content") {
        self._storyFill.style.width = d ? (c / d) * 100 + "%" : "0%";
      }
      // Reveal CTA after its show-at time (content only).
      if (self._ctaEl && self.mode === "content") {
        if (c >= self._ctaShowAt) self._ctaEl.classList.add("vdo-cta-show");
        else self._ctaEl.classList.remove("vdo-cta-show");
      }
      if (self.mode === "ad") {
        var remain = Math.max(0, Math.ceil(self.adSkipSeconds - c));
        if (remain > 0) {
          self.adCount.textContent = "Ad · skip in " + remain + "s";
          self.skipBtn.disabled = true;
        } else {
          self.adCount.textContent = "Ad";
          self.skipBtn.disabled = false;
        }
      }
    }
    this.content.addEventListener("timeupdate", onTime);
    this.ad.addEventListener("timeupdate", onTime);

    this.content.addEventListener("play", function () {
      if (self.mode === "content") self._setPlaying(true);
    });
    this.content.addEventListener("pause", function () {
      if (self.mode === "content") self._setPlaying(false);
    });

    this.ad.addEventListener("ended", function () {
      self._endAd();
    });
    // Ad click-through (from VAST).
    this.ad.style.cursor = "pointer";
    this.ad.addEventListener("click", function () {
      if (self.mode === "ad" && self._adClickThrough) {
        window.open(self._adClickThrough, "_blank", "noopener");
      }
    });
    this.skipBtn.addEventListener("click", function () {
      if (!self.skipBtn.disabled) self._endAd();
    });
  };

  VdoPlayer.prototype._setPlaying = function (p) {
    this._playing = p;
    this.root.setAttribute("data-playing", p ? "true" : "false");
    this.playBtn.innerHTML = p ? ICONS.pause : ICONS.play;
  };

  VdoPlayer.prototype.togglePlay = function () {
    var v = this.mode === "ad" ? this.ad : this.content;
    if (v.paused) {
      v.play();
      this._setPlaying(true);
    } else {
      v.pause();
      this._setPlaying(false);
    }
  };

  VdoPlayer.prototype.toggleMute = function () {
    var v = this.mode === "ad" ? this.ad : this.content;
    v.muted = !v.muted;
    this.muteBtn.innerHTML = v.muted ? ICONS.mute : ICONS.volume;
  };

  // Compute and apply stage height for the given aspect (smooth morph).
  VdoPlayer.prototype._applyAspect = function (aspect, animate) {
    var ar = parseAspect(aspect);
    if (this.fluid) {
      this.root.style.setProperty("--vdo-ar", ar + "");
      return;
    }
    var w = this.root.clientWidth || this.width;
    var h = Math.round(w / ar);
    if (!animate) {
      var prev = this.stage.style.transition;
      this.stage.style.transition = "none";
      this.stage.style.height = h + "px";
      // force reflow then restore transition
      void this.stage.offsetHeight;
      this.stage.style.transition = prev || "";
    } else {
      this.stage.style.height = h + "px";
    }
  };

  /* Fire an ad: morph to ad aspect, play the ad, then morph back and resume.
     Accepts an MP4 url, or uses a configured VAST tag (opts.adVast) / MP4. */
  VdoPlayer.prototype.fireAd = function (adSrc) {
    if (this.mode === "ad") return;
    var self = this;
    this.mode = "ad";
    this.root.setAttribute("data-mode", "ad");
    this._contentWasPlaying = !this.content.paused;
    this.content.pause();

    // Morph aspect first, then reveal the ad surface.
    this._applyAspect(this.adAspect, true);
    this.content.hidden = true;
    this.ad.hidden = false;
    this.ad.currentTime = 0;
    this.ad.muted = this.content.muted;
    this.muteBtn.innerHTML = this.ad.muted ? ICONS.mute : ICONS.volume;

    var vast = adSrc && /^https?:/.test(adSrc) && /vast|gampad|doubleclick|\.xml/i.test(adSrc)
      ? adSrc
      : this.opts.adVast;

    if (vast) {
      this.adCount.textContent = "Loading ad…";
      loadVast(vast).then(function (info) {
        if (info && info.skip != null) self.adSkipSeconds = info.skip;
        self._adClickThrough = info && info.clickThrough;
        self.ad.src = (info && info.mediaUrl) || self.opts.adSrc || SAMPLE_AD;
        self.ad.play().then(function () { self._setPlaying(true); }).catch(function () {});
      }).catch(function () {
        self.ad.src = self.opts.adSrc || SAMPLE_AD;
        self.ad.play().then(function () { self._setPlaying(true); }).catch(function () {});
      });
      return;
    }

    this.ad.src = adSrc || this.opts.adSrc || SAMPLE_AD;
    this.ad.play().then(function () {
      self._setPlaying(true);
    }).catch(function () {});
  };

  VdoPlayer.prototype._endAd = function () {
    var self = this;
    this.ad.pause();
    this.ad.hidden = true;
    this.content.hidden = false;
    this.mode = "content";
    this.root.setAttribute("data-mode", "content");
    this._applyAspect(this.contentAspect, true);
    if (this._contentWasPlaying) {
      this.content.play().then(function () {
        self._setPlaying(true);
      }).catch(function () {});
    } else {
      this._setPlaying(false);
    }
  };

  VdoPlayer.prototype._toggleFullscreen = function () {
    var r = this.root;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (r.requestFullscreen) {
      r.requestFullscreen();
    }
  };

  VdoPlayer.prototype.close = function () {
    try {
      this.content.pause();
      this.ad.pause();
    } catch (e) {}
    if (this.opts.onClose) this.opts.onClose(this);
    var host = this.root.closest(".vdo-floating") || this.root;
    host.parentNode && host.parentNode.removeChild(host);
  };

  VdoPlayer.prototype.setPreset = function (preset) {
    this.root.className = "vdo-player vdo-preset-" + preset;
    if (this.opts.glow) this.root.classList.add("vdo-glow");
    this.root.setAttribute("data-playing", this._playing ? "true" : "false");
    this.root.setAttribute("data-mode", this.mode);
    if (this.fluid) this.root.setAttribute("data-fluid", "true");
  };

  // Catalog of available aesthetic presets (for galleries/pickers).
  VdoPlayer.PRESETS = [
    "glass", "minimal", "neon", "editorial", "cinematic",
    "youtube", "broadcast", "connatix", "teads", "reels", "spotlight", "vapor", "mono",
  ];

  VdoPlayer.prototype.destroy = function () {
    if (this._autoAdTimer) clearTimeout(this._autoAdTimer);
    try {
      this.content.pause();
      this.ad.pause();
    } catch (e) {}
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
  };

  window.VdoPlayer = VdoPlayer;

  /* ==========================================================================
     VdoSkin — Teads-style brand "Skin" takeover. Wraps a centered content
     column with a full-bleed background video, brand logo/headline, a 260x60
     CTA, mute control, and an end card shown when the video finishes.

     new VdoSkin(container, {
       videoSrc, image, accent, brand, logo, headline,
       cta: { text, url }, endCard: { headline, cta }, contentHTML,
       orientation: 'landscape'|'square'|'vertical', loop
     });
     ========================================================================== */
  function VdoSkin(container, opts) {
    opts = opts || {};
    this.container = typeof container === "string" ? document.querySelector(container) : container;
    this.opts = opts;
    this._build();
  }

  VdoSkin.prototype._build = function () {
    var o = this.opts;
    var self = this;
    var root = el("div", "vdo-skin");
    if (o.accent) root.style.setProperty("--vdo-accent", o.accent);
    root.setAttribute("data-orientation", o.orientation || "landscape");

    // Background (video preferred, else image, else gradient).
    var bg = el("div", "vdo-skin-bg");
    var video = null;
    if (o.videoSrc) {
      video = el("video", null);
      video.src = o.videoSrc;
      video.muted = true;
      video.autoplay = true;
      video.loop = o.loop === true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      bg.appendChild(video);
    } else if (o.image) {
      var im = el("img", null);
      im.src = o.image;
      bg.appendChild(im);
    } else {
      bg.style.background = "radial-gradient(circle at 30% 20%, #2a3550, #0b0d12)";
    }
    this.video = video;

    // Top brand bar.
    var top = el("div", "vdo-skin-top");
    if (o.logo) {
      var logo = el("img", "vdo-skin-logo");
      logo.src = o.logo;
      top.appendChild(logo);
    } else {
      top.appendChild(el("span", "vdo-skin-brandtag", o.brand || "Your Brand"));
    }
    if (o.headline) top.appendChild(el("span", "vdo-skin-headline", o.headline));
    top.appendChild(el("span", "vdo-skin-adlabel", "Ad"));

    // Wrapped content column.
    var content = el("div", "vdo-skin-content", o.contentHTML || "");

    // CTA + mute.
    var ctaText = (o.cta && o.cta.text) || "Learn More";
    var cta = document.createElement("a");
    cta.className = "vdo-skin-cta";
    cta.textContent = ctaText;
    cta.href = (o.cta && o.cta.url) || "#";
    cta.target = "_blank";
    cta.rel = "noopener";

    var mute = el("button", "vdo-iconbtn vdo-skin-mute", ICONS.mute);
    mute.addEventListener("click", function () {
      if (!self.video) return;
      self.video.muted = !self.video.muted;
      mute.innerHTML = self.video.muted ? ICONS.mute : ICONS.volume;
    });

    // End card.
    var end = el("div", "vdo-skin-endcard");
    var box = el("div", "vdo-endcard-box");
    box.appendChild(el("h3", null, (o.endCard && o.endCard.headline) || o.brand || "Discover more"));
    var actions = el("div", "vdo-endcard-actions");
    var primary = el("button", "vdo-endcard-btn vdo-endcard-primary", (o.endCard && o.endCard.cta) || ctaText);
    var replay = el("button", "vdo-endcard-btn vdo-endcard-replay", "Replay");
    primary.addEventListener("click", function () {
      window.open(cta.href, "_blank", "noopener");
    });
    replay.addEventListener("click", function () {
      self.replay();
    });
    actions.appendChild(primary);
    actions.appendChild(replay);
    box.appendChild(actions);
    end.appendChild(box);

    root.appendChild(bg);
    root.appendChild(top);
    root.appendChild(content);
    root.appendChild(cta);
    root.appendChild(mute);
    root.appendChild(end);

    this.root = root;
    this.container.appendChild(root);

    if (video) {
      video.addEventListener("ended", function () {
        if (!video.loop) root.setAttribute("data-ended", "true");
      });
      video.play().catch(function () {});
    }
  };

  VdoSkin.prototype.replay = function () {
    this.root.removeAttribute("data-ended");
    if (this.video) {
      this.video.currentTime = 0;
      this.video.play().catch(function () {});
    }
  };

  VdoSkin.prototype.showEndCard = function () {
    this.root.setAttribute("data-ended", "true");
  };

  VdoSkin.prototype.destroy = function () {
    try { this.video && this.video.pause(); } catch (e) {}
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
  };

  window.VdoSkin = VdoSkin;
})();
