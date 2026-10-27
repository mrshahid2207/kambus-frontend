// ========================================================================
// KAMBUS - Student Live Tracking & Realtime Dashboard
// ========================================================================

const API_BASE = "https://kambus-backend.onrender.com";
const WS_BASE = API_BASE.replace(/^http/, "ws");
window.API_BASE = API_BASE;
window.WS_BASE = WS_BASE;

// Sign out and return to the login screen when the server rejects the saved token
(function () {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function (...args) {
        const response = await nativeFetch(...args);
        try {
            const input = args[0];
            const url = typeof input === "string" ? input : (input && (input.url || input.href)) || "";
            if (response.status === 401 && url.startsWith(API_BASE) && !window.__kambusSigningOut) {
                window.__kambusSigningOut = true;
                localStorage.removeItem("kambus_token");
                localStorage.removeItem("kambus_role");
                localStorage.removeItem("kambus_user_id");
                localStorage.removeItem("kambus_student_dashboard");
                if (window.AndroidSession && typeof window.AndroidSession.clearSession === "function") {
                    try { window.AndroidSession.clearSession(); } catch (_) {}
                }
                window.location.replace("index.html");
            }
        } catch (e) { /* never break the original request */ }
        return response;
    };
})();

// Authoritative College Coordinates (fallback default)
const COLLEGE_LOCATION = {
    latitude: 18.054145359568437,
    longitude: 79.53558731724873,
    name: "KITSW / College"
};

// ========================================================================
// GLOBAL VARIABLES
// ========================================================================

let map = null;
let busMarker = null;
let busData = null;
let updateTimer = null;

let assignedBusId = null;
let assignedStop = null;
let stopMarker = null;
let routeStops = [];
let routeStopsBusId = null;
let routeStopsGroup = null;
let routePolylineLayer = null;
let routeArrowLayer = null;
let currentStudentRouteLatLngs = [];
let currentRouteStopsTripType = "morning";
let collegeMarker = null;

let isStudentRouteFetchInFlight = false;
let lastStudentRouteFetchAt = 0;
const STUDENT_ROUTE_REFRESH_MIN_INTERVAL_MS = 30000;

let hasArrivedAtAssignedStop = false;
let studentAssignment = null;
let regularStudentAssignment = null;
let busTripActive = false;
let activeAlternativeAllotment = null;
let temporaryStopChange = null;
let studentFeatureSubmitting = false;

// ========================================================================
// ETA STATE
// ========================================================================

let lastKnownLocation = null;
let lastKnownSpeed = null;

let lastMovingEtaMinutes = null;
let lastEtaMinutes = null;

let stoppedSince = null;
let lastLocationReceivedAt = null;
let studentAssignmentRequest = 0;
let studentAssignmentVersion = 0;

function clearStudentAssignmentTracking() {
    studentAssignmentVersion += 1;
    busTripActive = false;
    busData = lastKnownLocation = lastKnownSpeed = null;
    lastMovingEtaMinutes = lastEtaMinutes = stoppedSince = lastLocationReceivedAt = null;
    hasArrivedAtAssignedStop = false;
    assignedStop = null;
    routeStops = [];
    temporaryMyBusStops = null;
    removeBusMarker();
    if (stopMarker && map) map.removeLayer(stopMarker);
    stopMarker = null;
    routePolylineLayer?.clearLayers();
    routeArrowLayer?.clearLayers();
    currentStudentRouteLatLngs = [];
    setEtaBanner("Updating bus assignment", "ETA unavailable");
    updateMyStopLive("Updating…");
}

// ========================================================================
// TRAVEL STATUS
// ========================================================================

let studentTravellingToday = true;
let travelStatusKnown = false;

// ========================================================================
// CONFIG
// ========================================================================

const GPS_GRACE_PERIOD_MS = 30000;
const GPS_STALE_AFTER_MS = 120 * 1000;
const ARRIVAL_DISTANCE_METRES = 80;
const PASSED_DISTANCE_METRES = 140;
const FALLBACK_SPEED_KMH = 15;

// ========================================================================
// JWT TOKEN
// ========================================================================

function getToken() {
    let token = localStorage.getItem("kambus_token");
    if (!token && window.AndroidSession && typeof window.AndroidSession.getToken === "function") {
        token = window.AndroidSession.getToken();
        if (token) localStorage.setItem("kambus_token", token);
    }
    return token;
}

// ========================================================================
// ETA BANNER
// ========================================================================

function setEtaBanner(status, eta, isLive = false) {
    const statusElement = document.getElementById("etaStatus");
    const etaElement = document.getElementById("etaValue");
    const pillElement = document.getElementById("etaLivePill");

    if (!statusElement || !etaElement) return;

    statusElement.textContent = status;
    etaElement.textContent = eta;

    etaElement.className = isLive ? "text-ok font-semibold ml-1 text-xs" : "text-ink-muted font-semibold ml-1 text-xs";

    // Indicator state is handled entirely in CSS (see .eta-pill in student.html):
    //   live     -> green dot with a pulsing ring
    //   updating -> amber dot, slow blink (waiting for a fresh GPS fix)
    //   idle     -> grey dot, no animation (trip ended / unavailable)
    if (pillElement) {
        pillElement.dataset.state = isLive
            ? "live"
            : (/updat|calculat/i.test(status) ? "updating" : "idle");
    }
}

// ========================================================================
// GPS FRESHNESS
// ========================================================================

function isFreshLocation(timestamp) {
    if (!timestamp) return false;

    const locationTime = Date.parse(timestamp);
    if (!Number.isFinite(locationTime)) return false;

    const age = Date.now() - locationTime;
    return age >= -5000 && age <= GPS_STALE_AFTER_MS;
}

// ========================================================================
// DISTANCE CALCULATION
// ========================================================================

function distanceInMetres(fromLatitude, fromLongitude, toLatitude, toLongitude) {
    const toRadians = degrees => (degrees * Math.PI) / 180;
    const earthRadius = 6371000;

    const latitudeDelta = toRadians(toLatitude - fromLatitude);
    const longitudeDelta = toRadians(toLongitude - fromLongitude);

    const a =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(toRadians(fromLatitude)) *
        Math.cos(toRadians(toLatitude)) *
        Math.sin(longitudeDelta / 2) ** 2;

    return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ========================================================================
// ETA CALCULATION
// ========================================================================

function updateEtaBanner(location) {
    if (!assignedStop) {
        setEtaBanner("Assigned stop unavailable", "ETA unavailable");
        return;
    }

    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);

    const validCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

    if (validCoordinates) {
        lastKnownLocation = { latitude, longitude };
        lastLocationReceivedAt = Date.now();
    }

    if (!lastKnownLocation) {
        setEtaBanner("Bus on the way", "ETA calculating...", true);
        updateMyStopLive("ETA calculating...");
        return;
    }

    const currentLatitude = lastKnownLocation.latitude;
    const currentLongitude = lastKnownLocation.longitude;

    const distance = distanceInMetres(
        currentLatitude,
        currentLongitude,
        assignedStop.latitude,
        assignedStop.longitude
    );

    const distanceElement = document.getElementById("myStopDistance");
    if (distanceElement) {
        distanceElement.textContent = `Distance: ${
            distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance)} m`
        }`;
    }

    const destinationLabel = `Live • On the way to ${assignedStop.name}`;

    if (location?.stop_passed === true) {
        setEtaBanner(`Live • ${assignedStop.name}`, "Passed", true);
        updateMyStopLive("Passed");
        return;
    }

    if (location?.is_waiting === true) {
        const remainingSeconds = Number(location.wait_remaining_seconds);
        if (Number.isFinite(remainingSeconds) && remainingSeconds > 0) {
            const remainingMinutes = Math.max(1, Math.ceil(remainingSeconds / 60));
            setEtaBanner(
                `Bus waiting at ${assignedStop.name}`,
                `Resuming in ~${remainingMinutes} min`,
                true
            );
            updateMyStopLive(`Waiting • ~${remainingMinutes} min`);
        } else {
            setEtaBanner(`Bus waiting at ${assignedStop.name}`, "Resuming soon", true);
            updateMyStopLive("Resuming soon");
        }
        return;
    }

    if (distance <= ARRIVAL_DISTANCE_METRES) {
        hasArrivedAtAssignedStop = true;
        stoppedSince = null;
        lastMovingEtaMinutes = 0;
        lastEtaMinutes = 0;
        setEtaBanner(destinationLabel, "Arriving", true);
        updateMyStopLive("Arriving");
        return;
    }

    if (hasArrivedAtAssignedStop && distance >= PASSED_DISTANCE_METRES) {
        setEtaBanner(`Live • ${assignedStop.name}`, "Passed", true);
        updateMyStopLive("Passed");
        return;
    }

    const locationIsFresh = validCoordinates && isFreshLocation(location?.timestamp);

    if (!locationIsFresh) {
        const lastUpdateAge = lastLocationReceivedAt ? Date.now() - lastLocationReceivedAt : Infinity;

        if (lastEtaMinutes !== null && lastUpdateAge <= GPS_GRACE_PERIOD_MS) {
            setEtaBanner(destinationLabel, `~${lastEtaMinutes} mins • Updating location…`, true);
            updateMyStopLive(`~${lastEtaMinutes} mins • Updating location…`);
            return;
        }

        setEtaBanner("Location updating", "ETA temporarily unavailable");
        updateMyStopLive("Updating location…");
        return;
    }

    let speedKmh =
        location?.speed === null || location?.speed === undefined || location?.speed === ""
            ? null
            : Number(location.speed);

    if (speedKmh === null || !Number.isFinite(speedKmh)) {
        if (Number.isFinite(lastKnownSpeed)) {
            speedKmh = lastKnownSpeed;
        }
    }

    if (Number.isFinite(speedKmh) && speedKmh > 0) {
        lastKnownSpeed = speedKmh;
        stoppedSince = null;

        const minutes = Math.max(1, Math.ceil(distance / ((speedKmh * 1000) / 60)));
        lastMovingEtaMinutes = minutes;
        lastEtaMinutes = minutes;

        setEtaBanner(destinationLabel, `~${minutes} mins`, true);
        updateMyStopLive(`~${minutes} mins`);
        return;
    }

    if (speedKmh === 0) {
        if (!stoppedSince) {
            stoppedSince = Date.now();
        }

        let baseEta = Number.isFinite(lastMovingEtaMinutes) ? lastMovingEtaMinutes : null;
        if (baseEta === null) {
            baseEta = Math.max(1, Math.ceil(distance / ((FALLBACK_SPEED_KMH * 1000) / 60)));
            lastMovingEtaMinutes = baseEta;
        }

        const stoppedMinutes = Math.ceil((Date.now() - stoppedSince) / 60000);
        const currentEta = baseEta + stoppedMinutes;
        lastEtaMinutes = currentEta;

        setEtaBanner(`${destinationLabel} • Bus stopped`, `~${currentEta} mins`, true);
        updateMyStopLive(`~${currentEta} mins`);
        return;
    }

    const fallbackMinutes = Math.max(1, Math.ceil(distance / ((FALLBACK_SPEED_KMH * 1000) / 60)));
    lastEtaMinutes = fallbackMinutes;

    setEtaBanner(destinationLabel, `~${fallbackMinutes} mins • Speed unavailable`, true);
    updateMyStopLive(`~${fallbackMinutes} mins`);
}

// ========================================================================
// MAP INITIALIZATION (LEAFLET 1.9.4 + OPENSTREETMAP)
// ========================================================================

function initializeMap() {
    if (typeof L === "undefined") {
        console.error("[ERROR] Leaflet library (L) is not loaded or unavailable. Check network or Leaflet script inclusion.");
        return false;
    }

    const mapElement = document.getElementById("map");
    if (!mapElement) {
        console.error("[ERROR] Map container element '#map' not found in DOM.");
        return false;
    }

    if (map) {
        map.invalidateSize();
        return true;
    }

    try {
        const height = mapElement.offsetHeight;
        const width = mapElement.offsetWidth;
        if (height === 0 || width === 0) {
            console.warn(`[WARN] Map container has zero initial dimensions (width: ${width}px, height: ${height}px). Sizing will refresh on layout.`);
        }

        map = L.map("map", {
            zoomControl: true,
            attributionControl: true
        }).setView([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude], 14);

        const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        tileLayer.on("tileerror", function (error) {
            console.error("[ERROR] Leaflet tile loading error:", error);
        });

        routeStopsGroup = L.layerGroup().addTo(map);

        routePolylineLayer = L.geoJSON(null, {
            style: { color: "#4A6F79", weight: 5, opacity: 0.85 }
        }).addTo(map);

        routeArrowLayer = L.layerGroup().addTo(map);
        map.on("zoomend", function () {
            if (currentStudentRouteLatLngs && currentStudentRouteLatLngs.length >= 2) {
                renderDirectionArrows(map, routeArrowLayer, currentStudentRouteLatLngs, "#ffffff");
            }
        });

        updateCollegeMarker();

        setTimeout(() => {
            if (map) map.invalidateSize();
        }, 200);
return true;
    } catch (error) {
        console.error("[ERROR] Fatal error during Leaflet map initialization:", error);
        return false;
    }
}

// ========================================================================
// COLLEGE MARKER
// ========================================================================

function updateCollegeMarker() {
    if (!map) return;

    if (collegeMarker) {
        map.removeLayer(collegeMarker);
        collegeMarker = null;
    }

    const collegeIcon = L.divIcon({
        className: "",
        html: `
            <div style="
                width: 32px; height: 32px; border-radius: 4px;
                background: var(--navy);
                color: #ffffff;
                border: 2px solid #ffffff;
                display: flex; align-items: center; justify-content: center;
            ">
                <svg style="width:16px;height:16px;color:#ffffff;" aria-hidden="true"><use href="icons.svg#icon-user-graduate"/></svg>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    collegeMarker = L.marker([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude], {
        icon: collegeIcon,
        zIndexOffset: 200
    }).addTo(map).bindPopup(`<strong>${COLLEGE_LOCATION.name}</strong>`);
}

// ========================================================================
// ROUTE STOPS (ALL STOPS ON ASSIGNED ROUTE)
// ========================================================================

async function loadRouteStops() {
    const version = studentAssignmentVersion;
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/student/my-route-stops`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
            }
        });
        if (version !== studentAssignmentVersion) return;

        if (!response.ok) {
            console.warn(`Route stops unavailable or not assigned yet (HTTP ${response.status})`);
            routeStops = [];
            temporaryMyBusStops = null;
            routeStopsBusId = null;
            return;
        }

        const data = await response.json();
        if (version !== studentAssignmentVersion) return;
        routeStops = Array.isArray(data.stops) ? data.stops : [];
        currentRouteStopsTripType = data.trip_type || (data.is_evening ? "evening" : "morning");
        if (data.college_location?.latitude && data.college_location?.longitude) {
            COLLEGE_LOCATION.latitude = Number(data.college_location.latitude);
            COLLEGE_LOCATION.longitude = Number(data.college_location.longitude);
            if (data.college_location.name) COLLEGE_LOCATION.name = data.college_location.name;
        }
        temporaryMyBusStops = Array.isArray(data.map_stops) ? data.map_stops : routeStops;
        routeStopsBusId = data.bus_id ?? null;
        window.routeStops = routeStops;
        window.routeStopsBusId = routeStopsBusId;
        renderRouteStops();
        if (Array.isArray(data.active_polyline) && data.active_polyline.length >= 2) {
            currentStudentRouteLatLngs = data.active_polyline.map(p => [Number(p[0]), Number(p[1])]);
            if (routePolylineLayer) {
                routePolylineLayer.clearLayers();
                routePolylineLayer.addData({
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: currentStudentRouteLatLngs.map(p => [p[1], p[0]])
                    }
                });
            }
            if (routeArrowLayer && map) {
                renderDirectionArrows(map, routeArrowLayer, currentStudentRouteLatLngs, "#ffffff");
            }
        } else {
            fetchAndDrawStudentRoute(true);
        }
    } catch (error) {
        if (version !== studentAssignmentVersion) return;
        console.error("Failed to load route stops from API:", error);
    }
}

function renderRouteStops() {
    if (routeStopsGroup) {
        routeStopsGroup.clearLayers();
    }
}

// ========================================================================
// ROAD ROUTE POLYLINE (LEAFLET + OSRM PUBLIC ROUTING)
// ========================================================================

async function fetchAndDrawStudentRoute(force = false) {
    if (!map || isStudentRouteFetchInFlight) return;
    if (!Array.isArray(routeStops) || routeStops.length === 0) return;

    const now = Date.now();
    if (!force && (now - lastStudentRouteFetchAt < STUDENT_ROUTE_REFRESH_MIN_INTERVAL_MS)) {
        return;
    }

    isStudentRouteFetchInFlight = true;
    const version = studentAssignmentVersion;
    lastStudentRouteFetchAt = now;

    try {
        const sortedStops = [...routeStops]
            .filter(s => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)));

        const isEvening = (currentRouteStopsTripType === "evening") || (studentAssignment?.trip_type === "evening");

        // Morning: Stop 1 -> Stop 2 -> ... -> Stop N -> College
        // Evening: College -> Stop N -> ... -> Stop 2 -> Stop 1
        const waypoints = isEvening
            ? [
                { latitude: COLLEGE_LOCATION.latitude, longitude: COLLEGE_LOCATION.longitude },
                ...sortedStops.map(s => ({
                    latitude: Number(s.latitude),
                    longitude: Number(s.longitude)
                }))
              ]
            : [
                ...sortedStops.map(s => ({
                    latitude: Number(s.latitude),
                    longitude: Number(s.longitude)
                })),
                {
                    latitude: COLLEGE_LOCATION.latitude,
                    longitude: COLLEGE_LOCATION.longitude
                }
              ];

        if (waypoints.length < 2) return;

        const coordString = waypoints
            .map(pt => `${pt.longitude},${pt.latitude}`)
            .join(";");

        const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson&steps=false`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`OSRM routing HTTP error ${response.status}`);

        const data = await response.json();
        if (!data.routes || !data.routes.length) throw new Error("No road route found in OSRM response");

        const geoJsonRoute = data.routes[0].geometry;
        if (version !== studentAssignmentVersion) return;

        // Extract road-snapped coordinates from OSRM [lon, lat]
        const coordinates = geoJsonRoute.coordinates;
        currentStudentRouteLatLngs = coordinates.map(([lon, lat]) => [lat, lon]);

        if (routePolylineLayer) {
            routePolylineLayer.clearLayers();
            routePolylineLayer.addData(geoJsonRoute);
        }
        if (routeArrowLayer) {
            renderDirectionArrows(map, routeArrowLayer, currentStudentRouteLatLngs, "#ffffff");
        }
    } catch (error) {
        console.warn("Student road routing notice:", error.message);
    } finally {
        isStudentRouteFetchInFlight = false;
        if (version !== studentAssignmentVersion) fetchAndDrawStudentRoute(true);
    }
}

