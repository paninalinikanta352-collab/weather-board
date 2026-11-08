// WEATHER BOARD — vanilla JS
// Two free Open-Meteo endpoints, no API key:
//   1. geocoding  -> turn a city name into latitude/longitude
//   2. forecast   -> turn lat/lon into weather
// Everything else is rendering.

const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const STORAGE_KEY = "weatherRecents";
const UNITS_KEY = "weatherUnits";

// shared fetch wrapper: the ONE place errors become friendly messages
async function fetchJSON(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Network problem. Check your connection and retry.");
  }
  if (!res.ok) throw new Error(`API error (${res.status}). Try again in a moment.`);
  return res.json();
}

// ---------- weather code map (WMO codes the API returns) ----------

function describeCode(code) {
  const table = [
    [0,  "Clear sky", "☀️"],
    [1,  "Mainly clear", "🌤️"],
    [2,  "Partly cloudy", "⛅"],
    [3,  "Overcast", "☁️"],
    [45, "Fog", "🌫️"], [48, "Rime fog", "🌫️"],
    [51, "Light drizzle", "🌦️"], [53, "Drizzle", "🌦️"], [55, "Heavy drizzle", "🌦️"],
    [56, "Freezing drizzle", "🌧️"], [57, "Freezing drizzle", "🌧️"],
    [61, "Light rain", "🌦️"], [63, "Rain", "🌧️"], [65, "Heavy rain", "🌧️"],
    [66, "Freezing rain", "🌧️"], [67, "Freezing rain", "🌧️"],
    [71, "Light snow", "🌨️"], [73, "Snow", "🌨️"], [75, "Heavy snow", "❄️"], [77, "Snow grains", "❄️"],
    [80, "Light showers", "🌦️"], [81, "Showers", "🌧️"], [82, "Violent showers", "⛈️"],
    [85, "Snow showers", "🌨️"], [86, "Heavy snow showers", "❄️"],
    [95, "Thunderstorm", "⛈️"],
    [96, "Thunderstorm + hail", "⛈️"], [99, "Thunderstorm + hail", "⛈️"],
  ];
  const found = table.find(([c]) => c === code);
  return found ? { label: found[1], icon: found[2] } : { label: "Unknown", icon: "🌡️" };
}

// ---------- units ----------

function units() {
  return localStorage.getItem(UNITS_KEY) || "C";
}
function convert(tempC) {
  const v = units() === "F" ? tempC * 9 / 5 + 32 : tempC;
  return Math.round(v) + "°";
}

// ---------- recents ----------

function recents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveRecents(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function pushRecent(place) {
  const list = recents().filter((p) => p.name !== place.name);
  list.unshift(place);            // most recent first
  saveRecents(list.slice(0, 6));  // keep only 6
  renderRecents();
}

function removeRecent(name) {
  saveRecents(recents().filter((p) => p.name !== name));
  renderRecents();
}

function renderRecents() {
  const box = document.getElementById("recents");
  box.replaceChildren();
  recents().forEach((p) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = p.name;
    chip.addEventListener("click", () => loadWeather(p));

    const x = document.createElement("span");
    x.className = "x";
    x.textContent = "✕";
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      removeRecent(p.name);
    });

    chip.append(x);
    box.append(chip);
  });
}

// ---------- search + suggestions ----------

const input = document.getElementById("city-input");
const sugBox = document.getElementById("suggestions");
let suggestTimer, lastSuggestions = [];

input.addEventListener("input", () => {
  clearTimeout(suggestTimer); // debounce: one request per pause, not per keystroke
  const q = input.value.trim();
  if (q.length < 2) { sugBox.replaceChildren(); return; }
  suggestTimer = setTimeout(() => fetchSuggestions(q), 350);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    input.value = "";
    sugBox.replaceChildren();
    if (lastSuggestions.length > 0) loadWeather(lastSuggestions[0]);
  }
  if (e.key === "Escape") sugBox.replaceChildren();
});

document.addEventListener("click", (e) => {
  if (!sugBox.contains(e.target) && e.target !== input) sugBox.replaceChildren();
});

