/* ============================================================
   MPLS Gym Map
   Loads gyms.csv, renders an interactive Leaflet map + synced list,
   with price-tier + category filtering, search, and sorting.
   ============================================================ */

// ---- Config --------------------------------------------------
const CSV_PATH = "gyms.csv";
const MAP_CENTER = [44.9778, -93.265]; // Minneapolis
const MAP_ZOOM = 12;

// Price tiers. `max` is exclusive. Edit these thresholds freely.
const TIERS = [
  { key: "budget",   name: "Budget",   min: 0,   max: 25,       color: "#2e9e6b" },
  { key: "standard", name: "Standard", min: 25,  max: 50,       color: "#d9a400" },
  { key: "premium",  name: "Premium",  min: 50,  max: 90,       color: "#e8763a" },
  { key: "luxury",   name: "Luxury",   min: 90,  max: Infinity, color: "#c43d5c" },
];

// ---- State ---------------------------------------------------
let gyms = [];                       // all rows, parsed & normalized
let markers = new Map();             // id -> Leaflet marker
const activeTiers = new Set(TIERS.map((t) => t.key)); // all on by default
const activeCategories = new Set(); // empty = all categories
let map;

// ---- Helpers -------------------------------------------------
const $ = (sel) => document.querySelector(sel);

function tierFor(price) {
  return TIERS.find((t) => price >= t.min && price < t.max) || TIERS[TIERS.length - 1];
}

function money(n) {
  return "$" + Math.round(n).toLocaleString();
}

function tierRangeLabel(t) {
  if (t.max === Infinity) return `${money(t.min)}+`;
  if (t.min === 0) return `< ${money(t.max)}`;
  return `${money(t.min)}–${money(t.max - 1)}`;
}

// ---- Data loading --------------------------------------------
function loadData() {
  Papa.parse(CSV_PATH, {
    download: true,
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    complete: (results) => {
      const rows = normalize(results.data);
      if (!rows.length) {
        showNotice(
          "No valid rows found in <code>gyms.csv</code>. Check the column headers " +
            "(name, category, lat, lng, monthly_price…)."
        );
      }
      init(rows);
    },
    error: () => {
      // Almost always this means the file was opened directly (file://)
      // instead of served over http, so the browser blocks the fetch.
      showNotice(
        "Couldn't load <code>gyms.csv</code>. Open this project with a local " +
          "server (e.g. VS Code <b>Live Server</b>, or <code>python3 -m http.server</code>) " +
          "rather than double-clicking the file."
      );
      init([]);
    },
  });
}

// Turn raw CSV rows into clean gym objects; drop anything unusable.
function normalize(rows) {
  return rows
    .map((r, i) => {
      const lat = parseFloat(r.lat);
      const lng = parseFloat(r.lng);
      const price = parseFloat(r.monthly_price);
      if (!isFinite(lat) || !isFinite(lng)) return null;
      return {
        id: i,
        name: (r.name || "Unnamed gym").trim(),
        category: (r.category || "Uncategorized").trim(),
        price: isFinite(price) ? price : null,
        notes: (r.notes || "").trim(),
        address: (r.address || "").trim(),
        lat,
        lng,
      };
    })
    .filter(Boolean);
}

// ---- Init ----------------------------------------------------
function init(rows) {
  gyms = rows;

  map = L.map("map", { scrollWheelZoom: true }).setView(MAP_CENTER, MAP_ZOOM);

  // Colored but tidy basemap (CARTO Voyager). This "labels_under" variant
  // keeps place names but draws them beneath map features so they recede.
  // Dial the labels up or down by swapping the path segment:
  //   rastertiles/voyager          -> full labels (most)
  //   rastertiles/voyager_labels_under -> labels tucked under features (current)
  //   rastertiles/voyager_nolabels -> no labels at all (fewest)
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  }).addTo(map);

  buildLadder();
  buildCategoryChips();
  bindControls();

  createMarkers();
  render();

  if (gyms.length) fitToMarkers();
}