function renderDirectionArrows(mapInstance, arrowLayer, polylinePoints, color = "#ffffff") {
    if (!mapInstance || !arrowLayer || !Array.isArray(polylinePoints) || polylinePoints.length < 2) return;
    arrowLayer.clearLayers();
    const zoom = mapInstance.getZoom();

    const arrowSpacing = 85;
    let untilArrow = 45;

    for (let i = 1; i < polylinePoints.length; i++) {
        const p1 = polylinePoints[i - 1];
        const p2 = polylinePoints[i];

        const lat1 = Array.isArray(p1) ? p1[0] : p1.lat;
        const lng1 = Array.isArray(p1) ? p1[1] : p1.lng;
        const lat2 = Array.isArray(p2) ? p2[0] : p2.lat;
        const lng2 = Array.isArray(p2) ? p2[1] : p2.lng;

        if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) continue;

        const a = mapInstance.project([lat1, lng1], zoom);
        const b = mapInstance.project([lat2, lng2], zoom);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        if (!length) continue;

        for (; untilArrow <= length; untilArrow += arrowSpacing) {
            const x = a.x + (dx * untilArrow) / length;
            const y = a.y + (dy * untilArrow) / length;
            const ux = dx / length;
            const uy = dy / length;

            const arrowPixels = [
                [x - ux * 7 - uy * 4, y - uy * 7 + ux * 4],
                [x, y],
                [x - ux * 7 + uy * 4, y - uy * 7 - ux * 4]
            ];

            const arrowLatLngs = arrowPixels.map(p => mapInstance.unproject(p, zoom));
            L.polyline(arrowLatLngs, {
                color: color,
                weight: 2.5,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
                interactive: false
            }).addTo(arrowLayer);
        }
        untilArrow -= length;
    }
}

// ========================================================================
// ASSIGNED STOP MARKER
// ========================================================================

const stopIcon = L.divIcon({
    className: "",
    html: `
        <div style="
            width: 32px; height: 32px; border-radius: 4px;
            background: var(--navy);
            color: #ffffff;
            border: 2px solid #ffffff;
            display: flex; align-items: center; justify-content: center;
        ">
            <svg style="width:16px;height:16px;color:#ffffff;" aria-hidden="true"><use href="icons.svg#icon-map-pin"/></svg>
        </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});

function updateStopMarker() {
    if (!map || !assignedStop) return;

    if (stopMarker) {
        map.removeLayer(stopMarker);
        stopMarker = null;
    }

    const isTemp = assignedStop.is_temporary === true;
    const titleText = isTemp ? "Temporary Pickup Stop" : "Your Assigned Stop";
    const bgStyle = isTemp
        ? "background: #0284C7; border: 2px solid #ffffff;"
        : "background: var(--brand); border: 2px solid #ffffff;";

    // ── Compact teardrop pin ─────────────────────────────────────────────
    const pinColor  = isTemp ? "#0284c7" : "#173541";
    const pinColor2 = isTemp ? "#0ea5e9" : "#204856";

    const pinSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
        <defs>
          <linearGradient id="kg${isTemp?'T':'N'}" x1="30%" y1="0%" x2="70%" y2="100%">
            <stop offset="0%" stop-color="${pinColor2}"/>
            <stop offset="100%" stop-color="${pinColor}"/>
          </linearGradient>
          <filter id="kgshadow" x="-40%" y="-20%" width="180%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.28)"/>
          </filter>
        </defs>
        <g filter="url(#kgshadow)">
          <path d="M14 1 C7 1 1 7 1 14 C1 23 14 37 14 37 C14 37 27 23 27 14 C27 7 21 1 14 1 Z"
                fill="url(#kg${isTemp?'T':'N'})" stroke="#ffffff" stroke-width="1.5"/>
        </g>
        <circle cx="14" cy="14" r="4" fill="#ffffff" opacity="0.9"/>
      </svg>`;

    const customIcon = L.divIcon({
        className: "",
        html: pinSvg,
        iconSize:   [28, 38],
        iconAnchor: [14, 37]   // tip of the teardrop
    });

    const badgeColor = isTemp ? "#0284c7" : "#173541";
    const badgeLabel = isTemp ? "Temporary Stop" : "Your Stop";
    const popupHtml = `
        <div style="min-width:130px;font-family:inherit;">
          <span style="font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
                       background:${badgeColor};color:#fff;padding:2px 8px;border-radius:99px;display:inline-block;margin-bottom:5px;">
            ${badgeLabel}
          </span>
          <div style="font-size:13px;font-weight:800;color:#0f172a;line-height:1.3;">${assignedStop.name}</div>
          ${isTemp && assignedStop.temporary_start_date
              ? `<div style="font-size:11px;font-weight:700;color:#0284c7;margin-top:3px;">${assignedStop.temporary_start_date} → ${assignedStop.temporary_end_date}</div>`
              : ""}
        </div>`;

    stopMarker = L.marker([assignedStop.latitude, assignedStop.longitude], {
        icon: customIcon,
        zIndexOffset: 500
    })
        .addTo(map)
        .bindPopup(popupHtml, { maxWidth: 220 });

    // Re-render route stops to ensure proper layering
    renderRouteStops();
}

// ========================================================================
// BUS MARKER & LIVE LOCATION
// ========================================================================

const busIcon = L.divIcon({
    className: "",
    html: `
        <div style="
            width:42px;
            height:42px;
            background:#256B4C;
            border:4px solid white;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            box-shadow:0 3px 10px rgba(0,0,0,0.25);
        ">
            <svg style="width:16px;height:16px;color:white;" aria-hidden="true"><use href="icons.svg#icon-bus"/></svg>
        </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21]
});

function removeBusMarker() {
    if (busMarker && map) {
        map.removeLayer(busMarker);
    }
    busMarker = null;
}

function updateBusOnMap(data) {
    if (!map) return;

    const latitude = Number(data.latitude);
    const longitude = Number(data.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    if (!busTripActive) {
        removeBusMarker();
        return;
    }

    // Refresh road route polyline dynamically as bus moves (throttled to 30s)

    if (!busMarker) {
        busMarker = L.marker([latitude, longitude], {
            icon: busIcon,
            zIndexOffset: 1000
        }).addTo(map);

        busMarker.bindPopup(`
            <div style="text-align:center">
                <strong>Assigned Bus</strong><br>
                Bus: ${studentAssignment?.bus_number || data.bus_id || "Unassigned"}<br>
                Speed: ${data.speed !== null && data.speed !== undefined ? data.speed : "—"} km/h
            </div>
        `);

        map.setView([latitude, longitude], 16);
        return;
    }

    const startPosition = busMarker.getLatLng();
    const startLat = startPosition.lat;
    const startLng = startPosition.lng;
    const endLat = latitude;
    const endLng = longitude;
    const duration = 4500;
    const startTime = performance.now();
    const animatedMarker = busMarker;

    function animateBus(currentTime) {
        if (!busMarker || busMarker !== animatedMarker) return;

        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased =
            progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const currentLat = startLat + (endLat - startLat) * eased;
        const currentLng = startLng + (endLng - startLng) * eased;

        busMarker.setLatLng([currentLat, currentLng]);

        if (progress < 1) {
            requestAnimationFrame(animateBus);
        }
    }

    requestAnimationFrame(animateBus);

    busMarker.setPopupContent(`
        <div style="text-align:center">
            <strong>Assigned Bus</strong><br>
            Bus: ${studentAssignment?.bus_number || data.bus_id || "Unassigned"}<br>
            Speed: ${data.speed !== null && data.speed !== undefined ? data.speed : "—"} km/h<br>
            <small>Updated: ${data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : "Live"}</small>
            ${data.is_waiting ? "<br><strong class=\"text-danger\">Waiting at stop</strong>" : ""}
        </div>
    `);
}

async function fetchBusLocation() {
    if (!assignedBusId) return;

    if (!busTripActive) {
        removeBusMarker();
        return;
    }

    const version = studentAssignmentVersion;
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/buses/${assignedBusId}/location`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (version !== studentAssignmentVersion) return;

        if (!response.ok) {
            console.warn(`[WARN] Bus location fetch status HTTP ${response.status}:`, data);
            updateEtaBanner(null);
            return;
        }

        // -- Trip-active guard ---------------------------------------------
        // The backend sets is_active / active_trip / trip_status on the
        // /buses/{id}/location endpoint. If the trip has ended, remove the
        // marker immediately and do not pass stale coords to updateBusOnMap.
        if (
            data.is_active === false ||
            data.active_trip === false ||
            data.trip_status === "inactive" ||
            data.latitude === null ||
            data.latitude === undefined ||
            !isFreshLocation(data.timestamp)
        ) {
            busTripActive = false;
            removeBusMarker();
            setEtaBanner("Trip ended", "Bus is not travelling");
            return;
        }
        // -----------------------------------------------------------------

        const rawSpeed = data.speed;
        const parsedSpeed =
            rawSpeed === null || rawSpeed === undefined || rawSpeed === ""
                ? null
                : Number(rawSpeed);

        const remainingSeconds = Number(data.wait_remaining_seconds);

        const locationData = {
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
            speed: Number.isFinite(parsedSpeed) ? parsedSpeed : null,
            heading: data.heading ?? data.bearing ?? null,
            timestamp: data.timestamp,
            bus_id: assignedBusId,
            trip_id: data.trip_id ?? null,
            is_waiting: data.is_waiting === true,
            wait_remaining_seconds: Number.isFinite(remainingSeconds) ? remainingSeconds : null,
            wait_stop_id: data.wait_stop_id ?? null,
            wait_minutes: data.wait_minutes ?? null,
            stop_passed: data.stop_passed === true
        };

        if (!Number.isFinite(locationData.latitude) || !Number.isFinite(locationData.longitude)) {
            updateEtaBanner(null);
            return;
        }

        busData = locationData;
        updateTemporaryMapHeading();
        updateBusOnMap(locationData);
        updateEtaBanner(locationData);
    } catch (error) {
        if (version !== studentAssignmentVersion) return;
        console.error("[ERROR] Failed to fetch live bus location:", error);
        updateEtaBanner(null);
    }
}

// ========================================================================
// LOAD STUDENT BUS & ASSIGNMENT
// ========================================================================

async function loadActiveAlternativeAllotment() {
    const request = studentAssignmentRequest;
    const token = getToken();
    if (!token) {
        activeAlternativeAllotment = null;
        return null;
    }

    try {
        const response = await fetch(`${API_BASE}/student/missed-bus/allotment`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json().catch(() => ({}));
        if (request !== studentAssignmentRequest) return null;

        if (!response.ok) {
            console.warn("[WARN] Alternative bus status unavailable:", data);
            activeAlternativeAllotment = null;
            return null;
        }

        activeAlternativeAllotment = data.active ? data : null;
        updateMissedBusButtonUI();
        return activeAlternativeAllotment;
    } catch (error) {
        if (request !== studentAssignmentRequest) return null;
        console.warn("[WARN] Failed to load alternative bus allotment:", error);
        activeAlternativeAllotment = null;
        updateMissedBusButtonUI();
        return null;
    }
}

function getInitialLoginDashboard() {
    try {
        const raw = localStorage.getItem("kambus_student_dashboard");
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function applyStopDataFromPayload(stopData) {
    if (!stopData || !stopData.stop_id) return false;
    assignedStop = {
        stop_id: stopData.stop_id,
        name: stopData.stop_name || stopData.name || "Assigned Stop",
        latitude: Number(stopData.latitude),
        longitude: Number(stopData.longitude),
        stop_order: stopData.stop_order || 1,
        is_temporary: stopData.is_temporary === true,
        is_custom_point: stopData.is_custom_point === true,
        temporary_start_date: stopData.temporary_start_date || null,
        temporary_end_date: stopData.temporary_end_date || null
    };
    window.assignedStop = assignedStop;

    const assignment = studentAssignment || stopData || {};
    const isTemp = assignedStop.is_temporary === true;

    const myStopTag = document.querySelector("#myStopCard p.tracking-wider");
    if (myStopTag) {
        if (isTemp) {
            myStopTag.textContent = "TEMPORARY STOP";
            myStopTag.className = "text-[9px] font-bold tracking-wider text-brand uppercase";
        } else {
            myStopTag.textContent = "MY STOP";
            myStopTag.className = "text-[9px] font-bold tracking-wider text-brand uppercase";
        }
    }

    const routeText = isTemp && assignedStop.temporary_start_date
        ? `${assignment.route_name || 'Route ' + (stopData.route_id || '')} • ${assignedStop.temporary_start_date} → ${assignedStop.temporary_end_date}`
        : (assignment.route_name || `Route ${stopData.route_id || ''}`);

    setMyStopState(
        assignedStop.name,
        routeText,
        `Bus: ${assignment.bus_number || "Unavailable"}`,
        `Driver: ${assignment.driver_name || "Unavailable"}`
    );

    const passStopName = document.getElementById("passStopName");
    if (passStopName) {
        passStopName.textContent = assignedStop.name;
    }

    window.updateDrawerHeader?.();
    updateStopMarker();
    return true;
}

async function loadStudentBus() {
    const request = ++studentAssignmentRequest;
    const token = getToken();
    if (!token) {
        setEtaBanner("Location unavailable", "ETA unavailable");
        return false;
    }

    try {
        let data = null;
        const initialLoginData = getInitialLoginDashboard();
        if (!window.__studentBusLoadedFromLogin && initialLoginData && initialLoginData.bus_id) {
            window.__studentBusLoadedFromLogin = true;
            data = initialLoginData;
            if (data.stop_id && (!assignedStop || !assignedStop.stop_id)) {
                applyStopDataFromPayload(data);
            }
        } else {
            const response = await fetch(`${API_BASE}/student/my-bus`, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Authorization": `Bearer ${token}`
                }
            });

            data = await response.json();
            if (request !== studentAssignmentRequest) return false;

            if (!response.ok || !data.bus_id) {
                console.error("[ERROR] Student bus unavailable:", data);
                if (data?.detail === "No bus assigned to this student") {
                    setEtaBanner("No bus assigned yet", "Contact the transport office");
                } else {
                    setEtaBanner("Bus unavailable", "ETA unavailable");
                }
                return false;
            }
        }

        // The backend resolves the full effective bus, driver and route together.
        if (Number(assignedBusId) !== Number(data.bus_id) || studentAssignment?.allotment_id !== data.allotment_id) {
            clearStudentAssignmentTracking();
        }
        regularStudentAssignment = data.alternative_bus
            ? { ...data, bus_id: data.original_bus_id, bus_number: data.original_bus_number }
            : data;
        assignedBusId = data.bus_id;
        studentAssignment = data;
        busTripActive = data.active_trip === true;
        window.regularStudentAssignment = regularStudentAssignment;
        window.studentAssignment = studentAssignment;

        updateStudentDashboard(data);

        await loadMyStop(!assignedStop);
        if (request !== studentAssignmentRequest) return false;
        await loadRouteStops();
        if (request !== studentAssignmentRequest) return false;
        await loadActiveAlternativeAllotment();
        if (request !== studentAssignmentRequest) return false;

        if (!busTripActive) {
            removeBusMarker();

            if (map && assignedStop) {
                map.setView([assignedStop.latitude, assignedStop.longitude], 16);
                stopMarker?.openPopup();
            }

            setEtaBanner("Trip ended", "Bus is not travelling");
            return true;
        }

        if (data.location && Number.isFinite(Number(data.location.latitude)) && Number.isFinite(Number(data.location.longitude))) {
            const initialLocation = {
                latitude: Number(data.location.latitude),
                longitude: Number(data.location.longitude),
                speed: data.location.speed,
                timestamp: data.location.timestamp,
                bus_id: data.bus_id,
                stop_passed: data.stop_passed === true
            };
            if (isFreshLocation(initialLocation.timestamp)) {
                busData = initialLocation;
                updateBusOnMap(initialLocation);
                updateEtaBanner(initialLocation);
            } else {
                removeBusMarker();
                setEtaBanner("Trip ended", "Bus is not travelling");
            }
        }

        await fetchBusLocation();
        return true;
    } catch (error) {
        if (request !== studentAssignmentRequest) return false;
        console.error("[ERROR] Failed to load assigned bus from API:", error);
        setEtaBanner("Bus unavailable", "ETA unavailable");
        return false;
    }
}

// ========================================================================
// MY STOP STATE & API
// ========================================================================

function setMyStopState(name, route, bus, driver, showRetry = false) {
    const fields = [
        ["myStopName", name],
        ["myStopRoute", route],
        ["myStopBus", bus],
        ["myStopDriver", driver]
    ];

    fields.forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            if (typeof value === "string" && value.startsWith("Loading")) {
                // Shimmer placeholder; it disappears when real text replaces it.
                const placeholder = document.createElement("span");
                placeholder.className = "k-skel";
                placeholder.textContent = value;
                element.replaceChildren(placeholder);
            } else {
                element.textContent = value;
            }
        }
    });

    const retry = document.getElementById("myStopRetryRow");
    if (retry) {
        retry.classList.toggle("hidden", !showRetry);
    }
}

