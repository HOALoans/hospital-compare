/**
 * Shared Parigrado site header for static pages (/mission-tracker/, /hca/).
 * Mirrors the React header in src/App.tsx: brand mark/logo + name + tagline,
 * primary nav tabs with icons, partner query preservation, hideHcaNav.
 *
 * Usage (place as first child of <body>):
 *   <link rel="stylesheet" href="/site-header.css" />
 *   <script src="/site-header.js" data-active="mission|hca|home|compare"></script>
 */
(function () {
  var DEFAULT_NAME = "Parigrado";
  var DEFAULT_TAGLINE =
    "Compare hospital quality to county, state, and national peers using public CMS & CDC data";
  var DEFAULT_PRIMARY = "#4f46e5";

  var ICON_ACTIVITY =
    '<svg class="pg-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>';
  var ICON_HOME =
    '<svg class="pg-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  var ICON_BUILDING =
    '<svg class="pg-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>';
  var ICON_NEWS =
    '<svg class="pg-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>';

  var script = document.currentScript;
  var active = (script && script.getAttribute("data-active")) || "";

  function withPartner(href, partner) {
    if (!partner) return href;
    var parts = href.split("#");
    var base = parts[0];
    var hash = parts[1] ? "#" + parts[1] : "";
    if (/[?&]partner=/.test(base)) return href;
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    return base + sep + "partner=" + encodeURIComponent(partner) + hash;
  }

  function shouldHideHca(partnerId) {
    var lower = (partnerId || "").toLowerCase();
    var hide =
      lower === "aarp" ||
      lower === "aarp-open" ||
      lower === "florida-blue" ||
      lower === "florida-blue-open";
    try {
      hide = hide || sessionStorage.getItem("parigrado:hide-hca-nav") === "1";
    } catch (e) {}
    if (!hide && /(?:^|;\s*)parigrado_hide_hca=1(?:;|$)/.test(document.cookie)) {
      hide = true;
    }
    return hide;
  }

  function persistHideHca(partnerId) {
    var lower = (partnerId || "").toLowerCase();
    if (
      lower === "aarp" ||
      lower === "aarp-open" ||
      lower === "florida-blue" ||
      lower === "florida-blue-open"
    ) {
      try {
        sessionStorage.setItem("parigrado:hide-hca-nav", "1");
      } catch (e) {}
      document.cookie = "parigrado_hide_hca=1; Path=/; SameSite=Lax; Max-Age=86400";
    }
  }

  function tabClass(id) {
    return "pg-nav-tab" + (active === id ? " is-active" : "");
  }

  function tabAttrs(id) {
    return active === id ? ' aria-current="page"' : "";
  }

  var header = document.createElement("header");
  header.className = "pg-header";
  header.id = "pg-site-header";
  header.setAttribute("role", "banner");
  header.innerHTML =
    '<div class="pg-header-inner">' +
    '<a class="pg-brand" data-nav="brand" href="/">' +
    '<span class="pg-brand-mark" data-brand-mark>' +
    ICON_ACTIVITY +
    "</span>" +
    '<img class="pg-brand-logo" data-brand-logo hidden alt="" />' +
    '<span class="pg-brand-text">' +
    '<span class="pg-brand-name" data-brand-name>' +
    DEFAULT_NAME +
    "</span>" +
    '<span class="pg-brand-tagline" data-brand-tagline>' +
    DEFAULT_TAGLINE +
    "</span>" +
    "</span>" +
    "</a>" +
    '<div class="pg-header-nav-wrap">' +
    '<nav class="pg-nav" aria-label="Primary">' +
    '<a class="' +
    tabClass("home") +
    '" data-nav="home" href="/" aria-label="Home"' +
    tabAttrs("home") +
    ">" +
    ICON_HOME +
    '<span class="pg-label-full">Home</span>' +
    "</a>" +
    '<a class="' +
    tabClass("compare") +
    '" data-nav="compare" href="/?view=compare" aria-label="Compare Multiple Hospitals"' +
    tabAttrs("compare") +
    ">" +
    ICON_BUILDING +
    '<span class="pg-label-full">Compare Multiple Hospitals</span>' +
    '<span class="pg-label-mid">Compare Hospitals</span>' +
    '<span class="pg-label-short">Compare</span>' +
    "</a>" +
    '<a class="' +
    tabClass("mission") +
    '" data-nav="mission" href="/mission-tracker/" aria-label="Single Hospital Health Dashboard"' +
    tabAttrs("mission") +
    ">" +
    ICON_ACTIVITY +
    '<span class="pg-label-full">Single Hospital Health Dashboard</span>' +
    '<span class="pg-label-mid">Hospital Health</span>' +
    '<span class="pg-label-short">Hospital</span>' +
    "</a>" +
    '<a class="' +
    tabClass("hca") +
    '" data-nav="hca" href="/hca/" aria-label="HCA News and Talking Point Dashboard"' +
    tabAttrs("hca") +
    ">" +
    ICON_NEWS +
    '<span class="pg-label-full">HCA News &amp; Talking Points</span>' +
    '<span class="pg-label-short">HCA News</span>' +
    "</a>" +
    "</nav>" +
    "</div>" +
    "</div>";

  if (script && script.parentNode) {
    script.parentNode.insertBefore(header, script);
  } else {
    document.body.insertBefore(header, document.body.firstChild);
  }

  var params = new URLSearchParams(location.search);
  var partner = (params.get("partner") || "").trim();
  persistHideHca(partner);

  var hideHca = shouldHideHca(partner);
  var hcaTab = header.querySelector('[data-nav="hca"]');
  if (hcaTab && hideHca) hcaTab.remove();

  header.querySelectorAll("a[data-nav]").forEach(function (el) {
    el.setAttribute("href", withPartner(el.getAttribute("href") || "/", partner));
  });

  function applyBranding(branding) {
    if (!branding) return;
    var primary = branding.primaryColor || DEFAULT_PRIMARY;
    document.documentElement.style.setProperty("--brand-primary", primary);
    if (branding.secondaryColor) {
      document.documentElement.style.setProperty(
        "--brand-secondary",
        branding.secondaryColor
      );
    }

    var nameEl = header.querySelector("[data-brand-name]");
    var tagEl = header.querySelector("[data-brand-tagline]");
    var markEl = header.querySelector("[data-brand-mark]");
    var logoEl = header.querySelector("[data-brand-logo]");

    if (nameEl) nameEl.textContent = branding.displayName || DEFAULT_NAME;
    if (tagEl) {
      tagEl.textContent = branding.tagline || DEFAULT_TAGLINE;
    }

    if (branding.logoUrl && logoEl && markEl) {
      logoEl.src = branding.logoUrl;
      logoEl.alt = branding.logoAlt || branding.displayName || DEFAULT_NAME;
      logoEl.hidden = false;
      markEl.hidden = true;
    }

    if (branding.hideHcaNav) {
      try {
        sessionStorage.setItem("parigrado:hide-hca-nav", "1");
      } catch (e) {}
      document.cookie = "parigrado_hide_hca=1; Path=/; SameSite=Lax; Max-Age=86400";
      var hca = header.querySelector('[data-nav="hca"]');
      if (hca) hca.remove();
    }
  }

  if (partner) {
    fetch("/api/partners/" + encodeURIComponent(partner))
      .then(function (res) {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error("partner fetch failed");
        return res.json();
      })
      .then(function (branding) {
        if (branding) applyBranding(branding);
      })
      .catch(function () {
        /* keep default Parigrado chrome */
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("a[data-pg-partner-link], footer a[href='/']").forEach(function (el) {
      el.setAttribute("href", withPartner(el.getAttribute("href") || "/", partner));
    });
  });
})();
