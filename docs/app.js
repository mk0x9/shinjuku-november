/* Stays near JR Shinjuku, Shibuya, Gotanda and Hamamatsucho: pins, clusters, hover card, side panel, client-side filters. Data: window.STAYS (data.js). */
(() => {
  const DATA = window.STAYS || [];
  const IMG_BASE = window.IMG_BASE || "";
  const STATIONS = window.STATIONS || [];
  const RADIUS_KM = window.RADIUS_KM || 2;
  const stationOf = (r) => STATIONS.find((s) => s.key === r.station) || { name: "station" };
  const TYPES = {
    business_hotel: { label: "Business hotel", color: "#2563eb" }, city_hotel: { label: "City hotel", color: "#4338ca" },
    capsule_hotel: { label: "Capsule / pod", color: "#0f766e" }, hostel: { label: "Hostel", color: "#15803d" },
    leisure_hotel: { label: "Leisure (love) hotel", color: "#db2777" }, ryokan: { label: "Ryokan", color: "#92400e" },
    guesthouse: { label: "Guesthouse", color: "#c2410c" }, apartment: { label: "Apartment", color: "#7c3aed" },
    other: { label: "Other", color: "#6b7280" },
  };
  const BANDS = [[10000, "var(--p1)", "< ¥10k"], [14000, "var(--p2)", "¥10-14k"], [17000, "var(--p3)", "¥14-17k"], [Infinity, "var(--p4)", "¥17-20k"]];
  const SCORES = [["room", "Room"], ["bath", "Bath"], ["breakfast", "Breakfast"], ["service", "Service"], ["clean", "Clean"]];
  const TOUCH = window.matchMedia("(hover: none)").matches;
  const PRICE_MAX = 20000, RATING_ANY = 2.5, DIST_MAX = RADIUS_KM;
  const typesPresent = Object.keys(TYPES).filter((t) => DATA.some((r) => r.type === t));
  const stationKeys = STATIONS.map((s) => s.key);
  const DEFAULTS = { price: PRICE_MAX, rating: RATING_ANY, dist: DIST_MAX, meals: "any", priv: false, mixed: false, types: typesPresent,
    stations: stationKeys, q: "", colorBy: "type" };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const yen = (v) => (v == null ? "—" : "¥" + Math.round(v).toLocaleString("en-US"));
  const yenK = (v) => "¥" + (v / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  // Jalan serves the same photo at several widths: pictL 300px, pict2L 600px, pict4L 1200px. data.js stores pict4L/... paths.
  const SIZE_RE = /^pict\d?L\//;
  const photo = (u, size = "pictL") => (/^https?:/.test(u) ? u : IMG_BASE + u.replace(SIZE_RE, size + "/"));
  const photoKey = (u) => u.replace(SIZE_RE, "");
  const thumb = (r, u, size) => `<img loading="lazy" src="${esc(photo(u, size))}" alt="" data-rid="${esc(r.id)}" data-ph="${esc(photoKey(u))}">`;
  const jalanUrl = (r) => `https://www.jalan.net/yad${r.id}/`;
  const STAY_Q = "stayYear=2026&stayMonth=11&stayDay=15&stayCount=1&roomCount=1&adultNum=2&dateUndecided=0";
  const bookUrl = (r, p) => `https://www.jalan.net/uw/uwp3200/uww3201init.do?yadNo=${r.id}&planCd=${p.planCd}&roomTypeCd=${p.roomCd}&${STAY_Q}`;
  const plansUrl = (r) => `https://www.jalan.net/yad${r.id}/plan/?${STAY_Q}&maxPrice=20000`;
  const typeOf = (r) => TYPES[r.type] || TYPES.other;
  const GENDER = { women: "Women only", men: "Men only" };
  const genderTag = (p) => (p.gender ? ` <span class="tag-gender">${GENDER[p.gender]}</span>` : "");
  const BATHROOM = { shared: "shared bathroom", unknown: "" };
  const cancelText = (p) => (p.cancel === "non-refundable" ? "Non-refundable" : p.cancel ? `Free cancellation until ${fmtDate(p.cancel)}` : "");
  const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  const state = { ...DEFAULTS, types: new Set(DEFAULTS.types), stations: new Set(DEFAULTS.stations) };

  function planOk(p) {
    if (p.price > state.price) return false;
    if (state.meals !== "any" && p.meals !== state.meals) return false;
    if (state.priv && p.occupancy !== "private") return false;
    if (state.mixed && p.gender) return false;
    return true;
  }
  const qualifyingPlans = (r) => (r.plans || []).filter(planOk).sort((a, b) => a.price - b.price);
  function passes(r) {
    if (!state.types.has(r.type)) return false;
    if (!state.stations.has(r.station)) return false;
    if (r.dist > state.dist + 1e-9) return false;
    if (state.rating > RATING_ANY && (r.rating || 0) < state.rating - 1e-9) return false;
    if (state.q) {
      const hay = `${r.name} ${r.nameJp} ${r.summary || ""} ${r.access || ""} ${r.address || ""} ${stationOf(r).name}`.toLowerCase();
      if (!hay.includes(state.q.toLowerCase())) return false;
    }
    return true;
  }
  const pinColor = (r, price) => (state.colorBy === "price" ? BANDS.find(([max]) => price < max)[1] : typeOf(r).color);

  // Map
  const map = (window.stayMap = L.map("map", { zoomControl: false, maxZoom: 19 }).setView([STATIONS[0].lat, STATIONS[0].lng], 14));
  L.control.zoom({ position: "bottomright" }).addTo(map);
  // Base maps. Default: the OpenFreeMap vector map (MapLibre GL) with labels switched to English. Raster options keep local-language labels.
  // tile.openstreetmap.org refuses requests without a Referer (what a file:// page sends), so from disk the
  // raster fallback for the vector map is the OSM France-hosted Humanitarian (HOT) style.
  const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const OFM_STYLE = "https://tiles.openfreemap.org/styles/liberty";
  const EN_NAME = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
  const rasters = {
    osm: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: OSM_ATTR }),
    hot: L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", { maxZoom: 19, subdomains: "abc",
      attribution: `${OSM_ATTR}, tiles style by <a href="https://www.hotosm.org/">HOT</a> hosted by <a href="https://openstreetmap.fr/">OSM France</a>` }),
    otm: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { subdomains: "abc", maxNativeZoom: 17, maxZoom: 19,
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, ' +
        '<a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> ' +
        '(<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)' }),
  };
  const fallbackRaster = rasters[location.protocol === "file:" ? "hot" : "osm"];
  const BASES = [["vector", "English (vector)"], ["osm", "OpenStreetMap"], ["hot", "OpenStreetMap HOT"], ["otm", "OpenTopoMap"]];
  const DEFAULT_BASE = "vector";
  // The layer switcher only holds empty marker layers; syncBase() decides which real layer is shown.
  const baseTokens = Object.fromEntries(BASES.map(([k]) => [k, Object.assign(L.layerGroup(), { baseKey: k })]));
  const circleLayer = L.layerGroup();
  const layersCtl = L.control.layers(Object.fromEntries(BASES.map(([k, label]) => [label, baseTokens[k]])),
    { "2 km circles &amp; stations": circleLayer }, { position: "bottomright" }).addTo(map);
  let baseKey = DEFAULT_BASE, shownBase = null, vector = null, vectorState = "pending", vectorOk = false, vectorWatch = 0;
  baseTokens[baseKey].addTo(map);

  // The vector map, or the raster fallback once it has failed; null while the style is still loading.
  const closeUp = () => (vectorState === "ready" ? vector : vectorState === "failed" ? fallbackRaster : null);
  function wantedBase() {
    if (baseKey === "vector") return closeUp();
    if (baseKey === "otm" && otmFailed) return fallbackRaster;
    return rasters[baseKey];
  }
  // OpenTopoMap is a small volunteer server: if its tiles keep failing before any has loaded, use the OSM fallback.
  let otmFailed = false, otmErrors = 0, otmLoaded = false;
  rasters.otm.on("tileload", () => { otmLoaded = true; });
  rasters.otm.on("tileerror", () => {
    if (otmLoaded || otmFailed || ++otmErrors < 8) return;
    otmFailed = true;
    console.warn("OpenTopoMap tiles failed to load; using OpenStreetMap tiles instead.");
    syncBase();
  });
  // Calls `cb` once `layer` has drawn. The vector map waits for MapLibre's "idle" with at least one tile loaded
  // (if that never happens, watchVector gives up on it); tile layers also give up after a few seconds.
  function whenDrawn(layer, cb) {
    let done = false;
    const once = () => { if (!done) { done = true; cb(); } };
    if (layer === vector) {
      const gl = vector.getMaplibreMap();
      const check = () => { if (vectorOk) once(); else if (vectorState === "ready" && map.hasLayer(vector)) gl.once("idle", check); };
      if (vectorOk && gl.loaded()) once(); else gl.once("idle", check);
      return;
    }
    setTimeout(once, 4000);
    if (!layer.isLoading()) once(); else layer.once("load", once);
  }
  // Show the wanted base layer. The previous one stays underneath until the new one has drawn, so switching doesn't flash an empty map.
  const allBases = () => [vector, ...Object.values(rasters)].filter(Boolean);
  function syncBase() {
    const want = wantedBase();
    if (!want || want === shownBase) return;
    shownBase = want;
    map.addLayer(want);
    if (want === vector) watchVector();
    whenDrawn(want, () => {
      if (shownBase === want) for (const l of allBases()) if (l !== want && map.hasLayer(l)) map.removeLayer(l);
    });
  }
  function setBase(key) {
    if (!baseTokens[key] || key === baseKey) return;
    map.removeLayer(baseTokens[baseKey]);
    baseKey = key;
    baseTokens[key].addTo(map);
    syncBase();
  }
  function vectorFailed(why) {
    console.warn(`English vector map unavailable (${why}); using raster tiles with local-language labels.`);
    vectorState = "failed";
    if (vector && map.hasLayer(vector)) map.removeLayer(vector);
    if (shownBase === vector) shownBase = null;
    syncBase();
  }
  // Give up on the vector map if no tile has loaded after 3 errors or 10 s of the page being visible (blocked
  // tiles, GL failure). Hidden tabs don't render, so time spent hidden doesn't count.
  function watchVector() {
    if (vectorOk || vectorWatch) return;
    const gl = vector.getMaplibreMap();
    let errors = 0, visibleMs = 0;
    gl.on("data", (e) => { if (e.dataType === "source" && e.tile) vectorOk = true; });
    gl.on("error", () => { errors++; });
    vectorWatch = setInterval(() => {
      if (vectorOk || !map.hasLayer(vector)) { clearInterval(vectorWatch); vectorWatch = 0; return; }
      if (document.visibilityState === "visible") visibleMs += 500;
      if (errors < 3 && visibleMs < 10000) return;
      clearInterval(vectorWatch); vectorWatch = 0;
      vectorFailed(errors ? "tiles failed to load" : "did not load");
    }, 500);
  }
  map.on("baselayerchange", (e) => {
    if (!e.layer.baseKey || e.layer.baseKey === baseKey) return;
    baseKey = e.layer.baseKey;
    syncBase();
    scheduleHash();
  });
  map.on("zoomend", syncBase);
  syncBase();

  // maplibre-gl-leaflet 0.1.4 finishes a zoom in a requestAnimationFrame callback that throws if the layer was
  // removed in the meantime (e.g. while switching base maps). Same code, with a guard.
  const SafeMaplibreGL = L.MaplibreGL ? L.MaplibreGL.extend({
    _transitionEnd() {
      L.Util.requestAnimFrame(function () {
        if (!this._map || !this._glMap) return;
        const zoom = this._map.getZoom(), center = this._map.getCenter();
        const offset = this._map.latLngToContainerPoint(this._map.getBounds().getNorthWest());
        this._resizeContainer();
        L.DomUtil.setTransform(this._glMap._actualCanvas, offset, 1);
        this._glMap.once("moveend", () => { if (this._map) this._zoomEnd(); });
        this._glMap.jumpTo({ center, zoom: zoom - 1 });
      }, this);
    },
  }) : null;
  const webgl = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })();
  if (!webgl || !SafeMaplibreGL) vectorFailed(webgl ? "MapLibre not loaded" : "no WebGL");
  else {
    const ctl = new AbortController();
    const abort = setTimeout(() => ctl.abort(), 8000);
    fetch(OFM_STYLE, { signal: ctl.signal }).then((res) => { if (!res.ok) throw new Error(`style HTTP ${res.status}`); return res.json(); })
      .then((style) => {
        clearTimeout(abort);
        for (const l of style.layers) {
          if (l.type === "symbol" && l.layout && JSON.stringify(l.layout["text-field"] || "").includes('"name')) l.layout["text-field"] = EN_NAME;
        }
        // A fixed attribution (customAttribution) so it is removed cleanly when the layer is swapped out;
        // otherwise the plugin re-adds the style's own attribution on load and it stays behind.
        vector = new SafeMaplibreGL({ style, attributionControl: { customAttribution: `<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ` +
          `<a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> ${OSM_ATTR}` } });
        vector.on("add", () => vector.getMaplibreMap().on("error", (e) => console.warn("Vector map:", e && e.error ? e.error.message : e)));
        vectorState = "ready";
        syncBase();
      })
      .catch((e) => { clearTimeout(abort); vectorFailed(e.message || String(e)); });
  }

  // The 2 km search radius around each station and the station markers (an overlay in the layer switcher, on by default).
  // Clicking a station marker zooms to its circle.
  map.createPane("ring").style.zIndex = 390;
  const circleBounds = (keys) => keys.map((k) => STATIONS.find((s) => s.key === k)).filter(Boolean)
    .map((s) => L.latLng(s.lat, s.lng).toBounds(RADIUS_KM * 2000 * 1.05)).reduce((a, b) => a.extend(b), L.latLngBounds([]));
  // Keep the circles clear of the filter box when it is open on a wide screen.
  const leftPad = () => (window.innerWidth > 700 && !$("filters").classList.contains("collapsed") ? $("filters").offsetWidth + 20 : 10);
  const zoomTo = (keys) => { const b = circleBounds(keys); if (b.isValid()) map.fitBounds(b, { paddingTopLeft: [leftPad(), 10], paddingBottomRight: [10, 10] }); };
  for (const s of STATIONS) {
    L.circle([s.lat, s.lng], { radius: RADIUS_KM * 1000, pane: "ring", interactive: false,
      color: "#111827", weight: 2, opacity: 0.7, dashArray: "6 6", fillColor: "#111827", fillOpacity: 0.04 }).addTo(circleLayer);
    L.marker([s.lat, s.lng], { keyboard: false, zIndexOffset: -1000,
      icon: L.divIcon({ className: "pin-wrap", iconSize: [0, 0], iconAnchor: [0, 0], html: `<div class="station">${s.label} Sta.</div>` }) })
      .bindTooltip(`${s.name} station · centre of a ${RADIUS_KM} km circle · click to zoom`, { direction: "top", offset: [0, -14] })
      .on("click", () => zoomTo([s.key])).addTo(circleLayer);
  }
  circleLayer.addTo(map);

  const clusters = L.markerClusterGroup({
    maxClusterRadius: 30, showCoverageOnHover: false, spiderfyOnMaxZoom: true, disableClusteringAtZoom: 16,
    iconCreateFunction(c) {
      const prices = c.getAllChildMarkers().map((m) => m.options.price).filter((v) => v != null);
      const low = prices.length ? Math.min(...prices) : null;
      return L.divIcon({ className: "cl-wrap", iconSize: [40, 40],
        html: `<div class="cl"><b>${c.getChildCount()}</b>${low != null ? `<span>from ${yenK(low)}</span>` : ""}</div>` });
    },
  });
  map.addLayer(clusters);

  let noCardUntil = 0; // set on click: the pin icon is replaced under the pointer, which fires mouseover again
  const located = DATA.filter((r) => r.lat != null && r.lng != null);
  const markers = located.map((r) => {
    const m = L.marker([r.lat, r.lng], { riseOnHover: true, keyboard: false, title: "" });
    m.stay = r;
    if (TOUCH) {
      m.on("click", () => showCard(r, m, true));
    } else {
      m.on("mouseover", () => { if (Date.now() > noCardUntil) showCard(r, m, false); });
      m.on("mouseout", () => hideCard(300));
      m.on("click", () => { noCardUntil = Date.now() + 800; hideCardNow(); openPanel(r); });
    }
    return m;
  });

  let activeId = null;
  // `forced`: the open property is shown (greyed) even when the filters exclude it, e.g. from a shared link.
  const ratingHtml = (r) => (r.rating ? ` <span class="r">· ${r.rating.toFixed(1)}</span>` : "");
  const sharedOnly = (r) => (r.plans || []).every((p) => p.occupancy === "shared");
  function pinIcon(r, price, forced) {
    const label = `${price != null ? yenK(price) : "—"}${ratingHtml(r)}`;
    const color = forced ? "#6b7280" : pinColor(r, price);
    return L.divIcon({ className: "pin-wrap", iconSize: [0, 0], iconAnchor: [0, 0],
      html: `<div class="pin${r.id === activeId ? " active" : ""}${forced ? " forced" : ""}${sharedOnly(r) ? " shared" : ""}" style="background:${color};border-top-color:${color}">${label}</div>` });
  }
  const matchesFilters = (r) => passes(r) && qualifyingPlans(r).length > 0;
  const anyPrice = (r) => Math.min(...(r.plans || []).map((p) => p.price));

  function apply() {
    const visible = [];
    let n = 0;
    for (const m of markers) {
      const r = m.stay;
      const q = passes(r) ? qualifyingPlans(r) : [];
      m.options.price = q.length ? q[0].price : null;
      if (q.length) { m.setIcon(pinIcon(r, q[0].price)); visible.push(m); n++; }
      else if (r.id === activeId) { m.setIcon(pinIcon(r, anyPrice(r), true)); visible.push(m); }
    }
    clusters.clearLayers();
    clusters.addLayers(visible);
    $("count").textContent = n;
    renderLegend();
    if (activeId) { const r = DATA.find((x) => x.id === activeId); if (r) renderPanel(r); }
  }

  // Hover / tap card
  const card = $("card");
  let hideTimer = null;
  function photosHtml(r, max) {
    const ph = (r.photos || []).slice(0, max).map(([u]) => u);
    return ph.length ? `<div class="photos" style="grid-template-columns:repeat(${ph.length},1fr)">${
      ph.map((u) => thumb(r, u)).join("")}</div>` : "";
  }
  function scoresHtml(r) {
    const s = SCORES.filter(([k]) => r.scores && r.scores[k] != null).map(([k, l]) => `<span>${l} <b>${r.scores[k].toFixed(1)}</b></span>`).join("");
    return s ? `<div class="scores">${s}</div>` : "";
  }
  function badgeHtml(r) {
    return `<span class="badge" style="background:${typeOf(r).color}">${esc(typeOf(r).label)}</span>` +
      (sharedOnly(r) ? '<span class="badge shared-badge">Shared only</span>' : "");
  }
  function headHtml(r) {
    return `<h2>${esc(r.name)}</h2><div class="jp">${esc(r.nameJp)}</div>
      <div class="badges"><span class="stars">★ ${r.rating ? r.rating.toFixed(1) : "—"}</span>
      <span class="muted">${r.reviews ? r.reviews.toLocaleString("en-US") + " reviews" : "no reviews yet"}</span>${badgeHtml(r)}
      <span class="muted">· ${r.dist.toFixed(1)} km from ${esc(stationOf(r).name)}</span></div>${scoresHtml(r)}`;
  }
  function roomLine(p) {
    return [p.occupancy === "shared" ? "Shared" : null, p.bedding, p.size, BATHROOM[p.bathroom] ?? p.bathroom]
      .filter(Boolean).join(" · ") || p.room || "";
  }
  function showCard(r, m, touch) {
    clearTimeout(hideTimer);
    let q = qualifyingPlans(r).slice(0, 3), off = false;
    if (!q.length) { q = [...r.plans].sort((a, b) => a.price - b.price).slice(0, 3); off = true; }
    card.className = "card" + (touch ? " touch" : "");
    card.innerHTML = `${touch ? '<button class="icon-btn close" style="float:right" data-close>×</button>' : ""}${headHtml(r)}${photosHtml(r, 4)}
      ${r.summary ? `<div class="kv">${esc(r.summary)}</div>` : ""}
      ${r.access ? `<div class="kv"><b>Access:</b> ${esc(r.access)}</div>` : ""}
      ${r.strong && r.strong.length ? `<ul class="pts">${r.strong.slice(0, 3).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      ${r.watch ? `<div class="kv watch"><b>Watch-outs:</b> ${esc(r.watch)}</div>` : ""}
      <div class="top3">${q.map((p) => `<div class="pl${off ? " off" : ""}"><div class="meal">${esc(p.meals)}${p.occupancy === "shared" ? ' <span class="tag-shared">Shared</span>' : ""}${genderTag(p)}</div>
        <div class="price">${yen(p.price)}<small>${off ? "filtered out" : "room / night"}</small></div>
        <div class="one">${esc(p.room || "")}</div><div class="one">${esc(roomLine(p))}</div></div>`).join("")}</div>
      ${touch ? '<button class="btn" data-open>All plans &amp; booking</button>' : '<div class="hint">Click a photo to enlarge · click the card or pin for all plans and booking links</div>'}`;
    card.hidden = false;
    card.onclick = touch ? null : (e) => { if (!e.target.closest("img[data-ph]")) { noCardUntil = Date.now() + 800; hideCardNow(); openPanel(r); } };
    if (touch) {
      card.querySelector("[data-close]").onclick = hideCardNow;
      card.querySelector("[data-open]").onclick = () => { hideCardNow(); openPanel(r); };
      return;
    }
    const pt = map.latLngToContainerPoint(m.getLatLng());
    const w = card.offsetWidth, h = card.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    const panelW = $("panel").hidden ? 0 : $("panel").offsetWidth;
    let x = pt.x + 18;
    if (x + w > vw - panelW - 10) x = pt.x - w - 18;
    x = Math.max(10, x);
    const y = Math.min(Math.max(10, pt.y - h / 2), vh - h - 10);
    card.style.left = x + "px"; card.style.top = Math.max(10, y) + "px";
  }
  function hideCard(delay = 150) { clearTimeout(hideTimer); hideTimer = setTimeout(hideCardNow, delay); }
  function hideCardNow() { clearTimeout(hideTimer); card.hidden = true; }
  // Keep the desktop card open while the pointer is on it, so its photos can be clicked.
  card.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  card.addEventListener("mouseleave", () => { if (!card.classList.contains("touch")) hideCard(); });

  // Side panel
  const panel = $("panel");
  // `fromHash`: restoring state from the URL, so don't write a new history entry.
  function openPanel(r, fromHash) {
    activeId = r.id;
    renderPanel(r);
    panel.hidden = false;
    panel.scrollTop = 0;
    apply();
    if (!fromHash) writeHash(true); // pushState, so Back closes the panel
  }
  function closePanel(fromHash) {
    panel.hidden = true; activeId = null; apply();
    if (!fromHash) scheduleHash();
  }
  function renderPanel(r) {
    const ph = (r.photos || []).slice(0, 4).map(([u]) => u);
    const plans = [...(r.plans || [])].sort((a, b) => a.price - b.price);
    const nq = plans.filter(planOk).length;
    $("panel-body").innerHTML = `
      ${ph.length ? `<div class="gallery${ph.length === 1 ? " n1" : ""}" style="grid-template-rows:repeat(${Math.max(1, ph.length - 1)},1fr)">${ph.map((u, i) => thumb(r, u, i ? "pictL" : "pict2L")).join("")}</div>` : ""}
      ${headHtml(r)}
      ${matchesFilters(r) ? "" : '<div class="note">This property does not match the current filters.</div>'}
      <div class="links"><a class="btn" href="${plansUrl(r)}" target="_blank" rel="noopener">Plans on Jalan (Nov 15)</a>
        <a class="btn light" href="${jalanUrl(r)}" target="_blank" rel="noopener">Jalan page</a>
        <a class="btn light" href="https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}" target="_blank" rel="noopener">Google Maps</a>
        <button class="btn light" data-copy>Copy link</button></div>
      ${r.summary ? `<div class="kv">${esc(r.summary)}</div>` : ""}
      ${r.typeNote ? `<div class="kv muted">${esc(r.typeNote)}</div>` : ""}
      ${r.access ? `<div class="kv"><b>Access:</b> ${esc(r.access)}</div>` : ""}
      ${r.address ? `<div class="kv"><b>Address:</b> ${esc(r.address)}</div>` : ""}
      ${r.checkInOut ? `<div class="kv"><b>Check-in / out:</b> ${esc(r.checkInOut)}</div>` : ""}
      ${r.strong && r.strong.length ? `<h3>Strong points</h3><ul class="pts">${r.strong.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      ${r.watch ? `<h3>Watch-outs</h3><div class="watch">${esc(r.watch)}</div>` : ""}
      ${r.reviewSummary ? `<h3>Reviews</h3><div>${esc(r.reviewSummary)}</div>` : ""}
      <div class="plans-head"><h3>Plans under ¥20,000 (${plans.length})</h3><span class="muted">${nq} match filters</span></div>
      ${plans.map((p) => planHtml(r, p, planOk(p))).join("")}`;
  }
  function planHtml(r, p, ok) {
    const facts = [
      ["Room", p.room], ["Beds", p.bedding], ["Size", p.size], ["Bathroom", BATHROOM[p.bathroom] ?? p.bathroom],
      ["Smoking", p.smoking !== "unknown" ? p.smoking : ""], ["Breakfast", p.breakfast], ["Notes", p.notes],
    ].filter(([, v]) => v);
    return `<div class="plan${ok ? "" : " off"}"><div class="pname">${esc(p.name || "Plan")}<div class="jp">${esc(p.nameJp)}</div></div>
      <div class="facts"><div class="meal">${esc(p.meals)} · <span class="${p.occupancy === "shared" ? "tag-shared" : "tag-private"}">${p.occupancy === "shared" ? "Shared" : "Private room"}</span>${genderTag(p)}</div>
        ${facts.map(([k, v]) => `<div><span class="muted">${k}:</span> ${esc(v)}</div>`).join("")}</div>
      ${p.photo ? thumb(r, p.photo) : "<div></div>"}
      <div class="foot"><span><b class="plan-price">${yen(p.price)}</b> <span class="muted">room total, Nov 15</span><br>
        <span class="muted">${esc(cancelText(p))}${p.oneNight ? " · 1-night limit" : ""}${p.roomsLeft ? ` · ${p.roomsLeft} left` : ""}</span></span>
        <a class="btn" href="${bookUrl(r, p)}" target="_blank" rel="noopener">Book on Jalan</a></div></div>`;
  }

  // Lightbox: every photo of one property (its own photos, then plan room photos, deduplicated).
  const lb = $("lightbox"), lbImg = $("lb-img");
  let lbItems = [], lbIdx = 0, lbRid = null, touchX = null, touchY = null;
  function galleryItems(r) {
    const items = [], seen = new Set();
    const add = (u, label) => { const k = photoKey(u); if (!seen.has(k)) { seen.add(k); items.push({ u, k, label }); } };
    for (const [u, cap] of r.photos || []) add(u, cap || "");
    for (const p of r.plans || []) for (const u of p.photos || []) add(u, `Room: ${p.room || roomLine(p)}`);
    return items;
  }
  function openLightbox(r, key, index) {
    lbItems = galleryItems(r);
    if (!lbItems.length) return;
    lbRid = r.id;
    lbIdx = index != null ? Math.min(Math.max(0, index), lbItems.length - 1) : Math.max(0, lbItems.findIndex((it) => it.k === key));
    $("lb-title").textContent = r.name;
    lb.hidden = false;
    document.body.classList.add("lb-open");
    showLightbox();
  }
  function closeLightbox() { lb.hidden = true; document.body.classList.remove("lb-open"); lbImg.removeAttribute("src"); scheduleHash(); }
  function showLightbox() {
    const i = lbIdx, it = lbItems[i];
    // Show the (usually cached) small version at once, then swap in the 1200px one; fall back to 600px if that fails.
    lbImg.src = photo(it.u, "pictL");
    lbImg.classList.add("loading");
    const sizes = ["pict4L", "pict2L"];
    const tryNext = () => {
      const size = sizes.shift();
      if (!size) { if (i === lbIdx) lbImg.classList.remove("loading"); return; }
      const big = new Image();
      big.onload = () => { if (i === lbIdx) { lbImg.src = big.src; lbImg.classList.remove("loading"); } };
      big.onerror = tryNext;
      big.src = photo(it.u, size);
    };
    tryNext();
    $("lb-cap").textContent = it.label;
    $("lb-count").textContent = `${i + 1} / ${lbItems.length}`;
    lb.classList.toggle("single", lbItems.length < 2);
    for (const d of [-1, 1]) if (lbItems.length > 1) new Image().src = photo(lbItems[(i + d + lbItems.length) % lbItems.length].u, "pict4L");
    scheduleHash();
  }
  function stepLightbox(d) {
    if (lbItems.length < 2) return;
    lbIdx = (lbIdx + d + lbItems.length) % lbItems.length;
    showLightbox();
  }
  document.addEventListener("click", (e) => {
    const img = e.target.closest && e.target.closest("img[data-ph]");
    if (!img || lb.contains(img)) return;
    const r = DATA.find((x) => x.id === img.dataset.rid);
    if (r) { e.preventDefault(); e.stopPropagation(); openLightbox(r, img.dataset.ph); }
  }, true);
  lb.addEventListener("click", (e) => {
    const act = e.target.closest("[data-lb]");
    if (act) { const a = act.dataset.lb; if (a === "close") closeLightbox(); else stepLightbox(a === "next" ? 1 : -1); return; }
    if (e.target === lb || e.target.classList.contains("lb-stage")) closeLightbox();
  });
  lb.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) stepLightbox(dx < 0 ? 1 : -1);
  });

  // Filters
  $("types").innerHTML = typesPresent.map((t) => `<label class="chip"><input type="checkbox" value="${t}" checked><span data-color="${TYPES[t].color}">${
    esc(TYPES[t].label)} <small>${DATA.filter((r) => r.type === t).length}</small></span></label>`).join("");
  $("stations").innerHTML = STATIONS.map((s) => `<label class="chip"><input type="checkbox" value="${s.key}" checked><span data-color="#111827">${
    esc(s.name)} <small>${DATA.filter((r) => r.station === s.key).length}</small></span></label>`).join("");
  $("zoom").innerHTML = "Zoom to: " + STATIONS.map((s) => `<button class="link-btn" data-zoom="${s.key}">${esc(s.name.replace(/^JR /, ""))}</button>`).join("") +
    `<button class="link-btn" data-zoom="all">All</button>`;
  $("zoom").onclick = (e) => { const b = e.target.closest("[data-zoom]"); if (b) zoomTo(b.dataset.zoom === "all" ? stationKeys : [b.dataset.zoom]); };
  function paintChips() {
    document.querySelectorAll("#types input, #stations input").forEach((i) => {
      const s = i.nextElementSibling;
      s.style.background = i.checked ? s.dataset.color : "";
    });
  }
  function renderLegend() {
    const items = state.colorBy === "price" ? BANDS.map(([, c, l]) => [c, l]) : typesPresent.map((t) => [TYPES[t].color, TYPES[t].label]);
    $("legend").innerHTML = items.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join("") +
      "<span>Pin: cheapest matching plan · rating</span><span>Dashed pin border: shared rooms only</span>";
  }
  function syncLabels() {
    $("price-val").textContent = state.price >= PRICE_MAX ? "under ¥20,000" : "≤ " + yen(state.price);
    $("rating-val").textContent = state.rating <= RATING_ANY ? "any (incl. unrated)" : state.rating.toFixed(1) + "+";
    $("dist-val").textContent = state.dist >= DIST_MAX ? `≤ ${DIST_MAX} km (all)` : `≤ ${state.dist.toFixed(1)} km`;
    paintChips();
  }
  function readControls() {
    state.price = Number($("price").value);
    state.rating = Number($("rating").value);
    state.dist = Number($("dist").value);
    state.meals = document.querySelector("input[name=meals]:checked").value;
    state.priv = $("private").checked;
    state.mixed = $("mixed").checked;
    state.types = new Set([...document.querySelectorAll("#types input:checked")].map((i) => i.value));
    state.stations = new Set([...document.querySelectorAll("#stations input:checked")].map((i) => i.value));
    state.q = $("q").value.trim();
    state.colorBy = $("colorby").value;
    syncLabels();
  }
  function writeControls(s) {
    $("price").value = s.price; $("rating").value = s.rating; $("dist").value = s.dist; $("private").checked = s.priv; $("mixed").checked = s.mixed;
    (document.querySelector(`input[name=meals][value="${s.meals}"]`) || document.querySelector("input[name=meals]")).checked = true;
    document.querySelectorAll("#types input").forEach((i) => { i.checked = s.types.includes(i.value); });
    document.querySelectorAll("#stations input").forEach((i) => { i.checked = s.stations.includes(i.value); });
    $("q").value = s.q; $("colorby").value = s.colorBy;
  }
  let timer = 0;
  const onChange = () => { readControls(); clearTimeout(timer); timer = setTimeout(() => { apply(); scheduleHash(); }, 16); };
  map.on("overlayadd overlayremove", () => scheduleHash());

  // Shareable URL state: #map=<zoom>/<lat>/<lng>&r=<yadNo>&photo=<index> plus any non-default filters (st = stations).
  let hashTimer = 0, lastHash = null;
  function hashString() {
    const c = map.getCenter(), parts = [`map=${map.getZoom()}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`];
    const rid = activeId || (!lb.hidden ? lbRid : null);
    if (rid) parts.push(`r=${rid}`);
    if (rid && !lb.hidden && lbRid === rid) parts.push(`photo=${lbIdx}`);
    if (state.price !== DEFAULTS.price) parts.push(`maxp=${state.price}`);
    if (state.rating > RATING_ANY) parts.push(`minr=${state.rating}`);
    if (state.dist < DIST_MAX) parts.push(`dist=${state.dist}`);
    if (state.meals !== "any") parts.push(`meals=${state.meals === "Breakfast" ? "breakfast" : "none"}`);
    if (state.priv) parts.push("private=1");
    if (state.mixed) parts.push("mixed=1");
    if (state.types.size !== typesPresent.length) parts.push(`type=${[...state.types].join(",")}`);
    if (state.stations.size !== stationKeys.length) parts.push(`st=${[...state.stations].join(",")}`);
    if (state.q) parts.push(`q=${encodeURIComponent(state.q)}`);
    if (state.colorBy !== DEFAULTS.colorBy) parts.push(`color=${state.colorBy}`);
    if (!map.hasLayer(circleLayer)) parts.push("circle=0");
    if (baseKey !== DEFAULT_BASE) parts.push(`base=${baseKey}`);
    return parts.join("&");
  }
  function writeHash(push) {
    clearTimeout(hashTimer);
    const h = hashString();
    if (!push && h === lastHash) return;
    lastHash = h;
    try { history[push ? "pushState" : "replaceState"]({ stayMap: 1 }, "", "#" + h); } catch { location.replace("#" + h); }
  }
  function scheduleHash() { clearTimeout(hashTimer); hashTimer = setTimeout(() => writeHash(false), 300); }
  // Restore from the URL: filters first, then the view, then the panel and lightbox; unknown or invalid
  // values fall back to defaults. `panelOnly` (Back/Forward between this page's own entries) only opens or
  // closes the panel and lightbox, keeping the current filters and view.
  function applyHash(initial, panelOnly) {
    const h = location.hash.replace(/^#/, "");
    if (!initial && h === lastHash) return;
    clearTimeout(hashTimer);
    const P = new URLSearchParams(h), s = { ...DEFAULTS };
    const r = DATA.find((x) => x.id === P.get("r") && x.lat != null);
    const ph = parseInt(P.get("photo"), 10);
    if (panelOnly) {
      if (r) openPanel(r, true); else if (!panel.hidden) closePanel(true);
      if (r && Number.isInteger(ph)) openLightbox(r, null, ph); else if (!lb.hidden) closeLightbox();
      writeHash(false);
      return;
    }
    if (Number(P.get("maxp")) > 0) s.price = Math.min(PRICE_MAX, Number(P.get("maxp")));
    if (Number(P.get("minr")) > 0) s.rating = Number(P.get("minr"));
    if (Number(P.get("dist")) > 0) s.dist = Math.min(DIST_MAX, Number(P.get("dist")));
    s.meals = { breakfast: "Breakfast", none: "Room only" }[P.get("meals")] || "any";
    s.priv = P.get("private") === "1";
    s.mixed = P.get("mixed") === "1";
    if (P.has("type")) s.types = P.get("type").split(",").filter((x) => typesPresent.includes(x));
    if (P.has("st")) s.stations = P.get("st").split(",").filter((x) => stationKeys.includes(x));
    s.q = P.get("q") || "";
    if (P.get("color") === "price") s.colorBy = "price";
    writeControls(s);
    readControls();
    setBase(baseTokens[P.get("base")] ? P.get("base") : DEFAULT_BASE);
    if ((P.get("circle") === "0") === map.hasLayer(circleLayer)) map.hasLayer(circleLayer) ? map.removeLayer(circleLayer) : map.addLayer(circleLayer);
    activeId = r ? r.id : null;
    apply();
    const v = (P.get("map") || "").split("/").map(Number);
    if (v.length === 3 && v.every(Number.isFinite)) map.setView([v[1], v[2]], v[0], { animate: false });
    else if (initial) zoomTo(s.stations.length ? s.stations : stationKeys);
    if (r) openPanel(r, true); else if (!panel.hidden) closePanel(true);
    if (r && Number.isInteger(ph)) openLightbox(r, null, ph); else if (!lb.hidden) closeLightbox();
    writeHash(false);
  }
  async function copyLink(btn) {
    writeHash(false);
    const url = location.href;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch {
      const ta = Object.assign(document.createElement("textarea"), { value: url });
      ta.style.cssText = "position:fixed;top:0;opacity:0";
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
    }
    if (!ok) { window.prompt("Copy this link:", url); return; }
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = old; }, 1500);
  }

  $("filters-body").addEventListener("input", onChange);
  $("filters-body").addEventListener("change", onChange);
  $("reset").onclick = () => { writeControls(DEFAULTS); onChange(); };
  $("filters-toggle").onclick = () => {
    const c = $("filters").classList.toggle("collapsed");
    $("filters-toggle").textContent = c ? "+" : "–";
    $("filters-toggle").setAttribute("aria-expanded", String(!c));
  };
  $("panel-close").onclick = () => closePanel();
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-copy]"); if (b) copyLink(b); });
  document.addEventListener("keydown", (e) => {
    if (!lb.hidden) {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight") stepLightbox(1);
      else if (e.key === "ArrowLeft") stepLightbox(-1);
      else return;
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") { hideCardNow(); if (!panel.hidden) closePanel(); }
  });
  map.on("click zoomstart movestart", hideCardNow);
  map.on("moveend", scheduleHash);
  window.addEventListener("hashchange", () => applyHash(false));
  window.addEventListener("popstate", (e) => applyHash(false, !!(e.state && e.state.stayMap)));
  if (TOUCH && window.innerWidth < 640) { $("filters").classList.add("collapsed"); $("filters-toggle").textContent = "+"; }

  $("total").textContent = DATA.length;
  applyHash(true); // also overrides values the browser restores into the form on reload
})();