function updateMyStopLive(eta) {
    const element = document.getElementById("myStopEta");
    if (element) {
        element.textContent = `ETA: ${eta}`;
    }
}

async function loadMyStop(showLoading = true) {
    const version = studentAssignmentVersion;
    const token = getToken();
    if (!token) return false;

    // Use initial login stop data if already populated
    if (assignedStop && !showLoading) {
        return true;
    }

    const initialLoginData = getInitialLoginDashboard();
    if (!window.__studentStopLoadedFromLogin && initialLoginData && initialLoginData.stop_id) {
        window.__studentStopLoadedFromLogin = true;
        if (applyStopDataFromPayload(initialLoginData)) {
            return true;
        }
    }

    if (showLoading || !assignedStop) {
        setMyStopState(
            "Loading assigned stop…",
            "Loading route details…",
            "Bus: Loading…",
            "Driver: Loading…"
        );
    }

    try {
        const response = await fetch(`${API_BASE}/student/my-stop`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        const stopData = await response.json();
        if (version !== studentAssignmentVersion) return false;

        if (!response.ok) {
            assignedStop = null;
            const noAssignment = response.status === 404;

            setMyStopState(
                noAssignment ? "Stop not assigned" : "Stop unavailable",
                noAssignment
                    ? "Your administrator has not assigned a stop yet."
                    : (stopData.detail || "Unable to load your stop."),
                "Bus: —",
                "Driver: —",
                !noAssignment
            );
            return false;
        }

        return applyStopDataFromPayload(stopData);
    } catch (error) {
        if (version !== studentAssignmentVersion) return false;
        console.error("[ERROR] Unable to load assigned stop from API:", error);
        assignedStop = null;

        setMyStopState(
            "Stop unavailable",
            "Check your connection and try again.",
            "Bus: —",
            "Driver: —",
            true
        );
        return false;
    }
}

// ========================================================================
// STUDENT DASHBOARD UI POPULATION
// ========================================================================

function updateStudentDashboard(data) {
    const busRoute = document.getElementById("studentBusRoute");
    if (busRoute) {
        const prefix = data.alternative_bus ? "Alternative Bus" : "Bus";
        busRoute.textContent = `${prefix} ${data.bus_number || "Unavailable"} • ${data.route_name || "Route unavailable"}`;
    }

    const driverName = document.getElementById("driverName");
    if (driverName) {
        driverName.textContent = data.alternative_bus
            ? (data.driver_name || "Alternative driver")
            : (data.driver_name || "Driver unavailable");
    }

    const driverDetails = document.getElementById("driverDetails");
    if (driverDetails) {
        driverDetails.textContent = data.alternative_bus
            ? "Temporary alternative bus"
            : (data.registration_number || "Assigned bus");
    }

    const phone = document.getElementById("driverPhoneLink");
    if (phone) {
        phone.href = data.driver_phone ? `tel:${data.driver_phone}` : "#";
        phone.classList.toggle("pointer-events-none", !data.driver_phone);
        phone.classList.toggle("opacity-50", !data.driver_phone);
    }

    const passName = document.getElementById("passStudentName");
    if (passName) {
        passName.textContent = data.student_name || "Student";
    }

    const passDetails = document.getElementById("passStudentDetails");
    if (passDetails) {
        passDetails.textContent = `Roll: ${data.roll_number || "Unavailable"}`;
    }

    const passBus = document.getElementById("passBusNumber");
    if (passBus) {
        passBus.textContent = data.bus_number || "Unavailable";
    }

    window.updateDrawerHeader?.();
}

// ========================================================================
// RECENTER MAP
// ========================================================================

function recenterMap() {
    if (!map) {
        initializeMap();
    }
    if (!map) return;

    map.invalidateSize();

    if (busMarker && busTripActive) {
        const position = busMarker.getLatLng();
        map.setView([position.lat, position.lng], 16, { animate: true });
        busMarker.openPopup?.();
        return;
    }

    if (assignedStop && Number.isFinite(assignedStop.latitude) && Number.isFinite(assignedStop.longitude)) {
        map.setView([assignedStop.latitude, assignedStop.longitude], 16, { animate: true });
        if (stopMarker) {
            stopMarker.openPopup?.();
        }
        return;
    }

    if (COLLEGE_LOCATION) {
        map.setView([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude], 14, { animate: true });
    }

    if (typeof KambusNotify !== "undefined") {
        KambusNotify.notify({
            type: "info",
            title: "Map location info",
            message: "Showing college / route location."
        });
    }
}
window.recenterMap = recenterMap;

// ========================================================================
// START LIVE TRACKING & PERIODIC REFRESH
// ========================================================================

async function startLiveTracking() {
    if (!map) {
        initializeMap();
    }

    const loaded = await loadStudentBus();

    if (loaded && busTripActive) {
        await fetchBusLocation();
    }

    if (map) {
        setTimeout(() => {
            map.invalidateSize();
        }, 300);
    }

    if (updateTimer) {
        clearInterval(updateTimer);
    }

    updateTimer = setInterval(async () => {
        const refreshed = await loadStudentBus();
        if (refreshed && busTripActive) {
            await fetchBusLocation();
        }
        await checkActiveDriverAlerts();
    }, 5000);
}

function checkDriverComplaintPoll() {
    checkActiveDriverAlerts();
}

// ========================================================================
// LOAD TRAVEL STATUS
// ========================================================================

async function loadTravelStatus() {
    const token = getToken();
    const waitButton = document.getElementById("btnWaitRequest");

    travelStatusKnown = false;

    if (waitButton) {
        waitButton.disabled = true;
        waitButton.classList.add("opacity-60", "cursor-not-allowed");
    }

    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/student/travel-status`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("[ERROR] Travel status error:", data);
            return;
        }

        travelStatusKnown = true;
        studentTravellingToday = data.status !== "not_travelling";
        updateTravelStatusUI(data.status);
    } catch (error) {
        console.error("[ERROR] Failed to load travel status from API:", error);
        travelStatusKnown = false;
        studentTravellingToday = false;
        updateTravelStatusUI("not_travelling");
    }
}

// ========================================================================
// WAIT BUTTON CONTROL
// ========================================================================

function updateWaitRequestButton() {
    const btn = document.getElementById("btnWaitRequest");
    const icon = document.getElementById("waitIcon");
    const text = document.getElementById("waitBtnText");

    if (!btn) return;

    const canRequestWait = travelStatusKnown && studentTravellingToday;

    btn.disabled = !canRequestWait;
    btn.classList.toggle("opacity-60", !canRequestWait);
    btn.classList.toggle("cursor-not-allowed", !canRequestWait);

    if (canRequestWait) {
        btn.className = "py-2.5 px-3 bg-surface hover:bg-bg border border-line rounded text-xs font-semibold text-navy flex items-center justify-center gap-1.5 transition-colors";
        if (icon) {
            icon.className = "w-3.5 h-3.5 text-warn shrink-0";
            icon.innerHTML = '<use href="icons.svg#icon-clock"/>';
        }
        if (text) text.innerText = "Request Wait";
    } else {
        btn.className = "py-2.5 px-3 bg-bg text-ink-muted border border-line font-semibold text-xs rounded cursor-not-allowed flex items-center justify-center gap-1.5 opacity-60";
        if (icon) {
            icon.className = "w-3.5 h-3.5 text-ink-muted shrink-0";
            icon.innerHTML = '<use href="icons.svg#icon-lock"/>';
        }
        if (text) text.innerText = studentTravellingToday ? "Checking status..." : "Wait Unavailable";
    }
}

// ========================================================================
// PROTECT INLINE WAIT FUNCTIONS
// ========================================================================

function protectWaitRequestFunctions() {
    if (typeof window.openWaitModal === "function") {
        const originalOpenWaitModal = window.openWaitModal;
        window.openWaitModal = function () {
            if (!travelStatusKnown || !studentTravellingToday) {
                if (typeof KambusNotify !== "undefined") {
                    KambusNotify.notify({
                        type: "info",
                        title: "Wait request unavailable",
                        message: "You marked yourself as not travelling today."
                    });
                }
                return;
            }
            originalOpenWaitModal();
        };
    }

    if (typeof window.sendWaitRequest === "function") {
        const originalSendWaitRequest = window.sendWaitRequest;
        window.sendWaitRequest = async function (minutes) {
            if (!travelStatusKnown || !studentTravellingToday) {
                if (typeof KambusNotify !== "undefined") {
                    KambusNotify.notify({
                        type: "info",
                        title: "Wait request unavailable",
                        message: "You cannot request a bus wait after marking Not Travelling."
                    });
                }
                return;
            }
            return originalSendWaitRequest(minutes);
        };
    }
}

// ========================================================================
// TRAVEL STATUS UI
// ========================================================================

function updateTravelStatusUI(status) {
    const btn = document.getElementById("btnNotTravelling");
    const icon = document.getElementById("btnIcon");
    const text = document.getElementById("btnText");

    if (!btn || !icon || !text) return;

    if (status === "not_travelling") {
        studentTravellingToday = false;
        travelStatusKnown = true;

        btn.disabled = true;
        btn.className = "py-2.5 px-3 bg-danger/10 border border-danger/20 text-danger font-semibold text-xs rounded flex items-center justify-center gap-1.5";
        icon.className = "w-3.5 h-3.5 text-danger shrink-0";
        icon.innerHTML = '<use href="icons.svg#icon-check"/>';
        text.innerText = "Status: Skipped Today";

        updateWaitRequestButton();

        const modal = document.getElementById("waitModal");
        if (modal) modal.classList.add("hidden");
        return;
    }

    studentTravellingToday = true;
    travelStatusKnown = true;

    btn.disabled = false;
    btn.className = "py-2.5 px-3 bg-surface hover:bg-bg border border-line text-navy font-semibold text-xs rounded flex items-center justify-center gap-1.5 transition-colors";
    icon.className = "w-3.5 h-3.5 text-ink-muted shrink-0";
    icon.innerHTML = '<use href="icons.svg#icon-xmark"/>';
    text.innerText = "Not Travelling";

    updateWaitRequestButton();
}

// ========================================================================
// DRIVER COMPLAINT DISPLAY & VERIFICATION LOGIC
// ========================================================================

let activeDriverComplaintPoll = null;
let driverComplaintSubmitting = false;
let notificationSocket = null;
let wsReconnectTimer = null;
let processedNotificationIds = new Set();

function formatComplaintReason(reason, description, message) {
    const labels = {
        "driver_not_on_time":       "Driver was late",
        "over_speeding_rash_driving": "Rash / Over Speeding",
        "improper_behaviour":       "Rude Behaviour",
        "foul_language":            "Foul Language",
        "other":                    "Other Issue"
    };

    // Use the free-text description only when it is NOT itself a raw enum key.
    // If complaint_text was set to the enum key (common when no custom description
    // was entered), fall through to the label map instead of displaying the raw slug.
    if (description && typeof description === "string" && description.trim() &&
        description.trim().toLowerCase() !== "other" &&
        !labels.hasOwnProperty(description.trim().toLowerCase())) {
        return description.trim();
    }

    if (message && typeof message === "string") {
        const match = message.match(/(?:bus driver|problem with your driver):\s*([^.]+)/i);
        if (match && match[1]) {
            const extracted = match[1].trim();
            if (extracted && extracted.toLowerCase() !== "other" &&
                extracted.toLowerCase() !== "other issue" &&
                !labels.hasOwnProperty(extracted.toLowerCase())) {
                return extracted;
            }
        }
    }

    return labels[reason] || labels[description] || description || reason || "Other Issue";
}

function showDriverComplaintAlert(pollData) {
    if (!pollData) return;

    const complaintId = Number(pollData.complaintId || pollData.complaint_id || pollData.verification_id);
    if (!complaintId) return;

    if (activeDriverComplaintPoll && activeDriverComplaintPoll.complaintId === complaintId) {
        return;
    }

    if (pollData.notificationId && processedNotificationIds.has(pollData.notificationId)) {
        return;
    }

    let driverName = pollData.driver_name || pollData.driverName || "Assigned Driver";
    if (typeof driverName === "string" && (
        driverName === "Driver #None" ||
        driverName === "Driver #null" ||
        driverName === "Driver #undefined" ||
        driverName.trim() === "Driver #" ||
        driverName.trim() === "None" ||
        driverName.trim() === "null"
    )) {
        driverName = "Assigned Driver";
    }
    const busNumber = pollData.bus || pollData.bus_number || pollData.busNumber || (pollData.busId || pollData.bus_id ? `Bus #${pollData.busId || pollData.bus_id}` : "Assigned Bus");
    const rawReason = pollData.reason || pollData.category || "other";
    const rawDescription = pollData.description || pollData.complaint_text || pollData.complaintText || null;

    activeDriverComplaintPoll = {
        notificationId: pollData.notificationId,
        complaintId: complaintId,
        reason: rawReason,
        description: rawDescription,
        message: pollData.message || null,
        busId: pollData.busId || pollData.bus_id,
        driverName: driverName,
        busNumber: busNumber
    };

    let displayText = formatComplaintReason(rawReason, rawDescription, pollData.message);
    if (!displayText || displayText.trim() === "" || displayText.trim() === "--" || (!rawDescription && (rawReason === "other" || !pollData.reason))) {
        displayText = "Driver complaint, tap to review";
    }

    const reasonElement = document.getElementById("complaintReason");
    if (reasonElement) {
        reasonElement.textContent = displayText;
    }

    const driverElement = document.getElementById("complaintDriverName");
    if (driverElement) {
        driverElement.textContent = driverName;
    }

    const busElement = document.getElementById("complaintBusNumber");
    if (busElement) {
        busElement.textContent = busNumber;
    }

    const detailsElement = document.getElementById("complaintDetails");
    if (detailsElement) {
        const knownKeys = ["driver_not_on_time", "over_speeding_rash_driving", "improper_behaviour", "foul_language", "other"];
        const isEnumKey = rawDescription && knownKeys.includes(rawDescription.trim().toLowerCase());
        if (rawDescription && typeof rawDescription === "string" && rawDescription.trim() &&
            rawDescription.trim() !== displayText &&
            rawDescription.trim().toLowerCase() !== "none" &&
            !isEnumKey) {
            detailsElement.textContent = rawDescription.trim();
            detailsElement.classList.remove("hidden");
        } else {
            detailsElement.textContent = "";
            detailsElement.classList.add("hidden");
        }
    }

    const yesButton = document.getElementById("complaintYesBtn");
    const noButton = document.getElementById("complaintNoBtn");
    if (yesButton) yesButton.disabled = false;
    if (noButton) noButton.disabled = false;

    const alert = document.getElementById("driverComplaintAlert");
    if (alert) {
        alert.classList.add("show");
    }
}

function initNotificationWebSocket() {
    const token = getToken();
    if (!token) return;

    if (notificationSocket && (notificationSocket.readyState === WebSocket.OPEN || notificationSocket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    try {
        notificationSocket = new WebSocket(`${WS_BASE}/ws/notifications?token=${encodeURIComponent(token)}`);

        notificationSocket.onopen = () => {
if (wsReconnectTimer) {
                clearTimeout(wsReconnectTimer);
                wsReconnectTimer = null;
            }
        };

        notificationSocket.onmessage = event => {
            try {
                if (event.data === "pong") return;
                const data = JSON.parse(event.data);
                if (data.type === "entitlements_updated") {
                    loadCampusEntitlements();
                    return;
                }
                if (data.type === "bus_assignment_updated" || data.type === "bus_changed" || data.type === "alternative_bus_allotted") {
                    clearStudentAssignmentTracking();
                    loadStudentBus();
                    window.KambusNotificationCenter?.refresh();
                    if (data.title || data.message) {
                        if (typeof KambusNotify !== "undefined") {
                            KambusNotify.notify({
                                type: "info",
                                title: data.title || "Bus Changed",
                                message: data.message
                            });
                        }
                    }
                    return;
                }
                if (data.type === "announcement" && (data.bus_change_id || data.template_type === "bus_change" || data.bus_id)) {
                    clearStudentAssignmentTracking();
                    loadStudentBus();
                    window.KambusNotificationCenter?.refresh();
                    if (data.title || data.message) {
                        if (typeof KambusNotify !== "undefined") {
                            KambusNotify.notify({
                                type: "info",
                                title: data.title || "Bus Replacement",
                                message: data.message
                            });
                        }
                    }
                    return;
                }

                // ROUTE REROUTED / DETOUR UPDATE
                if (data.type === "route_rerouted" || data.type === "route_update") {
                    const poly = data.polyline;
                    if (Array.isArray(poly) && poly.length >= 2) {
                        currentStudentRouteLatLngs = poly.map(p => [Number(p[0]), Number(p[1])]);
                        if (routePolylineLayer) {
                            routePolylineLayer.clearLayers();
                            routePolylineLayer.addData({
                                type: "Feature",
                                geometry: {
                                    type: "LineString",
                                    coordinates: currentStudentRouteLatLngs.map(p => [p[1], p[0]])
                                }
                            });
                        }
                        if (routeArrowLayer && map) {
                            renderDirectionArrows(map, routeArrowLayer, currentStudentRouteLatLngs, "#ffffff");
                        }
                    }
                    return;
                }

                // 1. EMERGENCY SOS ALERT FROM DRIVER
                if (data.type === "emergency_sos") {
if (typeof KambusNotify !== "undefined") {
                        KambusNotify.notify({
                            type: "error",
                            title: data.title || "Emergency SOS Alert",
                            message: data.message || "Bus driver reported an emergency. Transport cell alerted.",
                            duration: 9000
                        });
                    }
                    showStudentSosAlert(data.message, data);
                    window.KambusNotificationCenter?.refresh();
                    return;
                }

                // 2. ROUTE DETOUR ALERT FROM DRIVER
                if (data.type === "detour_alert") {
if (typeof KambusNotify !== "undefined") {
                        KambusNotify.notify({
                            type: "warning",
                            title: data.title || "Route Detour Alert",
                            message: data.message || "Your bus has taken a route detour.",
                            duration: 7000
                        });
                    }
                    showStudentDetourAlert(data.message, data.delay_minutes, data);
                    window.KambusNotificationCenter?.refresh();
                    return;
                }

                // 3. TRIP STARTED / ENDED
                if (data.type === "trip_started" || data.type === "trip_ended") {
                    if (typeof KambusNotify !== "undefined") {
                        KambusNotify.notify({
                            type: data.type === "trip_started" ? "success" : "info",
                            title: data.title || (data.type === "trip_started" ? "Trip Started" : "Trip Ended"),
                            message: data.message
                        });
                    }
                    if (data.type === "trip_ended") {
                        busTripActive = false;
                        dismissAllAlertBanners();
                        removeBusMarker();
                        setEtaBanner("Trip ended", "Bus is not travelling");
                    }
                    loadStudentBus();
                    window.KambusNotificationCenter?.refresh();
                    return;
                }

                // 4. WAIT REQUEST ACCEPTED / REJECTED / SKIPPED / BOARDED
                if (data.type === "wait_accepted" || data.type === "wait_rejected" || data.type === "wait_request_boarded") {
                    if (typeof KambusNotify !== "undefined") {
                        KambusNotify.notify({
                            type: (data.type === "wait_accepted" || data.type === "wait_request_boarded") ? "success" : "warning",
                            title: data.title || "Wait Request Update",
                            message: data.message
                        });
                    }
                    window.KambusNotificationCenter?.refresh();
                    return;
                }

                // 5. DRIVER COMPLAINT POLL
                if (data.type === "driver_complaint_poll") {
                    const rawPayload = data.payload || data.data || {};
                    const payload = typeof rawPayload === "string" ? JSON.parse(rawPayload || "{}") : rawPayload;
                    const complaintId = payload.complaint_id || payload.verification_id || data.complaint_id || data.verification_id;

                    if (complaintId) {
                        showDriverComplaintAlert({
                            notificationId: data.id,
                            complaintId: complaintId,
                            reason: payload.reason || payload.category || data.reason || data.category || "other",
                            description: payload.description || payload.complaint_text || data.description || data.complaint_text || null,
                            complaint_text: payload.complaint_text || data.complaint_text || null,
                            driver_name: payload.driver_name || data.driver_name || null,
                            bus: payload.bus || payload.bus_number || data.bus || data.bus_number || null,
                            message: data.message || payload.message || null,
                            busId: payload.bus_id || data.bus_id
                        });
                    }
                    return;
                }

                // 6. GENERAL NOTIFICATIONS
                if (data.title || data.message) {
                    if (typeof KambusNotify !== "undefined") {
                        KambusNotify.notify({
                            type: "info",
                            title: data.title || "KAMBUS Update",
                            message: data.message
                        });
                    }
                    window.KambusNotificationCenter?.refresh();
                }
            } catch (err) {
                console.warn("WebSocket message parse error:", err);
            }
        };

        notificationSocket.onclose = () => {
notificationSocket = null;
            if (!wsReconnectTimer) {
                wsReconnectTimer = setTimeout(initNotificationWebSocket, 4000);
            }
        };

        notificationSocket.onerror = () => {
            notificationSocket?.close();
        };
    } catch (e) {
        console.warn("WebSocket init error:", e);
    }
}

// ========================================================================
// SOS / DETOUR ALERT BANNERS
// An alert banner is hidden again when:
//   - the student taps the close button (stored so it does not come back,
//     and the notification is marked read on the server),
//   - the trip ends,
//   - the server no longer reports it as an unread alert, or
//   - the notification is older than ALERT_MAX_AGE_MS.
// ========================================================================

const ALERT_BANNERS = {
    sos:    { bannerId: "studentSosAlertBanner",    textId: "studentSosAlertText" },
    detour: { bannerId: "studentDetourAlertBanner", textId: "studentDetourAlertText" }
};
const ALERT_MAX_AGE_MS = 30 * 60 * 1000;      // stop showing alerts older than 30 min
const ALERT_SYNC_GRACE_MS = 15000;            // do not hide a fresh banner because of a slow poll
const ALERT_MESSAGE_SUPPRESS_MS = 2 * 60 * 1000;
const ALERTS_ONLY_DURING_TRIP = true;         // set false to show alerts even when no trip is running
const DISMISSED_ALERTS_KEY = "kambus_dismissed_alerts";

function loadDismissedAlerts() {
    try {
        const raw = JSON.parse(localStorage.getItem(DISMISSED_ALERTS_KEY) || "{}");
        return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch (e) {
        return {};
    }
}

function rememberDismissedAlert(kind, alertData) {
    const map = loadDismissedAlerts();
    const now = Date.now();
    if (alertData?.id !== null && alertData?.id !== undefined && alertData.id !== "") {
        map[`${kind}:${alertData.id}`] = now;
    }
    if (alertData?.message) {
        map[`${kind}:msg:${alertData.message}`] = now;
    }
    const newest = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 60);
    try {
        localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify(Object.fromEntries(newest)));
    } catch (e) {}
}

function isAlertDismissed(kind, alertData) {
    const map = loadDismissedAlerts();
    if (alertData?.id !== null && alertData?.id !== undefined && alertData.id !== "" && map[`${kind}:${alertData.id}`]) {
        return true;
    }
    const messageStamp = alertData?.message ? map[`${kind}:msg:${alertData.message}`] : null;
    return Boolean(messageStamp) && Date.now() - messageStamp <= ALERT_MESSAGE_SUPPRESS_MS;
}

function isAlertFresh(createdAt) {
    if (!createdAt || typeof createdAt !== "string") return true;
    // Only trust the age when the timestamp carries a timezone; otherwise skip the check.
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(createdAt.trim())) return true;
    const created = Date.parse(createdAt);
    if (!Number.isFinite(created)) return true;
    return Date.now() - created <= ALERT_MAX_AGE_MS;
}

function alertFromNotification(n) {
    return {
        id: n?.id ?? n?.notification_id ?? null,
        message: n?.message || "",
        createdAt: n?.created_at || n?.createdAt || n?.timestamp || null
    };
}

function showAlertBanner(kind, alertData) {
    const cfg = ALERT_BANNERS[kind];
    const banner = document.getElementById(cfg.bannerId);
    const text = document.getElementById(cfg.textId);
    if (!banner || !text) return;
    if (isAlertDismissed(kind, alertData)) return;

    if (alertData?.message) text.textContent = alertData.message;
    if (alertData?.id !== null && alertData?.id !== undefined && alertData.id !== "") {
        banner.dataset.notificationId = String(alertData.id);
    }
    if (banner.classList.contains("hidden")) {
        banner.dataset.shownAt = String(Date.now());
        banner.classList.remove("hidden");
    }
}

function hideAlertBanner(kind) {
    const cfg = ALERT_BANNERS[kind];
    const banner = document.getElementById(cfg.bannerId);
    if (!banner) return;
    banner.classList.add("hidden");
    delete banner.dataset.notificationId;
    delete banner.dataset.shownAt;
}

async function markNotificationRead(notificationId) {
    const token = getToken();
    if (!token || !notificationId) return;
    try {
        await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
            method: "PATCH",
            headers: { "Authorization": `Bearer ${token}` }
        });
        window.KambusNotificationCenter?.refresh();
    } catch (err) {
        console.warn("Mark notification read error:", err);
    }
}