// ---- Markers -------------------------------------------------
function createMarkers() {
  gyms.forEach((g) => {
    const color = g.price != null ? tierFor(g.price).color : "#6b7885";
    const label = g.price != null ? "$" + Math.round(g.price) : "—";
    const icon = L.divIcon({
      className: "",
      html: `<div class="pin" style="background:${color}"><span>${label}</span></div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -38],
    });
    const marker = L.marker([g.lat, g.lng], { icon }).bindPopup(popupHtml(g));
    marker.on("click", () => setActive(g.id));
    markers.set(g.id, marker);
  });
}

function popupHtml(g) {
  const price =
    g.price != null
      ? `<div class="popup-price">${money(g.price)}<small> / mo</small></div>`
      : `<div class="popup-price"><small>Price not listed</small></div>`;
  const notes = g.notes ? `<p class="popup-row">${g.notes}</p>` : "";
  const addr = g.address ? `<p class="popup-row popup-addr">${g.address}</p>` : "";
  return `<div class="popup">
      <h3>${g.name}</h3>
      <p class="popup-meta">${g.category}</p>
      ${price}${notes}${addr}
    </div>`;
}

// ---- Filtering & rendering -----------------------------------
function visibleGyms() {
  const q = $("#search").value.trim().toLowerCase();
  const sort = $("#sort").value;

  let out = gyms.filter((g) => {
    // Tier filter (gyms with no price always pass the tier check)
    if (g.price != null && !activeTiers.has(tierFor(g.price).key)) return false;
    // Category filter (empty set = show all)
    if (activeCategories.size && !activeCategories.has(g.category)) return false;
    // Search across name / category / notes
    if (q) {
      const hay = `${g.name} ${g.category} ${g.notes} ${g.address}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  out.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    const pa = a.price ?? Infinity;
    const pb = b.price ?? Infinity;
    return sort === "price-desc" ? pb - pa : pa - pb;
  });

  return out;
}

function render() {
  const shown = visibleGyms();
  const shownIds = new Set(shown.map((g) => g.id));

  // Sync markers with the map layer
  markers.forEach((marker, id) => {
    const on = shownIds.has(id);
    const present = map.hasLayer(marker);
    if (on && !present) marker.addTo(map);
    if (!on && present) map.removeLayer(marker);
  });

  // Rebuild the list
  const list = $("#list");
  list.innerHTML = "";
  if (!shown.length) {
    list.innerHTML = `<li class="empty">No gyms match these filters.</li>`;
  } else {
    shown.forEach((g) => list.appendChild(cardEl(g)));
  }

  $("#count").textContent = `Showing ${shown.length} of ${gyms.length}`;
}

function cardEl(g) {
  const color = g.price != null ? tierFor(g.price).color : "#6b7885";
  const li = document.createElement("li");
  li.className = "card";
  li.tabIndex = 0;
  li.dataset.id = g.id;
  li.innerHTML = `
    <span class="dot" style="background:${color}"></span>
    <div>
      <div class="name">${g.name}</div>
      <div class="meta">${g.category}</div>
    </div>
    <div class="price">${g.price != null ? money(g.price) : "—"}<small>${
    g.price != null ? "per month" : "no price"
  }</small></div>`;

  const focus = () => {
    map.setView([g.lat, g.lng], Math.max(map.getZoom(), 14), { animate: true });
    markers.get(g.id).openPopup();
    setActive(g.id);
  };
  li.addEventListener("click", focus);
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); focus(); }
  });
  return li;
}

// Highlight the active gym in both list and map
function setActive(id) {
  document.querySelectorAll(".card").forEach((c) =>
    c.classList.toggle("active", Number(c.dataset.id) === id)
  );
  markers.forEach((m, mid) => {
    const el = m.getElement()?.querySelector(".pin");
    if (el) el.classList.toggle("active", mid === id);
  });
}

// ---- Controls ------------------------------------------------
function buildLadder() {
  const el = $("#ladder");
  el.innerHTML = "";
  TIERS.forEach((t) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ladder-row";
    row.setAttribute("aria-pressed", "true");
    row.dataset.tier = t.key;
    row.innerHTML = `
      <span class="swatch" style="background:${t.color}"></span>
      <span class="tier-name">${t.name}</span>
      <span class="tier-range">${tierRangeLabel(t)}</span>`;
    row.addEventListener("click", () => {
      if (activeTiers.has(t.key)) activeTiers.delete(t.key);
      else activeTiers.add(t.key);
      row.setAttribute("aria-pressed", activeTiers.has(t.key));
      render();
    });
    el.appendChild(row);
  });
}

function buildCategoryChips() {
  const el = $("#categories");
  el.innerHTML = "";
  const cats = [...new Set(gyms.map((g) => g.category))].sort();
  if (!cats.length) { el.innerHTML = `<span class="meta">—</span>`; return; }
  cats.forEach((cat) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = cat;
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      if (activeCategories.has(cat)) activeCategories.delete(cat);
      else activeCategories.add(cat);
      chip.setAttribute("aria-pressed", activeCategories.has(cat));
      render();
    });
    el.appendChild(chip);
  });
}

function bindControls() {
  $("#search").addEventListener("input", render);
  $("#sort").addEventListener("change", render);
  $("#reset").addEventListener("click", () => {
    $("#search").value = "";
    $("#sort").value = "price-asc";
    activeCategories.clear();
    TIERS.forEach((t) => activeTiers.add(t.key));
    document.querySelectorAll(".ladder-row").forEach((r) => r.setAttribute("aria-pressed", "true"));
    document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
    render();
    if (gyms.length) fitToMarkers();
  });
}

// ---- Misc ----------------------------------------------------
function fitToMarkers() {
  const group = L.featureGroup([...markers.values()]);
  map.fitBounds(group.getBounds().pad(0.15));
}

function showNotice(html) {
  const n = $("#notice");
  n.innerHTML = html;
  n.hidden = false;
}

// ---- Go ------------------------------------------------------
loadData();