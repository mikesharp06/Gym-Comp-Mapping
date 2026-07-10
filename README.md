# MPLS Gym Map

An interactive map of gyms in the Minneapolis / Twin Cities region, with
membership pricing loaded from a CSV file. Built with plain HTML/CSS/JS +
[Leaflet](https://leafletjs.com/) (OpenStreetMap tiles — no API key, no billing).

## Run it

The page fetches `gyms.csv`, so it must be served over `http://` — opening
`index.html` by double-clicking (`file://`) will be blocked by the browser.

**VS Code (easiest):** install the **Live Server** extension → right-click
`index.html` → **Open with Live Server**.

**Or from a terminal:**

```bash
cd mpls-gym-map
python3 -m http.server 8000
# then open http://localhost:8000
```

## Add your data

Edit `gyms.csv`. One row per gym. Header row is required.

| column          | required | notes                                             |
| --------------- | -------- | ------------------------------------------------- |
| `name`          | yes      | Gym name                                          |
| `category`      | no       | Free text (e.g. Budget, Boutique, CrossFit). Filters build automatically. |
| `monthly_price` | no       | Number only, no `$` (e.g. `42`). Drives tier color. |
| `notes`         | no       | Free text shown in the popup; wrap in quotes if it has commas |
| `lat`           | yes      | Latitude, decimal degrees (e.g. `44.9778`)        |
| `lng`           | yes      | Longitude, decimal degrees (e.g. `-93.2650`)      |

Rows missing valid `lat`/`lng` are skipped. Rows with no `monthly_price` still
show up (grey pin, `—` price) and always pass the tier filter.

**Getting coordinates:** right-click a spot in Google Maps → the lat/lng at the
top of the menu copies to your clipboard. Or geocode addresses in bulk with a
tool like [Nominatim](https://nominatim.org/).

## Customize

Everything tweakable lives at the top of `app.js`:

- `MAP_CENTER` / `MAP_ZOOM` — starting view.
- `TIERS` — the price bands, their thresholds, and colors. `max` is exclusive
  (e.g. Standard `min:25, max:50` covers `$25`–`$49`). The legend, pin colors,
  and the tier filter all read from this one array, so change it here only.

Colors and fonts are defined as CSS variables at the top of `styles.css`.

## Files

```
mpls-gym-map/
├── index.html   structure + CDN links (Leaflet, PapaParse, fonts)
├── styles.css   design tokens + layout
├── app.js       data loading, markers, filtering, sorting
├── gyms.csv     your data (currently placeholder samples — replace it)
└── README.md
```

> The sample rows in `gyms.csv` use **placeholder names and made-up prices**
> just so the map renders on first load. Replace them with your real data.