function dismissAlertBanner(kind) {
    const cfg = ALERT_BANNERS[kind];
    const banner = document.getElementById(cfg?.bannerId);
    const text = document.getElementById(cfg?.textId);
    if (!banner) return;

    const notificationId = banner.dataset.notificationId || null;
    rememberDismissedAlert(kind, { id: notificationId, message: text?.textContent || "" });
    hideAlertBanner(kind);
    if (notificationId) markNotificationRead(notificationId);
}
window.dismissAlertBanner = dismissAlertBanner;

/** Called when the trip ends: clear both banners and make sure they stay cleared. */
function dismissAllAlertBanners() {
    Object.keys(ALERT_BANNERS).forEach(kind => {
        const banner = document.getElementById(ALERT_BANNERS[kind].bannerId);
        if (banner && !banner.classList.contains("hidden")) dismissAlertBanner(kind);
    });
}

/** Hide a banner the server no longer reports, unless it only just appeared. */
function hideAlertBannerIfStale(kind) {
    const banner = document.getElementById(ALERT_BANNERS[kind].bannerId);
    if (!banner || banner.classList.contains("hidden")) return;
    const shownAt = Number(banner.dataset.shownAt || 0);
    if (Date.now() - shownAt > ALERT_SYNC_GRACE_MS) hideAlertBanner(kind);
}

function showStudentSosAlert(message, meta = {}) {
    showAlertBanner("sos", { id: meta.id ?? meta.notification_id ?? null, message });
}

function showStudentDetourAlert(message, delayMinutes, meta = {}) {
    showAlertBanner("detour", { id: meta.id ?? meta.notification_id ?? null, message });
}

function syncAlertBanners(notifications) {
    const tripAllowsAlerts = !ALERTS_ONLY_DURING_TRIP || busTripActive;
    const sources = [["sos", "emergency_sos"], ["detour", "detour_alert"]];

    sources.forEach(([kind, type]) => {
        const match = tripAllowsAlerts
            ? notifications
                .filter(n => n.type === type && !n.is_read)
                .map(alertFromNotification)
                .find(a => isAlertFresh(a.createdAt) && !isAlertDismissed(kind, a))
            : null;

        if (match) showAlertBanner(kind, match);
        else hideAlertBannerIfStale(kind);
    });
}