async function fetchSuggestions(q) {
  const url = `${GEO_URL}?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
  const data = await fetchJSON(url);
  lastSuggestions = data.results || [];
  sugBox.replaceChildren();

  if (lastSuggestions.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No match — check the spelling?";
    li.style.pointerEvents = "none";
    sugBox.append(li);
    return;
  }

  lastSuggestions.forEach((place, i) => {
    const li = document.createElement("li");
    if (i === 0) li.classList.add("active"); // Enter picks this one
    li.innerHTML = `<strong>${place.name}</strong><small>${place.admin1 || ""} ${place.country || ""}</small>`;
    li.addEventListener("click", () => {
      input.value = "";
      sugBox.replaceChildren();
      loadWeather(place);
    });
    sugBox.append(li);
  });
}

// ---------- main load ----------

let currentPlace = null;

async function loadWeather(place) {
  document.getElementById("hint").classList.add("hidden");
  document.getElementById("board").classList.add("hidden");
  setStatus(`<span class="status-info">Loading ${place.name}…</span>`);
  currentPlace = place;

  try {
    const url =
      `${FORECAST_URL}?latitude=${place.latitude}&longitude=${place.longitude}` +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=auto&forecast_days=7";

    const data = await fetchJSON(url);
    renderWeather(place, data);
    pushRecent(place);
    setStatus("");
  } catch (err) {
    setStatus(`<div class="status-error">${err.message}</div>`);
  }
}

function renderWeather(place, data) {
  const cur = data.current;

  document.getElementById("place-name").textContent = place.name;
  document.getElementById("place-country").textContent =
    [place.admin1, place.country].filter(Boolean).join(", ");

  const w = describeCode(cur.weather_code);
  document.getElementById("current-big").innerHTML =
    `${w.icon} ${convert(cur.temperature_2m)}`;
  document.getElementById("current-desc").textContent = w.label;

  document.getElementById("m-feels").textContent = convert(cur.apparent_temperature);
  document.getElementById("m-humidity").textContent = cur.relative_humidity_2m + "%";
  document.getElementById("m-wind").textContent = cur.wind_speed_10m + " km/h";
  document.getElementById("m-rain").textContent =
    (data.daily.precipitation_probability_max?.[0] ?? 0) + "%";

  // --- 7-day row ---
  const row = document.getElementById("forecast");
  row.replaceChildren();
  data.daily.time.forEach((iso, i) => {
    const day = new Date(iso + "T12:00:00");
    const dw = describeCode(data.daily.weather_code[i]);

    const cell = document.createElement("div");
    cell.className = "forecast-day";

    const label = document.createElement("div");
    label.className = "f-day";
    label.textContent = i === 0 ? "Today" : day.toLocaleDateString("en", { weekday: "short" });

    const icon = document.createElement("div");
    icon.className = "f-icon";
    icon.textContent = dw.icon;

    const max = document.createElement("div");
    max.className = "f-temp";
    max.textContent = convert(data.daily.temperature_2m_max[i]);

    const min = document.createElement("div");
    min.className = "f-min";
    min.textContent = convert(data.daily.temperature_2m_min[i]);

    const rain = document.createElement("div");
    rain.className = "f-rain";
    const p = data.daily.precipitation_probability_max[i];
    if (p > 0) rain.textContent = "💧" + p + "%";

    cell.append(label, icon, max, min, rain);
    row.append(cell);
  });

  document.getElementById("board").classList.remove("hidden");
}

// ---------- units toggle ----------

function addUnitToggle() {
  const btn = document.getElementById("unit-toggle");
  btn.textContent = "°" + units();
  btn.addEventListener("click", () => {
    localStorage.setItem(UNITS_KEY, units() === "C" ? "F" : "C");
    btn.textContent = "°" + units();
    if (currentPlace) loadWeather(currentPlace); // re-render everything in the new unit
  });
}

// ---------- boot ----------

function setStatus(html) {
  document.getElementById("status").innerHTML = html;
}

addUnitToggle();
document.getElementById("hint").classList.remove("hidden");
renderRecents();

// on open: reload the last city you searched, if any
const r = recents();
if (r.length > 0) loadWeather(r[0]);