async function checkActiveDriverAlerts() {
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/notifications?limit=20`, {
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) return;

        const data = await response.json();
        const notifications = Array.isArray(data) ? data : (data.notifications || []);

        // SOS / detour banners: show while unread, fresh and the trip is running;
        // hide again once the server stops reporting them.
        syncAlertBanners(notifications);

        // Check driver complaint poll
        const pollNotification = notifications.find(
            n => n.type === "driver_complaint_poll" && !n.is_read
        );

        if (pollNotification && !activeDriverComplaintPoll) {
            let payload = {};
            const rawPayload = pollNotification.payload || pollNotification.data || {};
            try {
                payload = typeof rawPayload === "string"
                    ? JSON.parse(rawPayload || "{}")
                    : (rawPayload || {});
            } catch (e) {}

            const complaintId = payload.complaint_id || payload.verification_id || pollNotification.complaint_id || pollNotification.reference_id;
            if (complaintId) {
                showDriverComplaintAlert({
                    notificationId: pollNotification.id,
                    complaintId: complaintId,
                    reason: payload.reason || payload.category || pollNotification.reason || "other",
                    description: payload.description || payload.complaint_text || pollNotification.description || null,
                    complaint_text: payload.complaint_text || null,
                    driver_name: payload.driver_name || null,
                    bus: payload.bus || payload.bus_number || null,
                    message: pollNotification.message || null,
                    busId: payload.bus_id || pollNotification.bus_id
                });
            }
        }
    } catch (error) {
        console.warn("Active alerts check error:", error);
    }
}

async function answerDriverComplaintPoll(answer) {
    if (!activeDriverComplaintPoll || !activeDriverComplaintPoll.complaintId) {
        return;
    }

    const token = getToken();
    if (!token) {
        if (typeof KambusNotify !== "undefined") {
            KambusNotify.notify({
                type: "warning",
                title: "Session expired",
                message: "Please login again."
            });
        }
        return;
    }

    const yesButton = document.getElementById("complaintYesBtn");
    const noButton = document.getElementById("complaintNoBtn");

    if (yesButton) yesButton.disabled = true;
    if (noButton) noButton.disabled = true;

    const currentPoll = { ...activeDriverComplaintPoll };

    try {
        const response = await fetch(`${API_BASE}/student/driver-complaint/verify`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                complaint_id: currentPoll.complaintId,
                response: answer
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            // 403 = this poll is no longer relevant for this student (bus assignment
            // changed between when the poll was sent and when they answered). Dismiss
            // the modal silently — showing "Unable to submit" and re-enabling buttons
            // just confuses the student with an unanswerable prompt.
            if (response.status === 403) {
                if (currentPoll.notificationId) {
                    processedNotificationIds.add(currentPoll.notificationId);
                    try {
                        await fetch(`${API_BASE}/notifications/${currentPoll.notificationId}/read`, {
                            method: "PATCH",
                            headers: { "Authorization": `Bearer ${token}` }
                        });
                    } catch (err) {
                        console.warn("Mark notification read error:", err);
                    }
                }
                const alertEl = document.getElementById("driverComplaintAlert");
                if (alertEl) alertEl.classList.remove("show");
                activeDriverComplaintPoll = null;
                return;
            }
            throw new Error(data.detail || "Failed to submit response");
        }

        if (currentPoll.notificationId) {
            processedNotificationIds.add(currentPoll.notificationId);
            try {
                await fetch(`${API_BASE}/notifications/${currentPoll.notificationId}/read`, {
                    method: "PATCH",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
            } catch (err) {
                console.warn("Mark notification read error:", err);
            }
        }

        const alert = document.getElementById("driverComplaintAlert");
        if (alert) {
            alert.classList.remove("show");
        }

        activeDriverComplaintPoll = null;

        if (typeof KambusNotify !== "undefined") {
            KambusNotify.notify({
                type: "success",
                title: "Response submitted",
                message: "Thank you for helping verify this report."
            });
        }
    } catch (error) {
        console.error("Complaint response failed:", error);

        if (yesButton) yesButton.disabled = false;
        if (noButton) noButton.disabled = false;

        if (typeof KambusNotify !== "undefined") {
            KambusNotify.notify({
                type: "error",
                title: "Unable to submit",
                message: error.message || "Please try again."
            });
        }
    }
}
window.answerDriverComplaintPoll = answerDriverComplaintPoll;

// ========================================================================
// DRIVER COMPLAINT MODAL HANDLERS
// ========================================================================

function updateComplaintAudienceVisibility(genderRestriction = null) {
    const audienceGroup = document.getElementById("studentComplaintAudienceGroup");
    const audienceSelect = document.getElementById("studentComplaintAudienceSelect");
    if (!audienceGroup || !audienceSelect) return;

    const restriction = (
        genderRestriction ||
        window.studentAssignment?.gender_restriction ||
        window.regularStudentAssignment?.gender_restriction ||
        ""
    ).trim().toLowerCase();

    if (restriction === "girls_only" || restriction === "boys_only") {
        audienceGroup.classList.add("hidden");
        audienceSelect.value = restriction === "girls_only" ? "girls" : "boys";
    } else {
        audienceGroup.classList.remove("hidden");
        if (!audienceSelect.value) {
            audienceSelect.value = "both";
        }
    }
}
window.updateComplaintAudienceVisibility = updateComplaintAudienceVisibility;

function openDriverComplaintModal() {
    const modal = document.getElementById("driverComplaintModal");
    if (!modal) return;

    resetDriverComplaintModal();
    updateComplaintAudienceVisibility();
    modal.classList.remove("hidden");
}
window.openDriverComplaintModal = openDriverComplaintModal;

function closeDriverComplaintModal() {
    const modal = document.getElementById("driverComplaintModal");
    if (!modal) return;

    modal.classList.add("hidden");
    resetDriverComplaintModal();
}
window.closeDriverComplaintModal = closeDriverComplaintModal;

function resetDriverComplaintModal() {
    driverComplaintSubmitting = false;

    if (typeof setComplaintTargetType === "function") {
        setComplaintTargetType("driver");
    }

    const subEl = document.getElementById("complaintModalSub");
    if (subEl) subEl.textContent = "Reporting your driver";

    const optionsView = document.getElementById("driverComplaintOptionsView");
    const otherView = document.getElementById("driverComplaintOtherView");
    const studentView = document.getElementById("studentComplaintFormView");

    if (optionsView) optionsView.classList.remove("hidden");
    if (otherView) otherView.classList.add("hidden");
    if (studentView) studentView.classList.add("hidden");

    updateComplaintAudienceVisibility();

    const textarea = document.getElementById("driverComplaintOtherText");
    if (textarea) textarea.value = "";

    const studentSelect = document.getElementById("complaintTargetStudentSelect");
    if (studentSelect) studentSelect.value = "";
    const studentDesc = document.getElementById("studentComplaintDescText");
    if (studentDesc) studentDesc.value = "";
    const studentErr = document.getElementById("studentComplaintError");
    if (studentErr) studentErr.classList.add("hidden");

    const errorElement = document.getElementById("driverComplaintOtherError");
    if (errorElement) errorElement.classList.add("hidden");

    const submitBtn = document.getElementById("driverComplaintOtherSubmitBtn");
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Complaint";
    }

    const studentSubmitBtn = document.getElementById("studentComplaintSubmitBtn");
    if (studentSubmitBtn) {
        studentSubmitBtn.disabled = false;
        studentSubmitBtn.textContent = "Submit Report";
    }

    const optionButtons = document.querySelectorAll(".driverComplaintOptionBtn");
    optionButtons.forEach(btn => {
        btn.disabled = false;
    });
}

let allBusPeers = [];

if (typeof escapeHtml !== "function") {
    var escapeHtml = function(str) {
        if (str == null) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };
}

function formatPeerPrivacyName(rawName, rollNumber) {
    const roll = (rollNumber !== null && rollNumber !== undefined && String(rollNumber).trim())
        ? String(rollNumber).trim()
        : "No roll";
    const name = (rawName || "").trim();
    if (!name) {
        return `Student (${roll})`;
    }
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return `${parts[0]} (${roll})`;
    }
    const firstName = parts[0];
    const lastWord = parts[parts.length - 1];
    const lastInitial = lastWord.charAt(0).toUpperCase();
    return `${firstName} ${lastInitial}. (${roll})`;
}
window.formatPeerPrivacyName = formatPeerPrivacyName;

function renderComplaintTargetStudents(peers, audience) {
    const select = document.getElementById("complaintTargetStudentSelect");
    if (!select) return;

    let filtered = peers || [];
    const aud = (audience || "").toLowerCase();
    if (aud === "girls") {
        filtered = filtered.filter(p => !p.gender || p.gender.toLowerCase() === "female");
    } else if (aud === "boys") {
        filtered = filtered.filter(p => !p.gender || p.gender.toLowerCase() === "male");
    }

    const currentVal = select.value;
    select.innerHTML = `<option value="">-- Select student on your bus --</option>` +
        filtered.map(p => `<option value="${p.student_id}">${escapeHtml(formatPeerPrivacyName(p.name, p.roll_number))}</option>`).join("");
    if (currentVal && filtered.some(p => String(p.student_id) === String(currentVal))) {
        select.value = currentVal;
    }
}
window.renderComplaintTargetStudents = renderComplaintTargetStudents;
if (typeof module !== "undefined" && module.exports) {
    module.exports = { formatPeerPrivacyName, renderComplaintTargetStudents, escapeHtml };
}

let complaintTargetType = "driver";

window.setComplaintTargetType = async function(type) {
    complaintTargetType = type;
    const driverBtn = document.getElementById("complaintTargetDriverBtn");
    const studentBtn = document.getElementById("complaintTargetStudentBtn");
    const driverView = document.getElementById("driverComplaintOptionsView");
    const studentView = document.getElementById("studentComplaintFormView");
    const otherView = document.getElementById("driverComplaintOtherView");
    const subEl = document.getElementById("complaintModalSub");

    if (otherView) otherView.classList.add("hidden");

    if (type === "driver") {
        if (subEl) subEl.textContent = "Reporting your driver";
        if (driverBtn) {
            driverBtn.classList.add("active");
            driverBtn.setAttribute("aria-selected", "true");
            driverBtn.style.background = "#DC2626";
            driverBtn.style.color = "#ffffff";
            driverBtn.style.fontWeight = "700";
            driverBtn.style.boxShadow = "0 2px 6px rgba(220, 38, 38, 0.25)";
        }
        if (studentBtn) {
            studentBtn.classList.remove("active");
            studentBtn.setAttribute("aria-selected", "false");
            studentBtn.style.background = "transparent";
            studentBtn.style.color = "#6B7280";
            studentBtn.style.fontWeight = "600";
            studentBtn.style.boxShadow = "none";
        }
        if (driverView) driverView.classList.remove("hidden");
        if (studentView) studentView.classList.add("hidden");
    } else {
        if (subEl) subEl.textContent = "Reporting a fellow student";
        if (studentBtn) {
            studentBtn.classList.add("active");
            studentBtn.setAttribute("aria-selected", "true");
            studentBtn.style.background = "#DC2626";
            studentBtn.style.color = "#ffffff";
            studentBtn.style.fontWeight = "700";
            studentBtn.style.boxShadow = "0 2px 6px rgba(220, 38, 38, 0.25)";
        }
        if (driverBtn) {
            driverBtn.classList.remove("active");
            driverBtn.setAttribute("aria-selected", "false");
            driverBtn.style.background = "transparent";
            driverBtn.style.color = "#6B7280";
            driverBtn.style.fontWeight = "600";
            driverBtn.style.boxShadow = "none";
        }
        if (driverView) driverView.classList.add("hidden");
        if (studentView) studentView.classList.remove("hidden");

        updateComplaintAudienceVisibility();

        const audienceSelect = document.getElementById("studentComplaintAudienceSelect");
        if (audienceSelect && !audienceSelect.dataset.peerFilterBound) {
            audienceSelect.dataset.peerFilterBound = "true";
            audienceSelect.addEventListener("change", () => {
                renderComplaintTargetStudents(allBusPeers, audienceSelect.value);
            });
        }

        const token = typeof getToken === "function" ? getToken() : localStorage.getItem("kambus_token");
        if (token) {
            try {
                const res = await fetch(`${API_BASE}/student/bus-peers`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.gender_restriction) {
                        updateComplaintAudienceVisibility(data.gender_restriction);
                    }
                    allBusPeers = data.peers || [];
                    window.allBusPeers = allBusPeers;
                    renderComplaintTargetStudents(allBusPeers, audienceSelect ? audienceSelect.value : "both");
                }
            } catch (e) {
                console.error("Failed to load bus peers:", e);
            }
        }
    }
};

window.submitStudentComplaint = async function() {
    const studentSelect = document.getElementById("complaintTargetStudentSelect");
    const reasonSelect = document.getElementById("studentComplaintReasonSelect");
    const audienceSelect = document.getElementById("studentComplaintAudienceSelect");
    const descText = document.getElementById("studentComplaintDescText");
    const errorEl = document.getElementById("studentComplaintError");
    const submitBtn = document.getElementById("studentComplaintSubmitBtn");

    const targetStudentId = studentSelect ? parseInt(studentSelect.value, 10) : null;
    const reason = reasonSelect ? reasonSelect.value : "harassment";
    const audience = audienceSelect ? audienceSelect.value : "both";
    const description = descText ? descText.value.trim() : "";

    if (!targetStudentId || isNaN(targetStudentId)) {
        if (errorEl) {
            errorEl.textContent = "Please select the target student.";
            errorEl.classList.remove("hidden");
        }
        return;
    }

    if (!description) {
        if (errorEl) {
            errorEl.textContent = "Please provide details for the report.";
            errorEl.classList.remove("hidden");
        }
        return;
    }

    if (errorEl) errorEl.classList.add("hidden");

    const token = typeof getToken === "function" ? getToken() : localStorage.getItem("kambus_token");
    if (!token) return;

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
    }

    try {
        const res = await fetch(`${API_BASE}/student/driver-complaint`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                target_student_id: targetStudentId,
                reason,
                audience,
                description
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.detail || "Failed to submit report.");
        }

        closeDriverComplaintModal();
        if (typeof KambusNotify !== "undefined") {
            KambusNotify.notify({
                type: "success",
                title: "Report Submitted",
                message: "Your confidential report has been submitted and peer verification initiated."
            });
        }
    } catch (e) {
        if (errorEl) {
            errorEl.textContent = e.message || "Failed to submit report.";
            errorEl.classList.remove("hidden");
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Report";
        }
    }
};


function showOtherComplaintInput() {
    const optionsView = document.getElementById("driverComplaintOptionsView");
    const otherView = document.getElementById("driverComplaintOtherView");
    const textarea = document.getElementById("driverComplaintOtherText");
    const errorElement = document.getElementById("driverComplaintOtherError");

    if (optionsView) optionsView.classList.add("hidden");
    if (otherView) otherView.classList.remove("hidden");
    if (errorElement) errorElement.classList.add("hidden");
    if (textarea) {
        textarea.value = "";
        setTimeout(() => textarea.focus(), 50);
    }
}
window.showOtherComplaintInput = showOtherComplaintInput;

function cancelOtherComplaint() {
    const optionsView = document.getElementById("driverComplaintOptionsView");
    const otherView = document.getElementById("driverComplaintOtherView");
    const textarea = document.getElementById("driverComplaintOtherText");
    const errorElement = document.getElementById("driverComplaintOtherError");

    if (optionsView) optionsView.classList.remove("hidden");
    if (otherView) otherView.classList.add("hidden");
    if (errorElement) errorElement.classList.add("hidden");
    if (textarea) textarea.value = "";
}
window.cancelOtherComplaint = cancelOtherComplaint;

async function submitDriverComplaint(reason) {
    if (driverComplaintSubmitting) return;

    const token = getToken();
    if (!token) {
        if (typeof KambusNotify !== "undefined") {
            KambusNotify.notify({
                type: "warning",
                title: "Session expired",
                message: "Please login again."
            });
        }
        return;
    }

    driverComplaintSubmitting = true;
    const optionButtons = document.querySelectorAll(".driverComplaintOptionBtn");
    optionButtons.forEach(btn => {
        btn.disabled = true;
    });

    try {
        const response = await fetch(`${API_BASE}/student/driver-complaint`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                reason: reason,
                description: null
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.detail || "Unable to submit driver report.");
        }

        closeDriverComplaintModal();

        if (typeof KambusNotify !== "undefined") {
            KambusNotify.notify({
                type: "success",
                title: "Report submitted",
                message: "Your complaint has been registered with college administration."
            });
        }
    } catch (error) {
        console.error("[ERROR] Driver complaint submission failed:", error);
        if (typeof KambusNotify !== "undefined") {
            KambusNotify.notify({
                type: "error",
                title: "Submission failed",
                message: error.message || "Failed to submit complaint. Please try again."
            });
        }
    } finally {
        driverComplaintSubmitting = false;
        optionButtons.forEach(btn => {
            btn.disabled = false;
        });
    }
}
window.submitDriverComplaint = submitDriverComplaint;

async function submitOtherDriverComplaint() {
    if (driverComplaintSubmitting) return;

    const textarea = document.getElementById("driverComplaintOtherText");
    const errorElement = document.getElementById("driverComplaintOtherError");
    const submitBtn = document.getElementById("driverComplaintOtherSubmitBtn");

    const description = textarea?.value?.trim() || "";
    if (!description) {
        if (errorElement) {
            errorElement.textContent = "Please describe the issue before submitting.";
            errorElement.classList.remove("hidden");
        }
        textarea?.focus();
        return;
    }

    if (errorElement) errorElement.classList.add("hidden");

    const token = getToken();
    if (!token) {
        if (typeof KambusNotify !== "undefined") {
            KambusNotify.notify({
                type: "warning",
                title: "Session expired",
                message: "Please login again."
            });
        }
        return;
    }

    driverComplaintSubmitting = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
    }

    try {
        const response = await fetch(`${API_BASE}/student/driver-complaint`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                reason: "other",
                description: description
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.detail || "Unable to submit driver report.");
        }

        closeDriverComplaintModal();

        if (typeof KambusNotify !== "undefined") {
            KambusNotify.notify({
                type: "success",
                title: "Report submitted",
                message: "Your complaint has been registered with college administration."
            });
        }
    } catch (error) {
        console.error("[ERROR] Driver complaint submission failed:", error);
        if (errorElement) {
            errorElement.textContent = error.message || "Failed to submit report.";
            errorElement.classList.remove("hidden");
        }
        if (typeof KambusNotify !== "undefined") {
            KambusNotify.notify({
                type: "error",
                title: "Submission failed",
                message: error.message || "Failed to submit complaint. Please try again."
            });
        }
    } finally {
        driverComplaintSubmitting = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Complaint";
        }
    }
}
window.submitOtherDriverComplaint = submitOtherDriverComplaint;


// ========================================================================
// MISSED BUS + TEMPORARY STOP FEATURES
// ========================================================================

function featureNotify(type, title, message) {
    if (typeof KambusNotify !== "undefined") {
        KambusNotify.notify({ type, title, message });
    } else {
        alert(`${title}\n\n${message}`);
    }
}

function updateMissedBusButtonUI() {
    const button = document.getElementById("btnMissedBus");
    const subtitle = document.getElementById("missedBusStatus");
    if (!button) return;

    if (activeAlternativeAllotment?.active) {
        button.classList.add("hidden");
        if (subtitle) {
            subtitle.textContent = `Alternative bus allotted: ${activeAlternativeAllotment.alternative_bus_number || "—"} • ${activeAlternativeAllotment.stop_name || "your stop"}`;
            subtitle.classList.remove("hidden");
        }
        return;
    }

    button.classList.remove("hidden");
    button.disabled = false;
    button.className = "py-2.5 px-3 bg-surface hover:bg-bg border border-line rounded text-xs font-semibold text-navy flex items-center justify-center gap-1.5 transition-colors";
    button.innerHTML = `<svg class="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden="true"><use href="icons.svg#icon-bus-slash"/></svg><span>Missed Bus</span>`;
    if (subtitle) subtitle.classList.add("hidden");
}

function openMissedBusModal() {
    const modal = document.getElementById("missedBusModal");
    if (!modal) return;
    const busText = document.getElementById("missedBusRegularNumber");
    if (busText) busText.textContent = regularStudentAssignment?.bus_number || "your regular bus";
    modal.classList.remove("hidden");
}
window.openMissedBusModal = openMissedBusModal;

function closeMissedBusModal() {
    document.getElementById("missedBusModal")?.classList.add("hidden");
}
window.closeMissedBusModal = closeMissedBusModal;

async function getOptionalStudentCoordinates() {
    if (!navigator.geolocation) return {};

    return await new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
            position => {
                const latitude = Number(position.coords.latitude);
                const longitude = Number(position.coords.longitude);
                resolve(
                    Number.isFinite(latitude) && Number.isFinite(longitude) &&
                    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
                        ? { latitude, longitude }
                        : {}
                );
            },
            () => resolve({}),
            { enableHighAccuracy: true, timeout: 3500, maximumAge: 15000 }
        );
    });
}

async function requestAlternativeBus() {
    if (studentFeatureSubmitting) return;

    const token = getToken();
    if (!token) {
        featureNotify("warning", "Session expired", "Please login again.");
        return;
    }

    if (activeAlternativeAllotment?.active) {
        closeMissedBusModal();
        featureNotify("info", "Alternative bus already active", `Bus ${activeAlternativeAllotment.alternative_bus_number || "—"} is already assigned for this journey.`);
        return;
    }

    studentFeatureSubmitting = true;
    const submit = document.getElementById("confirmMissedBusBtn");
    if (submit) {
        submit.disabled = true;
        submit.innerHTML = `<svg class="w-4 h-4 shrink-0 animate-spin" aria-hidden="true"><use href="icons.svg#icon-spinner"/></svg><span>Finding bus…</span>`;
    }

    try {
        const coords = await getOptionalStudentCoordinates();
        const response = await fetch(`${API_BASE}/student/missed-bus/allot`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(coords)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const detail = Array.isArray(data.detail)
                ? data.detail.map(item => item?.msg || String(item)).join(" ")
                : data.detail;
            throw new Error(detail || "No suitable alternative bus is available right now.");
        }

        activeAlternativeAllotment = {
            active: true,
            ...data,
            trip_active: true
        };

        closeMissedBusModal();
        updateMissedBusButtonUI();
        // Refresh the dashboard so the map and header immediately use the alternative bus.
        clearStudentAssignmentTracking();
        await loadStudentBus();
    } catch (error) {
        console.error("[ERROR] Missed bus allotment failed:", error);
        featureNotify("error", "Unable to allot a bus", error.message || "Please try again.");
    } finally {
        studentFeatureSubmitting = false;
        if (submit) {
            submit.disabled = false;
            submit.innerHTML = `<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-wand"/></svg><span>Find My Alternative Bus</span>`;
        }
    }
}
window.requestAlternativeBus = requestAlternativeBus;

function formatDateForInput(date) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// ========================================================================
// MAP-BASED TEMPORARY STOP PICKER (Extracted to temporary-stop.js)
// ========================================================================
// The temporary stop picker and management logic has been extracted into
// the shared temporary-stop.js module, reused by both student.html and parent.html.

// ========================================================================
// CAMPUS PLAN ENTITLEMENTS & FEATURE GATING
// ========================================================================

let campusEntitlements = null;

async function loadCampusEntitlements() {
    const token = getToken();
    if (!token) return;
    try {
        const response = await fetch(`${API_BASE}/me/entitlements`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
            }
        });
        if (response.ok) {
            campusEntitlements = await response.json();
            window.campusEntitlements = campusEntitlements;
            applyStudentFeatureGating();
        }
    } catch (e) {
        console.warn("Could not load campus entitlements:", e);
    }
}

function hasEntitlement(featureName) {
    if (!campusEntitlements || !Array.isArray(campusEntitlements.features)) {
        return true; // default open while loading
    }
    return campusEntitlements.features.includes(featureName);
}

function showPlanUpgradePrompt(featureName, requiredTier, benefitDescription) {
    const tierName = requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1);
    const msg = `${featureName} requires the ${tierName} plan or higher.\n${benefitDescription || "Contact your campus administrator to upgrade."}`;
    if (typeof KambusNotify !== "undefined" && KambusNotify.notify) {
        KambusNotify.notify({
            type: "warn",
            title: `${tierName} Plan Required`,
            message: msg
        });
    } else {
        alert(msg);
    }
}

function applyStudentFeatureGating() {
    const btnWait = document.getElementById("btnWaitRequest");
    if (btnWait) {
        if (!hasEntitlement("wait_request")) {
            btnWait.classList.add("plan-gated-feature");
            if (!btnWait.querySelector(".plan-gate-badge")) {
                const badge = document.createElement("span");
                badge.className = "plan-gate-badge text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded ml-1.5 inline-flex items-center gap-0.5";
                badge.innerHTML = `<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg> Top`;
                btnWait.appendChild(badge);
            }
        } else {
            btnWait.classList.remove("plan-gated-feature");
            btnWait.querySelectorAll(".plan-gate-badge").forEach(el => el.remove());
        }
    }

    const btnTemp = document.getElementById("btnTemporaryStop");
    if (btnTemp) {
        if (!hasEntitlement("temporary_stop_change")) {
            btnTemp.classList.add("plan-gated-feature");
            if (!btnTemp.querySelector(".plan-gate-badge")) {
                const badge = document.createElement("span");
                badge.className = "plan-gate-badge text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded ml-1.5 inline-flex items-center gap-0.5";
                badge.innerHTML = `<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg> Top`;
                btnTemp.appendChild(badge);
            }
        } else {
            btnTemp.classList.remove("plan-gated-feature");
            btnTemp.querySelectorAll(".plan-gate-badge").forEach(el => el.remove());
        }
    }

    const btnMsg = document.querySelector(`[onclick*="openMessageAdminModal"]`);
    if (btnMsg) {
        if (!hasEntitlement("student_to_admin_query")) {
            btnMsg.classList.add("plan-gated-feature");
            if (!btnMsg.querySelector(".plan-gate-badge")) {
                const badge = document.createElement("span");
                badge.className = "plan-gate-badge text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded ml-auto inline-flex items-center gap-0.5";
                badge.innerHTML = `<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg> Premium`;
                btnMsg.appendChild(badge);
            }
        } else {
            btnMsg.classList.remove("plan-gated-feature");
            btnMsg.querySelectorAll(".plan-gate-badge").forEach(el => el.remove());
        }
    }
}

window.hasEntitlement = hasEntitlement;
window.showPlanUpgradePrompt = showPlanUpgradePrompt;
window.loadCampusEntitlements = loadCampusEntitlements;
window.applyStudentFeatureGating = applyStudentFeatureGating;

// ========================================================================
// INITIALIZATION ON DOM CONTENT LOADED
// ========================================================================

document.addEventListener("DOMContentLoaded", () => {
    loadCampusEntitlements();
    // 0. Pre-hydrate personalized dashboard directly from login response
    const initialLoginData = getInitialLoginDashboard();
    if (initialLoginData) {
        if (initialLoginData.bus_id) {
            updateStudentDashboard(initialLoginData);
        }
        if (initialLoginData.stop_id) {
            applyStopDataFromPayload(initialLoginData);
        }
    }

    // 1. Initialize Map
    initializeMap();

    // 2. Bind Stop Action Buttons
    document.getElementById("viewStopOnMap")?.addEventListener("click", () => {
        if (!map) {
            initializeMap();
        }
        if (map && assignedStop) {
            map.invalidateSize();
            map.setView([assignedStop.latitude, assignedStop.longitude], 16, { animate: true });
            stopMarker?.openPopup();
            document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (typeof KambusNotify !== "undefined") {
            KambusNotify.notify({
                type: "info",
                title: "Stop unavailable",
                message: "Your assigned stop has not loaded yet."
            });
        }
    });

    document.getElementById("retryMyStop")?.addEventListener("click", async () => {
        await loadMyStop(true);
        await loadRouteStops();
    });

    // 3. Start the existing dashboard loads together so the screen fills quickly.
    // The existing inline loading labels remain visible until each request resolves.
    startLiveTracking();
    loadTravelStatus();
    loadTemporaryStopChange();
    updateMissedBusButtonUI();

    const temporaryStartDate = document.getElementById("temporaryStartDate");
    temporaryStartDate?.addEventListener("change", () => {
        const endDate = document.getElementById("temporaryEndDate");
        if (endDate && temporaryStartDate.value) {
            endDate.min = temporaryStartDate.value;
            if (!endDate.value || endDate.value < temporaryStartDate.value) {
                endDate.value = temporaryStartDate.value;
            }
        }
    });
    document.getElementById("temporaryRegisteredStop")?.addEventListener("change", () => {
        selectTemporaryPickup();
        saveTemporaryStopDraft();
        resetTemporaryStopRouteCheck();
        renderTemporaryDirectionSummary();
        updateTemporaryStopSubmitState();
    });
    document.getElementById("temporaryPinLatitude")?.addEventListener("input", () => { resetTemporaryStopRouteCheck(); selectTemporaryPickup(); });
    document.getElementById("temporaryPinLongitude")?.addEventListener("input", () => { resetTemporaryStopRouteCheck(); selectTemporaryPickup(); });
    initNotificationWebSocket();    
    checkActiveDriverAlerts();
    setInterval(checkActiveDriverAlerts, 10000);
    protectWaitRequestFunctions();

    // Live Entitlements & Bus Assignment auto-refresh on foreground / interval (fast live-refresh path)
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            loadCampusEntitlements();
            loadStudentBus();
        }
    });
    window.addEventListener("focus", () => {
        loadCampusEntitlements();
        loadStudentBus();
    });
    setInterval(() => {
        loadCampusEntitlements();
        loadStudentBus();
    }, 60000);
});

// Window resize & orientation change handlers to ensure map renders smoothly
window.addEventListener("resize", () => {
    if (tempStopPickerMap) tempStopPickerMap.invalidateSize({ animate: false, pan: false });
    if (map) {
        map.invalidateSize();
    }
});

window.addEventListener("orientationchange", () => {
    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 200);
});

// ========================================================================
// MESSAGE ADMIN HANDLERS
// ========================================================================
// MESSAGE ADMIN HANDLERS (BIDIRECTIONAL CHAT)
// ========================================================================
async function loadAdminMessageHistory() {
    const historyContainer = document.getElementById("adminMessageHistory");
    if (!historyContainer) return;

    const token = typeof getToken === "function" ? getToken() : localStorage.getItem("kambus_token");
    if (!token) {
        historyContainer.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">Please log in to view conversation.</div>`;
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/student/messages`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load messages");

        const messages = Array.isArray(data.messages) ? data.messages : [];
        if (messages.length === 0) {
            historyContainer.innerHTML = `
                <div class="py-8 text-center text-xs text-slate-400 space-y-1">
                    <div class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 mb-1">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                    </div>
                    <p class="font-semibold text-slate-600">No previous messages</p>
                    <p class="text-[11px] text-slate-400">Type a query below to message the transport desk directly.</p>
                </div>
            `;
            return;
        }

        historyContainer.innerHTML = messages.map(m => {
            const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const replyTimeStr = m.replied_at ? new Date(m.replied_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const isBus = m.category === "bus-related";

            return `
                <div class="space-y-1.5 text-xs">
                    <!-- Student message bubble -->
                    <div class="flex flex-col items-end">
                        <div class="bg-[#17333f] text-white p-3 rounded-2xl rounded-tr-none max-w-[85%] shadow-sm space-y-1">
                            <div class="flex items-center justify-between gap-2 text-[10px] text-teal-300">
                                <span class="font-bold uppercase tracking-wider">${isBus ? 'Bus Query' : 'General'}</span>
                                <span>${timeStr}</span>
                            </div>
                            <p class="text-xs leading-relaxed whitespace-pre-wrap break-words">${typeof escapeHtml === "function" ? escapeHtml(m.message) : m.message}</p>
                        </div>
                    </div>

                    <!-- Admin reply or waiting status -->
                    ${m.reply ? `
                        <div class="flex flex-col items-start pl-1">
                            <div class="bg-teal-50 border border-teal-200/80 text-teal-950 p-3 rounded-2xl rounded-tl-none max-w-[85%] shadow-sm space-y-1">
                                <div class="flex items-center gap-1.5 text-[10px] text-teal-700 font-bold">
                                    <span class="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                                    <span>${m.admin_name || 'Transport Admin'}</span>
                                    ${replyTimeStr ? `<span class="font-normal text-slate-400 ml-auto">${replyTimeStr}</span>` : ''}
                                </div>
                                <p class="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap break-words">${typeof escapeHtml === "function" ? escapeHtml(m.reply) : m.reply}</p>
                            </div>
                        </div>
                    ` : `
                        <div class="flex items-center justify-end pr-2 text-[10px] text-slate-400 gap-1">
                            <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                            <span>Waiting for admin response...</span>
                        </div>
                    `}
                </div>
            `;
        }).join("");

        // Scroll to bottom
        historyContainer.scrollTop = historyContainer.scrollHeight;
    } catch (e) {
        historyContainer.innerHTML = `<div class="p-4 text-center text-xs text-red-500">Could not load chat history: ${e.message}</div>`;
    }
}
window.loadAdminMessageHistory = loadAdminMessageHistory;

window.openMessageAdminModal = function() {
    if (typeof window.hasEntitlement === "function" && !window.hasEntitlement("student_to_admin_query")) {
        window.showPlanUpgradePrompt("Message Admin", "Premium", "Direct inquiry channel with campus transport administrators.");
        return;
    }
    const modal = document.getElementById("messageAdminModal");
    if (!modal) return;
    const textarea = document.getElementById("adminMessageText");
    if (textarea) textarea.value = "";
    document.getElementById("adminMessageError")?.classList.add("hidden");
    document.getElementById("adminMessageSuccess")?.classList.add("hidden");
    const submitBtn = document.getElementById("adminMessageSubmitBtn");
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send Message";
    }
    modal.classList.remove("hidden");
    loadAdminMessageHistory();
    setTimeout(() => textarea?.focus(), 100);
};

window.closeMessageAdminModal = function() {
    const modal = document.getElementById("messageAdminModal");
    if (modal) modal.classList.add("hidden");
};

window.submitMessageToAdmin = async function() {
    const textarea = document.getElementById("adminMessageText");
    const categorySelect = document.getElementById("adminMessageCategory");
    const errorEl = document.getElementById("adminMessageError");
    const successEl = document.getElementById("adminMessageSuccess");
    const submitBtn = document.getElementById("adminMessageSubmitBtn");

    const message = textarea ? textarea.value.trim() : "";
    const category = categorySelect ? categorySelect.value : "general";

    if (!message) {
        if (errorEl) {
            errorEl.textContent = "Please type a message before sending.";
            errorEl.classList.remove("hidden");
        }
        return;
    }
    if (errorEl) errorEl.classList.add("hidden");

    const token = typeof getToken === "function" ? getToken() : localStorage.getItem("kambus_token");
    if (!token) {
        if (typeof showToast === "function") showToast("error", "Error", "You are not logged in.");
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending...";
    }

    try {
        const res = await fetch(`${API_BASE}/student/message-admin`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ message, category })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            if (textarea) textarea.value = "";
            if (successEl) {
                successEl.textContent = "Message sent to admin!";
                successEl.classList.remove("hidden");
                setTimeout(() => successEl.classList.add("hidden"), 3000);
            }
            if (typeof showToast === "function") {
                showToast("success", "Message Sent", "Your message was sent to the transport admin.");
            }
            await loadAdminMessageHistory();
        } else {
            throw new Error(data.detail || "Failed to send message.");
        }
    } catch (err) {
        if (errorEl) {
            errorEl.textContent = err.message || "Failed to send message.";
            errorEl.classList.remove("hidden");
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Send Message";
        }
    }
};

// ========================================================================
// NAVIGATION DRAWER & 3-LINES MENU
// ========================================================================

window.updateDrawerHeader = function() {
    const nameEl = document.getElementById("drawerStudentName");
    const busStopEl = document.getElementById("drawerBusStop");
    const passName = document.getElementById("passStudentName");
    const passBus = document.getElementById("passBusNumber");
    const passStop = document.getElementById("passPickupPoint");

    // Student Name
    let sName = (typeof studentAssignment !== "undefined" && studentAssignment?.student_name) ||
                (typeof cachedStudentProfile !== "undefined" && cachedStudentProfile?.name) ||
                (passName && passName.textContent && passName.textContent !== "Loading..." && passName.textContent !== "Student" ? passName.textContent : null) ||
                "Student";
    if (nameEl) nameEl.textContent = sName;

    // Bus Number
    let bNum = (typeof studentAssignment !== "undefined" && studentAssignment?.bus_number) ||
               (typeof regularStudentAssignment !== "undefined" && regularStudentAssignment?.bus_number) ||
               (passBus && passBus.textContent && passBus.textContent !== "Loading..." ? passBus.textContent : null) ||
               (typeof assignedBusNumber !== "undefined" ? assignedBusNumber : null) ||
               "--";

    // Stop Name
    let sStop = (typeof assignedStop !== "undefined" && assignedStop?.name) ||
                (typeof studentStopName !== "undefined" && studentStopName) ||
                (passStop && passStop.textContent && passStop.textContent !== "Loading..." ? passStop.textContent : null) ||
                "--";

    if (busStopEl) {
        busStopEl.textContent = `Bus ${bNum} • ${sStop}`;
    }
};

let drawerCloseTimer = null;

window.openStudentMenuDrawer = function() {
    if (drawerCloseTimer) {
        clearTimeout(drawerCloseTimer);
        drawerCloseTimer = null;
    }
    const drawer = document.getElementById("studentMenuDrawer");
    const backdrop = document.getElementById("studentMenuBackdrop");
    const panel = document.getElementById("studentMenuPanel");
    if (!drawer || !panel) return;

    window.updateDrawerHeader();

    drawer.classList.remove("hidden");
    // Force DOM reflow so transition starts reliably
    void panel.offsetWidth;
    if (backdrop) backdrop.classList.add("open");
    panel.classList.add("open");
};

window.closeStudentMenuDrawer = function() {
    if (drawerCloseTimer) {
        clearTimeout(drawerCloseTimer);
        drawerCloseTimer = null;
    }
    const drawer = document.getElementById("studentMenuDrawer");
    const backdrop = document.getElementById("studentMenuBackdrop");
    const panel = document.getElementById("studentMenuPanel");
    if (!drawer || !panel) return;

    if (backdrop) backdrop.classList.remove("open");
    panel.classList.remove("open");

    drawerCloseTimer = setTimeout(() => {
        if (!panel.classList.contains("open")) {
            drawer.classList.add("hidden");
        }
        drawerCloseTimer = null;
    }, 250);
};

// ========================================================================
// LOGOUT CONFIRMATION & SESSION HANDLING
// ========================================================================

window.openLogoutConfirmModal = function() {
    window.closeStudentMenuDrawer();
    const modal = document.getElementById("logoutConfirmModal");
    if (modal) modal.classList.remove("hidden");
};

window.closeLogoutConfirmModal = function() {
    const modal = document.getElementById("logoutConfirmModal");
    if (modal) modal.classList.add("hidden");
};

window.handleStudentLogout = function() {
    window.__kambusSigningOut = true;
    localStorage.removeItem("kambus_token");
    localStorage.removeItem("kambus_role");
    localStorage.removeItem("kambus_user_id");
    localStorage.removeItem("kambus_student_dashboard");
    if (window.AndroidSession && typeof window.AndroidSession.clearSession === "function") {
        try { window.AndroidSession.clearSession(); } catch (_) {}
    }
    window.location.replace("index.html");
};

// ========================================================================
// STUDENT PROFILE: VIEW & EDIT DETAILS
// ========================================================================

let cachedStudentProfile = null;

window.openStudentProfileModal = async function() {
    window.closeStudentMenuDrawer();
    const modal = document.getElementById("studentProfileModal");
    const alertEl = document.getElementById("profileAlert");
    if (alertEl) {
        alertEl.classList.add("hidden");
        alertEl.textContent = "";
    }
    if (!modal) return;

    modal.classList.remove("hidden");

    const token = typeof getToken === "function" ? getToken() : localStorage.getItem("kambus_token");
    if (!token) return;

    try {
        const res = await fetch(`${API_BASE}/student/profile`, {
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });
        if (!res.ok) throw new Error("Could not load profile details.");
        const profile = await res.json();
        cachedStudentProfile = profile;

        // Populate fields
        const nameInput = document.getElementById("profileName");
        const phoneInput = document.getElementById("profilePhone");
        const emailInput = document.getElementById("profileEmail");
        const genderSelect = document.getElementById("profileGender");
        const deptInput = document.getElementById("profileDepartment");
        const passInput = document.getElementById("profilePassword");

        const rollBadge = document.getElementById("profileRollBadge");
        const busDisplay = document.getElementById("profileAssignedBus");
        const stopDisplay = document.getElementById("profileAssignedStop");

        if (nameInput) nameInput.value = profile.name || "";
        if (phoneInput) phoneInput.value = profile.phone || "";
        if (emailInput) emailInput.value = profile.email || "";
        if (genderSelect) genderSelect.value = profile.gender || "";
        if (deptInput) deptInput.value = profile.department || "";
        if (passInput) passInput.value = "";

        if (rollBadge) rollBadge.textContent = profile.roll_number || "--";
        if (busDisplay) busDisplay.textContent = profile.bus_number ? `Bus ${profile.bus_number}` : "Unassigned";
        if (stopDisplay) stopDisplay.textContent = profile.stop_name || "Unassigned";

        // Update drawer name if matching
        window.updateDrawerHeader?.();

    } catch (err) {
        console.warn("[Profile] Failed to fetch profile details:", err);
        if (alertEl) {
            alertEl.className = "p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 block border border-rose-200";
            alertEl.textContent = "Could not load current profile details. Please try again.";
        }
    }
};

window.closeStudentProfileModal = function() {
    const modal = document.getElementById("studentProfileModal");
    if (modal) modal.classList.add("hidden");
};

window.submitStudentProfile = async function(event) {
    if (event) event.preventDefault();
    const token = typeof getToken === "function" ? getToken() : localStorage.getItem("kambus_token");
    if (!token) return;

    const btn = document.getElementById("btnSaveProfile");
    const alertEl = document.getElementById("profileAlert");

    const name = document.getElementById("profileName")?.value.trim();
    const phone = document.getElementById("profilePhone")?.value.trim();
    const email = document.getElementById("profileEmail")?.value.trim();
    const gender = document.getElementById("profileGender")?.value;
    const department = document.getElementById("profileDepartment")?.value.trim();
    const password = document.getElementById("profilePassword")?.value;

    if (!name || !phone) {
        if (alertEl) {
            alertEl.className = "p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 block border border-rose-200";
            alertEl.textContent = "Name and Phone Number are required.";
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span>Saving...</span>`;
    }

    try {
        const payload = {
            name,
            phone,
            email: email || null,
            gender: gender || null,
            department: department || null
        };
        if (password && password.length >= 6) {
            payload.password = password;
        }

        const res = await fetch(`${API_BASE}/student/profile`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Failed to update profile.");
        }

        if (alertEl) {
            alertEl.className = "p-3 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 block border border-emerald-200";
            alertEl.textContent = "Profile updated successfully!";
        }

        // Update UI displays
        const passName = document.getElementById("passStudentName");
        if (passName) passName.textContent = data.name;
        window.updateDrawerHeader?.();

        if (typeof featureNotify === "function") {
            featureNotify("ok", "Profile Saved", "Your profile details have been updated.");
        }

        setTimeout(() => {
            window.closeStudentProfileModal();
        }, 1200);

    } catch (err) {
        if (alertEl) {
            alertEl.className = "p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 block border border-rose-200";
            alertEl.textContent = err.message || "Failed to save profile changes.";
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>Save Changes</span>`;
        }
    }
};

// ========================================================================
// PERMANENT STOP CHANGE
// ========================================================================

let permAllBuses = [];
let permMyBusStops = [];
let permStopPickerMap = null;
let permPickupMarker = null;
let permStopRouteMarkers = [];
let permRoutePolyline = null;
let permStopDirection = "morning";
let permStopInputMode = "pin";
let permRouteView = "my";
let permHeadingUp = false;

const permStopDrafts = {
    morning: { mode: "pin", latitude: null, longitude: null, address: null, stopId: null, routeCheck: null, candidateBusId: null },
    evening: { mode: "pin", latitude: null, longitude: null, address: null, stopId: null, routeCheck: null, candidateBusId: null }
};

function hasPermCoordinates(lat, lng) {
    return lat != null && lng != null && String(lat).trim() !== "" && String(lng).trim() !== "" &&
        Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
        Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
}

function permDirectionColor() {
    return permStopDirection === "evening" ? "#dc2626" : "#16a34a";
}

function permStopInputFromDraft(direction) {
    const draft = permStopDrafts[direction];
    if (!draft) return null;
    if (draft.mode === "registered" && draft.stopId) {
        return { stop_id: Number(draft.stopId) };
    }
    if (hasPermCoordinates(draft.latitude, draft.longitude)) {
        return {
            latitude: Number(draft.latitude),
            longitude: Number(draft.longitude),
            address: draft.address || `Stop (${Number(draft.latitude).toFixed(4)}, ${Number(draft.longitude).toFixed(4)})`
        };
    }
    return null;
}

function getPermCurrentRequestInput() {
    const draft = permStopDrafts[permStopDirection];
    if (draft.mode === "registered") {
        const stopId = document.getElementById("permRegisteredStop")?.value || draft.stopId;
        return stopId ? { stop_id: Number(stopId) } : null;
    }
    const lat = document.getElementById("permPinLatitude")?.value ?? draft.latitude;
    const lng = document.getElementById("permPinLongitude")?.value ?? draft.longitude;
    return hasPermCoordinates(lat, lng) ? { latitude: Number(lat), longitude: Number(lng), address: draft.address || undefined } : null;
}

function savePermStopDraft() {
    const draft = permStopDrafts[permStopDirection];
    draft.mode = permStopInputMode;
    if (permStopInputMode === "registered") {
        const select = document.getElementById("permRegisteredStop");
        draft.stopId = select?.value ? Number(select.value) : null;
        draft.address = select?.options[select.selectedIndex]?.text || null;
    } else {
        const lat = document.getElementById("permPinLatitude")?.value;
        const lng = document.getElementById("permPinLongitude")?.value;
        if (hasPermCoordinates(lat, lng)) {
            draft.latitude = Number(lat);
            draft.longitude = Number(lng);
        }
    }
}

function renderPermDirectionSummary() {
    const morningEl = document.getElementById("permMorningSummary");
    const eveningEl = document.getElementById("permEveningSummary");
    const morningDraft = permStopDrafts.morning;
    const eveningDraft = permStopDrafts.evening;

    if (morningEl) {
        if (morningDraft.stopId || hasPermCoordinates(morningDraft.latitude, morningDraft.longitude)) {
            morningEl.textContent = morningDraft.address || (morningDraft.stopId ? `Stop #${morningDraft.stopId}` : `${Number(morningDraft.latitude).toFixed(4)}, ${Number(morningDraft.longitude).toFixed(4)}`);
            morningEl.className = "text-emerald-700 font-bold";
        } else {
            morningEl.textContent = "Not selected";
            morningEl.className = "";
        }
    }
    if (eveningEl) {
        if (eveningDraft.stopId || hasPermCoordinates(eveningDraft.latitude, eveningDraft.longitude)) {
            eveningEl.textContent = eveningDraft.address || (eveningDraft.stopId ? `Stop #${eveningDraft.stopId}` : `${Number(eveningDraft.latitude).toFixed(4)}, ${Number(eveningDraft.longitude).toFixed(4)}`);
            eveningEl.className = "text-rose-700 font-bold";
        } else {
            eveningEl.textContent = "Not selected";
            eveningEl.className = "";
        }
    }
}

function updatePermSubmitState() {
    const submitBtn = document.getElementById("btnSubmitPermStop");
    if (!submitBtn) return;
    const morningInput = permStopInputFromDraft("morning");
    const eveningInput = permStopInputFromDraft("evening");
    const morningOk = !morningInput || !!permStopDrafts.morning.routeCheck;
    const eveningOk = !eveningInput || !!permStopDrafts.evening.routeCheck;
    const hasAtLeastOne = !!(morningInput || eveningInput);

    if (hasAtLeastOne && morningOk && eveningOk) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
        submitBtn.innerHTML = `<span>Submit Request</span>`;
    } else {
        submitBtn.disabled = true;
        submitBtn.classList.add("opacity-50", "cursor-not-allowed");
        submitBtn.innerHTML = `<span>Check Location First</span>`;
    }
}

window.loadPermanentStopStatus = async function() {
    const token = typeof getToken === "function" ? getToken() : localStorage.getItem("kambus_token");
    if (!token) return null;

    const statusCard = document.getElementById("permRequestStatusCard");
    const submitBtn = document.getElementById("btnSubmitPermStop");

    try {
        const res = await fetch(`${API_BASE}/student/permanent-stop-change`, {
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });
        if (!res.ok) {
            if (statusCard) statusCard.classList.add("hidden");
            return null;
        }

        const data = await res.json();
        if (!statusCard) return data;

        if (data.has_request) {
            statusCard.classList.remove("hidden");

            let stopDisplay = `<strong>${data.desired_stop_name || ('Stop #' + data.desired_stop_id)}</strong>`;
            if (data.morning_stop_name || data.evening_stop_name) {
                const parts = [];
                if (data.morning_stop_name) parts.push(`Morning: <strong>${data.morning_stop_name}</strong>`);
                if (data.evening_stop_name) parts.push(`Evening: <strong>${data.evening_stop_name}</strong>`);
                stopDisplay = parts.join(" | ");
            }
            if (data.selected_latitude && data.selected_longitude) {
                stopDisplay += ` <span class="text-[11px] text-slate-500 font-mono">(📍 ${Number(data.selected_latitude).toFixed(4)}, ${Number(data.selected_longitude).toFixed(4)})</span>`;
            }

            if (data.status === "pending_admin_approval" || data.is_pending) {
                statusCard.className = "p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 mb-3 text-xs";
                statusCard.innerHTML = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="inline-flex items-center gap-1 font-black px-2 py-0.5 rounded text-[10px] uppercase bg-amber-200 text-amber-900">
                            Pending Admin Approval
                        </span>
                        <span class="text-[11px] text-amber-700 font-semibold">Submitted ${data.effective_date || ''}</span>
                    </div>
                    <p class="mt-1">
                        Requested Stop: ${stopDisplay}
                        ${data.target_bus_number ? ` on <strong>Bus ${data.target_bus_number}</strong>` : ''}
                    </p>
                    ${data.reason ? `<p class="mt-1 text-[11px] text-amber-800">Reason: "${data.reason}"</p>` : ''}
                    <p class="mt-1.5 text-[11px] text-amber-700 italic">An administrator is reviewing your request. Your regular stop remains active until approved.</p>
                `;
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = `<span>Request Pending Approval</span>`;
                }
            } else if (data.status === "approved" || data.is_approved) {
                statusCard.className = "p-3.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 mb-3 text-xs";
                statusCard.innerHTML = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="inline-flex items-center gap-1 font-black px-2 py-0.5 rounded text-[10px] uppercase bg-emerald-200 text-emerald-900">
                            Approved
                        </span>
                        <span class="text-[11px] text-emerald-700 font-semibold">${data.effective_date || ''}</span>
                    </div>
                    <p class="mt-1">
                        Your permanent stop was updated to ${stopDisplay}.
                    </p>
                `;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<span>Submit Request</span>`;
                }
            } else if (data.status === "rejected" || data.is_rejected) {
                statusCard.className = "p-3.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 mb-3 text-xs";
                statusCard.innerHTML = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="inline-flex items-center gap-1 font-black px-2 py-0.5 rounded text-[10px] uppercase bg-rose-200 text-rose-900">
                            Request Rejected
                        </span>
                    </div>
                    <p class="mt-1">Your previous permanent stop change request was rejected.</p>
                    ${data.admin_notes ? `<p class="mt-1 text-[11px] font-semibold text-rose-800">Reason: ${data.admin_notes}</p>` : ''}
                    <p class="mt-1.5 text-[11px] text-rose-700">You may submit a new request below if needed.</p>
                `;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<span>Submit Request</span>`;
                }
            } else {
                statusCard.classList.add("hidden");
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<span>Submit Request</span>`;
                }
            }
        } else {
            statusCard.classList.add("hidden");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span>Submit Request</span>`;
            }
        }
        return data;
    } catch (e) {
        console.warn("[PermStop] Failed to load permanent stop status:", e);
        if (statusCard) statusCard.classList.add("hidden");
        return null;
    }
};

window.setPermStopDirection = function(direction) {
    savePermStopDraft();
    permStopDirection = direction;

    const morningBtn = document.getElementById("permMorningDirectionBtn");
    const eveningBtn = document.getElementById("permEveningDirectionBtn");
    if (direction === "morning") {
        morningBtn?.classList.add("is-active");
        eveningBtn?.classList.remove("is-active");
    } else {
        eveningBtn?.classList.add("is-active");
        morningBtn?.classList.remove("is-active");
    }

    const draft = permStopDrafts[direction];
    permStopInputMode = draft.mode || "pin";
    window.setPermStopInputMode(permStopInputMode);

    if (draft.latitude && draft.longitude) {
        window.selectPermPickup(draft.latitude, draft.longitude, draft.address);
    } else if (permPickupMarker && permStopPickerMap) {
        permStopPickerMap.removeLayer(permPickupMarker);
        permPickupMarker = null;
        const addrEl = document.getElementById("permStopPickerAddress");
        if (addrEl) addrEl.textContent = "Tap map to pick location...";
    }

    const resEl = document.getElementById("permRouteCheckResult");
    if (resEl) {
        if (draft.routeCheck) {
            resEl.classList.remove("hidden");
            resEl.className = draft.routeCheck.on_route ? "kx-notice kx-notice--row kx-notice--ok p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs" : "kx-notice kx-notice--row kx-notice--danger p-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs";
            resEl.innerHTML = `<span>${draft.routeCheck.message || "Route check completed"}</span>`;
        } else {
            resEl.classList.add("hidden");
        }
    }

    renderPermDirectionSummary();
    updatePermSubmitState();
    renderPermStopsOnMap();
};

window.setPermStopInputMode = function(mode) {
    permStopInputMode = mode;
    permStopDrafts[permStopDirection].mode = mode;

    const registeredBtn = document.getElementById("permRegisteredModeBtn");
    const pinBtn = document.getElementById("permPinModeBtn");
    const regFields = document.getElementById("permRegisteredStopFields");
    const pinCoords = document.getElementById("permManualCoordinatesDetails");

    if (mode === "registered") {
        registeredBtn?.classList.add("is-active");
        pinBtn?.classList.remove("is-active");
        regFields?.classList.remove("hidden");
        pinCoords?.classList.add("hidden");
    } else {
        pinBtn?.classList.add("is-active");
        registeredBtn?.classList.remove("is-active");
        regFields?.classList.add("hidden");
        pinCoords?.classList.remove("hidden");
    }
};

window.clearPermStopDirection = function() {
    permStopDrafts[permStopDirection] = {
        mode: "pin", latitude: null, longitude: null, address: null, stopId: null, routeCheck: null, candidateBusId: null
    };
    if (permPickupMarker && permStopPickerMap) {
        permStopPickerMap.removeLayer(permPickupMarker);
        permPickupMarker = null;
    }
    const addrEl = document.getElementById("permStopPickerAddress");
    if (addrEl) addrEl.textContent = "Tap map to pick location...";
    const latIn = document.getElementById("permPinLatitude");
    const lngIn = document.getElementById("permPinLongitude");
    if (latIn) latIn.value = "";
    if (lngIn) lngIn.value = "";
    const resEl = document.getElementById("permRouteCheckResult");
    if (resEl) resEl.classList.add("hidden");
    const candEl = document.getElementById("permCandidateBuses");
    if (candEl) candEl.innerHTML = "";

    renderPermDirectionSummary();
    updatePermSubmitState();
};

window.selectPermPickup = function(lat, lng, address = null) {
    if (!permStopPickerMap || !hasPermCoordinates(lat, lng)) return;
    const color = permDirectionColor();

    if (permPickupMarker) {
        permPickupMarker.setLatLng([lat, lng]);
    } else {
        permPickupMarker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: color,
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95
        }).addTo(permStopPickerMap);
    }

    const latIn = document.getElementById("permPinLatitude");
    const lngIn = document.getElementById("permPinLongitude");
    if (latIn) latIn.value = Number(lat).toFixed(6);
    if (lngIn) lngIn.value = Number(lng).toFixed(6);

    const draft = permStopDrafts[permStopDirection];
    draft.latitude = Number(lat);
    draft.longitude = Number(lng);
    draft.routeCheck = null;

    const addrEl = document.getElementById("permStopPickerAddress");
    if (address) {
        draft.address = address;
        if (addrEl) addrEl.textContent = address;
    } else {
        const coordLabel = `Location (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})`;
        draft.address = coordLabel;
        if (addrEl) addrEl.textContent = coordLabel;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
            .then(r => r.json())
            .then(d => {
                if (d && d.display_name) {
                    draft.address = d.display_name.split(",").slice(0, 3).join(",").trim();
                    if (addrEl) addrEl.textContent = draft.address;
                    renderPermDirectionSummary();
                }
            })
            .catch(() => {});
    }

    renderPermDirectionSummary();
    updatePermSubmitState();
};

window.checkPermStopRoute = async function() {
    const token = typeof getToken === "function" ? getToken() : localStorage.getItem("kambus_token");
    if (!token) return;

    savePermStopDraft();
    const input = getPermCurrentRequestInput();
    const resEl = document.getElementById("permRouteCheckResult");
    const candEl = document.getElementById("permCandidateBuses");
    const checkBtn = document.getElementById("checkPermPinBtn");

    if (!input) {
        if (typeof featureNotify === "function") {
            featureNotify("warning", "Choose a Stop", "Select a registered stop or tap the map to place a pin.");
        }
        return;
    }

    if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.innerHTML = `<span>Checking Route...</span>`;
    }

    try {
        const payload = {
            ...input,
            trip_type: permStopDirection
        };

        const res = await fetch(`${API_BASE}/student/temporary-stop-change/check-route`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Unable to check route.");

        permStopDrafts[permStopDirection].routeCheck = data;

        if (resEl) {
            resEl.classList.remove("hidden");
            if (data.on_route) {
                resEl.className = "kx-notice kx-notice--row kx-notice--ok p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs";
                resEl.innerHTML = `✓ ${data.message || "Stop is directly on assigned bus route"}`;
            } else {
                resEl.className = "kx-notice kx-notice--row kx-notice--danger p-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs";
                resEl.innerHTML = `⚠ ${data.message || "Location requires bus route change or admin allotment"}`;
            }
        }

        if (candEl && Array.isArray(data.candidate_buses) && data.candidate_buses.length > 0) {
            candEl.innerHTML = data.candidate_buses.map(candidate => `
                <label class="kx-bus-option p-2.5 rounded-xl border border-slate-200 bg-white flex items-center gap-2 cursor-pointer text-xs">
                    <input type="radio" name="permCandidateBus" value="${candidate.bus_id}" ${candidate.is_recommended ? "checked" : ""}>
                    <span><strong>Bus ${candidate.bus_number}</strong> — ${candidate.route_name || 'Active Route'} (${candidate.driver_name || 'Driver'})</span>
                </label>
            `).join("");
            const selectedRadio = candEl.querySelector("input[name='permCandidateBus']:checked");
            if (selectedRadio) {
                permStopDrafts[permStopDirection].candidateBusId = Number(selectedRadio.value);
            }
            candEl.querySelectorAll("input[name='permCandidateBus']").forEach(radio => {
                radio.addEventListener("change", e => {
                    permStopDrafts[permStopDirection].candidateBusId = Number(e.target.value);
                });
            });
        } else if (candEl) {
            candEl.innerHTML = "";
        }

        updatePermSubmitState();

    } catch (err) {
        if (resEl) {
            resEl.classList.remove("hidden");
            resEl.className = "kx-notice kx-notice--row kx-notice--danger p-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs";
            resEl.textContent = err.message || "Route check failed.";
        }
    } finally {
        if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.innerHTML = `<span>Step 1: Check Location</span>`;
        }
    }
};

function renderPermStopsOnMap() {
    if (!permStopPickerMap) return;
    permStopRouteMarkers.forEach(m => permStopPickerMap.removeLayer(m));
    permStopRouteMarkers = [];

    const stops = permGetSelectedRouteStops();
    stops.forEach(stop => {
        if (!hasPermCoordinates(stop.latitude, stop.longitude)) return;
        const marker = L.circleMarker([stop.latitude, stop.longitude], {
            radius: 5,
            fillColor: stop.is_custom ? "#f97316" : "#2563eb",
            color: "#ffffff",
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.9
        }).addTo(permStopPickerMap);
        marker.bindPopup(`<b>${stop.name || 'Stop'}</b><br>Stop #${stop.stop_order || ''}`);
        marker.on("click", () => {
            if (permStopInputMode === "registered") {
                const select = document.getElementById("permRegisteredStop");
                if (select) {
                    select.value = String(stop.stop_id);
                    savePermStopDraft();
                    window.checkPermStopRoute();
                }
            } else {
                window.selectPermPickup(stop.latitude, stop.longitude, stop.name);
            }
        });
        permStopRouteMarkers.push(marker);
    });

    drawPermRoutePolyline(stops);
}

function permGetSelectedRouteStops() {
    if (permRouteView === "my") {
        return permMyBusStops.length > 0 ? permMyBusStops : (window.routeStops || []);
    }
    const bus = permAllBuses.find(b => Number(b.bus_id) === Number(permRouteView));
    return bus?.stops || [];
}

async function drawPermRoutePolyline(stops) {
    if (!permStopPickerMap || !stops || stops.length < 2) return;
    if (permRoutePolyline) {
        permStopPickerMap.removeLayer(permRoutePolyline);
        permRoutePolyline = null;
    }

    const validStops = stops.filter(s => hasPermCoordinates(s.latitude, s.longitude))
        .sort((a, b) => Number(a.stop_order || 0) - Number(b.stop_order || 0));
    if (validStops.length < 2) return;

    const COLLEGE = window.COLLEGE_LOCATION || { latitude: 18.054145, longitude: 79.535587 };
    let waypoints = [...validStops, COLLEGE];
    if (permStopDirection === "evening") {
        waypoints.reverse();
    }

    const coordStr = waypoints.map(w => `${Number(w.longitude)},${Number(w.latitude)}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("OSRM error");
        const json = await res.json();
        const coords = json.routes?.[0]?.geometry?.coordinates;
        if (!coords || coords.length < 2) return;

        let travelPoints = coords.map(([lng, lat]) => [lat, lng]);
        const color = permDirectionColor();

        permRoutePolyline = L.polyline(travelPoints, {
            color: color,
            weight: 4,
            opacity: 0.8,
            lineJoin: "round"
        }).addTo(permStopPickerMap);

    } catch (e) {
        console.warn("[PermStop] Road routing fallback:", e);
    }
}

window.setPermRouteView = function(busId) {
    permRouteView = busId;
    renderPermStopsOnMap();
    renderPermRegisteredStopOptions();
};

function renderPermRegisteredStopOptions() {
    const select = document.getElementById("permRegisteredStop");
    if (!select) return;
    const stops = permGetSelectedRouteStops();
    if (stops.length === 0) {
        select.innerHTML = `<option value="">No stops on this route</option>`;
        return;
    }
    select.innerHTML = `<option value="">-- Choose a Stop --</option>` +
        stops.map(s => `<option value="${s.stop_id}">Stop #${s.stop_order}: ${s.name}</option>`).join("");
}

window.setPermMapHeading = function(enabled) {
    permHeadingUp = enabled;
    if (permStopPickerMap) {
        if (!enabled && typeof permStopPickerMap.setBearing === "function") {
            permStopPickerMap.setBearing(0);
        }
    }
};

window.initPermStopPickerMap = function() {
    const container = document.getElementById("permStopPickerMap");
    if (!container || typeof L === "undefined") return;

    if (permStopPickerMap) {
        permStopPickerMap.invalidateSize();
        return;
    }

    const COLLEGE = window.COLLEGE_LOCATION || { latitude: 18.054145, longitude: 79.535587 };
    permStopPickerMap = L.map("permStopPickerMap", {
        zoomControl: true,
        attributionControl: false
    }).setView([COLLEGE.latitude, COLLEGE.longitude], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19
    }).addTo(permStopPickerMap);

    permStopPickerMap.on("click", e => {
        window.selectPermPickup(e.latlng.lat, e.latlng.lng);
    });

    renderPermStopsOnMap();
};

window.openPermanentStopModal = async function() {
    window.closeStudentMenuDrawer();
    const modal = document.getElementById("permanentStopModal");
    const alertEl = document.getElementById("permanentStopAlert");
    if (alertEl) {
        alertEl.classList.add("hidden");
        alertEl.textContent = "";
    }
    if (!modal) return;

    modal.classList.remove("hidden");

    // Set default effective date to tomorrow
    const dateInput = document.getElementById("permEffectiveDate");
    if (dateInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.value = tomorrow.toISOString().split("T")[0];
        dateInput.min = new Date().toISOString().split("T")[0];
    }

    // Check status of previous or pending requests
    await window.loadPermanentStopStatus();

    // Load bus routes and student's regular route stops
    const token = typeof getToken === "function" ? getToken() : localStorage.getItem("kambus_token");
    if (token) {
        try {
            const [busesRes, myStopsRes] = await Promise.all([
                fetch(`${API_BASE}/student/all-bus-routes`, { headers: { "Accept": "application/json", "Authorization": `Bearer ${token}` } }),
                fetch(`${API_BASE}/student/my-route-stops`, { headers: { "Accept": "application/json", "Authorization": `Bearer ${token}` } })
            ]);
            const busesData = await busesRes.json();
            permAllBuses = Array.isArray(busesData.buses) ? busesData.buses : [];

            if (myStopsRes.ok) {
                const myStopsData = await myStopsRes.json();
                permMyBusStops = Array.isArray(myStopsData.stops) ? myStopsData.stops : [];
            }

            const routeViewSelect = document.getElementById("permRouteView");
            if (routeViewSelect && permAllBuses.length > 0) {
                routeViewSelect.innerHTML = `<option value="my">My Bus Route</option>` +
                    permAllBuses.map(b => `<option value="${b.bus_id}">Bus ${b.bus_number} - ${b.route_name || 'Route'}</option>`).join("");
            }

            const currentRouteEl = document.getElementById("permCurrentRoute");
            if (currentRouteEl) {
                const routeName = (window.studentAssignment?.bus_number ? `Bus ${window.studentAssignment.bus_number}` : 'Assigned route');
                const stopNames = (permMyBusStops.length > 0 ? permMyBusStops : (window.routeStops || [])).map(s => s.name).join(" → ");
                currentRouteEl.textContent = `${routeName} route: ${stopNames || 'Active route stops'}`;
            }

            renderPermRegisteredStopOptions();
        } catch (e) {
            console.warn("[PermStop] Error loading routes:", e);
        }
    }

    // Initialize map after modal is visible
    setTimeout(() => {
        window.initPermStopPickerMap();
        if (permStopPickerMap) {
            permStopPickerMap.invalidateSize();
            renderPermStopsOnMap();
        }
    }, 150);
};

window.closePermanentStopModal = function() {
    const modal = document.getElementById("permanentStopModal");
    if (modal) modal.classList.add("hidden");
};

window.submitPermanentStopChange = async function(event) {
    if (event) event.preventDefault();
    const token = typeof getToken === "function" ? getToken() : localStorage.getItem("kambus_token");
    if (!token) return;

    savePermStopDraft();
    const morningInput = permStopInputFromDraft("morning");
    const eveningInput = permStopInputFromDraft("evening");
    const dateInput = document.getElementById("permEffectiveDate");
    const notesInput = document.getElementById("permReasonNotes");
    const alertEl = document.getElementById("permanentStopAlert");
    const submitBtn = document.getElementById("btnSubmitPermStop");

    const startDate = dateInput?.value;
    const notes = notesInput?.value.trim() || "";

    if (!morningInput && !eveningInput) {
        if (alertEl) {
            alertEl.className = "p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 block border border-rose-200";
            alertEl.textContent = "Please select at least one stop (morning pickup or evening drop-off) and run Step 1: Check Location.";
        }
        return;
    }

    if (!startDate) {
        if (alertEl) {
            alertEl.className = "p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 block border border-rose-200";
            alertEl.textContent = "Please select an effective date.";
        }
        return;
    }

    const candidateBusIds = ["morning", "evening"]
        .filter(dir => permStopInputFromDraft(dir))
        .map(dir => permStopDrafts[dir].candidateBusId)
        .filter(Boolean);
    const uniqueCandidateBusIds = [...new Set(candidateBusIds)];
    if (uniqueCandidateBusIds.length > 1) {
        if (alertEl) {
            alertEl.className = "p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 block border border-rose-200";
            alertEl.textContent = "Both morning and evening stops must be served by the same bus.";
        }
        return;
    }

    let targetBusId = uniqueCandidateBusIds.length ? uniqueCandidateBusIds[0] : null;
    if (!targetBusId && permRouteView && permRouteView !== "my") {
        targetBusId = Number(permRouteView);
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Submitting Request...</span>`;
    }

    try {
        const payload = {
            ...(morningInput ? { morning_location: morningInput } : {}),
            ...(eveningInput ? { evening_location: eveningInput } : {}),
            ...(targetBusId ? { target_bus_id: targetBusId } : {}),
            effective_date: startDate,
            reason: notes || undefined
        };

        const res = await fetch(`${API_BASE}/student/permanent-stop-change`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Unable to submit permanent stop change request.");
        }

        if (alertEl) {
            alertEl.className = "p-3 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 block border border-emerald-200";
            alertEl.textContent = "Request submitted! An administrator will review and confirm your new stop.";
        }

        if (typeof featureNotify === "function") {
            featureNotify("ok", "Request Submitted", "Permanent stop change request submitted for admin approval.");
        }

        await window.loadPermanentStopStatus();

        setTimeout(() => {
            window.closePermanentStopModal();
        }, 1800);

    } catch (err) {
        if (alertEl) {
            alertEl.className = "p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 block border border-rose-200";
            alertEl.textContent = err.message || "Failed to submit stop change request.";
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Submit Request</span>`;
        }
    }
};

// ========================================================================
// CAMPUS PARTNER PROMO (ZORDR)
// ========================================================================

// Placeholder URL: MUST be replaced with official Zordr app / download link before shipping
const ZORDR_PROMO_URL = "https://zordr.com";

function openZordrPromo() {
    try {
        window.open(ZORDR_PROMO_URL, "_blank");
    } catch (e) {
        window.location.href = ZORDR_PROMO_URL;
    }
}
window.openZordrPromo = openZordrPromo;


