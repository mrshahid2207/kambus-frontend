// ========================================================================
// KAMBUS - Student Live Tracking & Realtime Dashboard
// ========================================================================

const API_BASE = "https://kambus-backend.onrender.com";
const WS_BASE = API_BASE.replace(/^http/, "ws");

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
const GPS_STALE_AFTER_MS = 90 * 1000;
const ARRIVAL_DISTANCE_METRES = 80;
const PASSED_DISTANCE_METRES = 140;
const FALLBACK_SPEED_KMH = 15;

// ========================================================================
// JWT TOKEN
// ========================================================================

function getToken() {
    return localStorage.getItem("kambus_token");
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
            attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors"
        }).addTo(map);

        tileLayer.on("tileerror", function (error) {
            console.error("[ERROR] Leaflet tile loading error:", error);
        });

        routeStopsGroup = L.layerGroup().addTo(map);

        routePolylineLayer = L.geoJSON(null, {
            style: { color: "#4A6F79", weight: 5, opacity: 0.85 }
        }).addTo(map);

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
        temporaryMyBusStops = Array.isArray(data.map_stops) ? data.map_stops : routeStops;
        routeStopsBusId = data.bus_id ?? null;
        renderRouteStops();
        fetchAndDrawStudentRoute(true);
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

        const waypoints = [
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

        if (routePolylineLayer) {
            routePolylineLayer.clearLayers();
            routePolylineLayer.addData(geoJsonRoute);
        }
    } catch (error) {
        console.warn("Student road routing notice:", error.message);
    } finally {
        isStudentRouteFetchInFlight = false;
        if (version !== studentAssignmentVersion) fetchAndDrawStudentRoute(true);
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

    const customIcon = L.divIcon({
        className: "",
        html: `
            <div style="
                width: 32px; height: 32px;
                border-radius: 4px;
                ${bgStyle}
                color: #ffffff;
                display: flex; align-items: center; justify-content: center;
            ">
                <svg style="width:16px;height:16px;color:#ffffff;" aria-hidden="true"><use href="icons.svg#icon-map-pin"/></svg>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    const dateRangeInfo = isTemp && assignedStop.temporary_start_date
        ? `<br><small style="color:#4A6F79;font-weight:bold;">${assignedStop.temporary_start_date} → ${assignedStop.temporary_end_date}</small>`
        : "";

    stopMarker = L.marker([assignedStop.latitude, assignedStop.longitude], {
        icon: customIcon,
        zIndexOffset: 500
    })
        .addTo(map)
        .bindPopup(`<strong>${titleText}</strong><br>${assignedStop.name}${dateRangeInfo}`);

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
            data.latitude === undefined
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
            wait_minutes: data.wait_minutes ?? null
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

async function loadStudentBus() {
    const request = ++studentAssignmentRequest;
    const token = getToken();
    if (!token) {
        setEtaBanner("Location unavailable", "ETA unavailable");
        return false;
    }

    try {
        const response = await fetch(`${API_BASE}/student/my-bus`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();
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
                bus_id: data.bus_id
            };
            busData = initialLocation;
            updateBusOnMap(initialLocation);
            updateEtaBanner(initialLocation);
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

        assignedStop = {
            stop_id: stopData.stop_id,
            name: stopData.stop_name,
            latitude: Number(stopData.latitude),
            longitude: Number(stopData.longitude),
            stop_order: stopData.stop_order,
            is_temporary: stopData.is_temporary === true,
            is_custom_point: stopData.is_custom_point === true,
            temporary_start_date: stopData.temporary_start_date || null,
            temporary_end_date: stopData.temporary_end_date || null
        };

        const assignment = studentAssignment || {};
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
            ? `${assignment.route_name || 'Route ' + stopData.route_id} • ${assignedStop.temporary_start_date} → ${assignedStop.temporary_end_date}`
            : (assignment.route_name || `Route ${stopData.route_id}`);

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

        updateStopMarker();
        return true;
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
    if (description && typeof description === "string" && description.trim() && description.trim().toLowerCase() !== "other") {
        return description.trim();
    }

    if (message && typeof message === "string") {
        const match = message.match(/(?:bus driver|problem with your driver):\s*([^.]+)/i);
        if (match && match[1]) {
            const extracted = match[1].trim();
            if (extracted && extracted.toLowerCase() !== "other" && extracted.toLowerCase() !== "other issue") {
                return extracted;
            }
        }
    }

    const labels = {
        "driver_not_on_time": "Driver was not on time",
        "over_speeding_rash_driving": "Over speeding / Rash driving",
        "improper_behaviour": "Improper behaviour",
        "foul_language": "Foul language",
        "other": "Other issue"
    };

    return labels[reason] || description || reason || "Other issue";
}

function showDriverComplaintAlert(pollData) {
    if (!pollData || !pollData.complaintId) return;

    if (activeDriverComplaintPoll && activeDriverComplaintPoll.complaintId === pollData.complaintId) {
        return;
    }

    if (pollData.notificationId && processedNotificationIds.has(pollData.notificationId)) {
        return;
    }

    activeDriverComplaintPoll = {
        notificationId: pollData.notificationId,
        complaintId: Number(pollData.complaintId),
        reason: pollData.reason || "other",
        description: pollData.description || null,
        message: pollData.message || null,
        busId: pollData.busId
    };

    const displayText = formatComplaintReason(pollData.reason, pollData.description, pollData.message);

    const reasonElement = document.getElementById("complaintReason");
    if (reasonElement) {
        reasonElement.textContent = displayText;
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
                if (data.type === "alternative_bus_allotted") {
                    clearStudentAssignmentTracking();
                    loadStudentBus();
                    window.KambusNotificationCenter?.refresh();
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

                // 4. WAIT REQUEST ACCEPTED / REJECTED / SKIPPED
                if (data.type === "wait_accepted" || data.type === "wait_rejected") {
                    if (typeof KambusNotify !== "undefined") {
                        KambusNotify.notify({
                            type: data.type === "wait_accepted" ? "success" : "warning",
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
                    const complaintId = payload.complaint_id || data.complaint_id;

                    if (complaintId) {
                        showDriverComplaintAlert({
                            notificationId: data.id,
                            complaintId: complaintId,
                            reason: payload.reason || data.reason || "other",
                            description: payload.description || data.description || null,
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

            const complaintId = payload.complaint_id || pollNotification.complaint_id || pollNotification.reference_id;
            if (complaintId) {
                showDriverComplaintAlert({
                    notificationId: pollNotification.id,
                    complaintId: complaintId,
                    reason: payload.reason || pollNotification.reason || "other",
                    description: payload.description || pollNotification.description || null,
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

function openDriverComplaintModal() {
    const modal = document.getElementById("driverComplaintModal");
    if (!modal) return;

    resetDriverComplaintModal();
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

    const optionsView = document.getElementById("driverComplaintOptionsView");
    const otherView = document.getElementById("driverComplaintOtherView");

    if (optionsView) optionsView.classList.remove("hidden");
    if (otherView) otherView.classList.add("hidden");

    const textarea = document.getElementById("driverComplaintOtherText");
    if (textarea) textarea.value = "";

    const errorElement = document.getElementById("driverComplaintOtherError");
    if (errorElement) errorElement.classList.add("hidden");

    const submitBtn = document.getElementById("driverComplaintOtherSubmitBtn");
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Complaint";
    }

    const optionButtons = document.querySelectorAll(".driverComplaintOptionBtn");
    optionButtons.forEach(btn => {
        btn.disabled = false;
    });
}

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
// MAP-BASED TEMPORARY STOP PICKER
// ========================================================================

/** State for the picker map and selected point */
let tempStopPickerMap = null;
let pickupMarker = null; // Selection layer: never cleared by route/direction rendering.
let temporaryArrowLayer = null;
let temporaryRenderedPaths = [];
let temporaryHeadingUp = true;
let temporaryBusMarker = null;
let tempStopPickerLat = null;
let tempStopPickerLng = null;
let tempStopPickerAddress = null;
let tempStopRouteStopMarkers = [];
let tempStopPickerRoutePolyline = null;
let tempStopPickerExplorerRoutes = null;
let temporaryRouteRenderVersion = 0;
let temporaryAllBusRoutes = null;
let temporaryMyBusStops = null;
let temporaryRouteSelection = null;
let temporaryRouteView = "my";
let temporaryStopInputMode = "pin";
let temporaryStopRouteCheck = null;
let temporarySelectedCandidateBusId = null;
let temporaryStopDirection = "morning";
const temporaryStopDrafts = {
    morning: { mode: "pin", latitude: null, longitude: null, address: null, stopId: null, routeCheck: null, candidateBusId: null },
    evening: { mode: "pin", latitude: null, longitude: null, address: null, stopId: null, routeCheck: null, candidateBusId: null }
};

function temporaryDirectionColor() {
    return temporaryStopDirection === "evening" ? "#dc2626" : "#16a34a";
}

function hasTemporaryCoordinates(latitude, longitude) {
    return latitude != null && longitude != null && String(latitude).trim() !== "" && String(longitude).trim() !== "" &&
        Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) &&
        Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
}

function temporarySelectedBusStops() {
    if (temporaryRouteView === "my" || temporaryRouteView === "all") return temporaryMyBusStops || routeStops;
    const bus = temporaryAllBusRoutes?.find(bus => Number(bus.bus_id) === Number(temporaryRouteView));
    return bus?.map_stops || bus?.stops || [];
}

const BUS_MAP_COLORS = [
    "#173541", "#D97706", "#15803D", "#7C3AED",
    "#E11D48", "#0F766E", "#4338CA", "#A16207"
];

function getBusMapColor(busId) {
    const numericBusId = Number(busId);
    if (Number.isInteger(numericBusId) && numericBusId > 0 && numericBusId <= BUS_MAP_COLORS.length) {
        return BUS_MAP_COLORS[numericBusId - 1];
    }

    const source = String(busId ?? "default");
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
        hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
    }
    return `hsl(${Math.abs(hash) % 360} 62% 38%)`;
}

function getTemporaryStopPickerRouteStops(stops = routeStops) {
    return [...stops].filter(stop => !stop.directions || stop.directions.includes(temporaryStopDirection)).sort((a, b) => Number(a.stop_order || 0) - Number(b.stop_order || 0))
        .map(stop => {
            const evening = temporaryStopDirection === "evening";
            return {
                ...stop,
                latitude: evening ? (stop.evening_latitude ?? stop.morning_latitude ?? stop.latitude) : (stop.morning_latitude !== undefined ? stop.morning_latitude : stop.latitude),
                longitude: evening ? (stop.evening_longitude ?? stop.morning_longitude ?? stop.longitude) : (stop.morning_longitude !== undefined ? stop.morning_longitude : stop.longitude)
            };
        }).filter(stop => hasTemporaryCoordinates(stop.latitude, stop.longitude));
}

function getTemporaryRouteWaypoints(stops) {
    const waypoints = [...stops.filter(stop =>
        Math.abs(Number(stop.latitude) - COLLEGE_LOCATION.latitude) >= 0.0001 ||
        Math.abs(Number(stop.longitude) - COLLEGE_LOCATION.longitude) >= 0.0001), COLLEGE_LOCATION];
    return temporaryStopDirection === "evening" ? waypoints.reverse() : waypoints;
}

// Bearings and offsets are display-only; API stops and submitted coordinates stay intact.
function temporarySegmentBearing(a, b) {
    const rad = Math.PI / 180;
    const delta = (b[1] - a[1]) * rad;
    return Math.atan2(Math.sin(delta) * Math.cos(b[0] * rad),
        Math.cos(a[0] * rad) * Math.sin(b[0] * rad) -
        Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos(delta)) / rad;
}

function offsetTemporaryEveningPath(points, metres = 6) {
    return points.map((point, index) => {
        const next = points.slice(index + 1).find(p => p[0] !== point[0] || p[1] !== point[1]);
        const previous = points.slice(0, index).reverse().find(p => p[0] !== point[0] || p[1] !== point[1]);
        if (!next && !previous) return [...point];
        const angle = (temporarySegmentBearing(next ? point : previous, next || point) + 90) * Math.PI / 180;
        const distance = metres / 6371000;
        const lat = point[0] * Math.PI / 180;
        const shiftedLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(angle));
        const shiftedLng = point[1] * Math.PI / 180 + Math.atan2(Math.sin(angle) * Math.sin(distance) * Math.cos(lat),
            Math.cos(distance) - Math.sin(lat) * Math.sin(shiftedLat));
        return [shiftedLat * 180 / Math.PI, shiftedLng * 180 / Math.PI];
    });
}

function renderTemporaryRouteArrows() {
    if (!temporaryArrowLayer || !tempStopPickerMap) return;
    temporaryArrowLayer.clearLayers();
    const zoom = tempStopPickerMap.getZoom();
    temporaryRenderedPaths.forEach(({ points, color }) => {
        let untilArrow = 45;
        for (let i = 1; i < points.length; i++) {
            const a = tempStopPickerMap.project(points[i - 1], zoom);
            const b = tempStopPickerMap.project(points[i], zoom);
            const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
            if (!length) continue;
            for (; untilArrow <= length; untilArrow += 90) {
                const x = a.x + dx * untilArrow / length, y = a.y + dy * untilArrow / length;
                const ux = dx / length, uy = dy / length;
                const arrow = [[x - ux * 7 - uy * 4, y - uy * 7 + ux * 4], [x, y],
                    [x - ux * 7 + uy * 4, y - uy * 7 - ux * 4]];
                L.polyline(arrow.map(p => tempStopPickerMap.unproject(p, zoom)),
                    { color, weight: 2, opacity: 1, interactive: false }).addTo(temporaryArrowLayer);
            }
            untilArrow -= length;
        }
    });
}

function updateTemporaryMapHeading() {
    if (!tempStopPickerMap) return;
    const selectedBusId = temporaryRouteView === "my" || temporaryRouteView === "all" ? routeStopsBusId : Number(temporaryRouteView);
    const path = temporaryRenderedPaths.find(path => Number(path.busId) === Number(selectedBusId));
    if (!path || path.travelPoints.length < 2) return;
    const live = busData && Number(busData.bus_id) === Number(selectedBusId) &&
        hasTemporaryCoordinates(busData.latitude, busData.longitude) &&
        Date.now() - Date.parse(busData.timestamp) < 90000 ? busData : null;
    const points = path.travelPoints;
    let segment = 0;
    if (live) {
        const p = tempStopPickerMap.project([live.latitude, live.longitude]);
        let nearest = Infinity;
        for (let i = 1; i < points.length; i++) {
            const a = tempStopPickerMap.project(points[i - 1]), b = tempStopPickerMap.project(points[i]);
            const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
            if (!length2) continue;
            const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
            const distance = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
            if (distance < nearest) { nearest = distance; segment = i - 1; }
        }
    }
    const heading = live?.heading != null && Number.isFinite(Number(live.heading)) && Number(live.heading) >= 0
        ? Number(live.heading) : temporarySegmentBearing(points[segment], points[segment + 1]);
    // leaflet-rotate's positive angle rotates the map clockwise; heading-up is its inverse.
    if (temporaryHeadingUp) {
        tempStopPickerMap.setBearing(-heading);
        tempStopPickerMap.panTo(live ? [live.latitude, live.longitude] : points[segment], { animate: false });
    }
    if (live) {
        if (!temporaryBusMarker) temporaryBusMarker = L.marker([live.latitude, live.longitude], { icon: busIcon }).addTo(tempStopPickerMap);
        else temporaryBusMarker.setLatLng([live.latitude, live.longitude]);
    } else if (temporaryBusMarker) {
        tempStopPickerMap.removeLayer(temporaryBusMarker);
        temporaryBusMarker = null;
    }
}

function setTemporaryMapHeading(enabled) {
    temporaryHeadingUp = enabled;
    if (enabled) updateTemporaryMapHeading();
    else if (tempStopPickerMap) tempStopPickerMap.setBearing(0);
}
window.setTemporaryMapHeading = setTemporaryMapHeading;

async function drawTemporaryStopPickerRoute(mapInstance, stops, color, version = temporaryRouteRenderVersion, busId = routeStopsBusId) {
    const direction = temporaryStopDirection;
    if (!stops.length) return;

    const waypoints = getTemporaryRouteWaypoints(stops);
    if (waypoints.length < 2) return;
    const coordString = waypoints
        .map(stop => `${Number(stop.longitude)},${Number(stop.latitude)}`)
        .join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson&steps=false`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`OSRM routing HTTP error ${response.status}`);

        const data = await response.json();
        const coordinates = data.routes?.[0]?.geometry?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) {
            throw new Error("No road route found in OSRM response");
        }
        if (tempStopPickerMap !== mapInstance || version !== temporaryRouteRenderVersion) return;

        const travelPoints = coordinates.map(([longitude, latitude]) => [latitude, longitude]);
        const points = direction === "evening" ? offsetTemporaryEveningPath(travelPoints) : travelPoints;
        temporaryRenderedPaths.push({ points, travelPoints, color, busId });
        tempStopPickerRoutePolyline = L.polyline(
            points,
            { color, weight: 4, opacity: 0.8, lineJoin: "round" }
        ).addTo(tempStopPickerExplorerRoutes || mapInstance);
        renderTemporaryRouteArrows();
        updateTemporaryMapHeading();
    } catch (error) {
        console.warn("Temporary stop picker road routing notice:", error.message);
        // Do not misrepresent straight stop-to-stop segments as a road route.
        if (tempStopPickerMap === mapInstance && version === temporaryRouteRenderVersion) {
            featureNotify("warning", "Road route unavailable", "Unable to load road geometry. Choose the route again to retry.");
        }
    }
}

async function loadTemporaryStopExplorerRoutes() {
    const token = getToken();
    if (!token) return [];
    try {
        const response = await fetch(`${API_BASE}/student/all-bus-routes`, {
            headers: { "Accept": "application/json", "Authorization": `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Unable to load bus routes.");
        temporaryAllBusRoutes = Array.isArray(data.buses) ? data.buses : [];
        temporaryRouteSelection = data.temporary_stop || null;
        const select = document.getElementById("temporaryRouteView");
        if (select) {
            select.innerHTML = `<option value="my">My bus</option><option value="all">All buses</option>${temporaryAllBusRoutes
                .map(bus => `<option value="${Number(bus.bus_id)}">Bus ${escapeTemporaryStopText(bus.bus_number)}</option>`)
                .join("")}`;
            select.value = temporaryRouteView;
        }
        return temporaryAllBusRoutes;
    } catch (error) {
        console.warn("Temporary stop route explorer notice:", error.message);
        return [];
    }
}

function renderTemporaryRouteExplorer() {
    if (!tempStopPickerMap || !tempStopPickerExplorerRoutes) return;
    const version = ++temporaryRouteRenderVersion;
    tempStopPickerExplorerRoutes.clearLayers();
    temporaryArrowLayer?.clearLayers();
    temporaryRenderedPaths = [];
    if (temporaryBusMarker) { tempStopPickerMap.removeLayer(temporaryBusMarker); temporaryBusMarker = null; }
    tempStopPickerRoutePolyline = null;
    tempStopRouteStopMarkers.forEach(marker => tempStopPickerMap.removeLayer(marker));
    tempStopRouteStopMarkers = [];

    const status = document.getElementById("temporaryRouteMapStatus");
    const selection = temporaryStopChange || temporaryRouteSelection;
    const missingDirection = selection && Array.isArray(selection.directions) && !selection.directions.includes(temporaryStopDirection);
    if (status) status.textContent = "";
    if (missingDirection && status) status.textContent = `No ${temporaryStopDirection} stop registered`;

    if (temporaryRouteView === "all") {
        temporaryAllBusRoutes?.forEach(bus => drawTemporaryStopPickerRoute(
            tempStopPickerMap, getTemporaryStopPickerRouteStops(bus.map_stops || bus.stops || []), temporaryDirectionColor(), version, bus.bus_id
        ));
    }

    const specificBus = temporaryRouteView !== "my" && temporaryRouteView !== "all";
    const selectedBusId = specificBus ? Number(temporaryRouteView) : routeStopsBusId;
    const selectedBus = !specificBus
        ? { bus_id: routeStopsBusId, stops: temporaryMyBusStops || routeStops }
        : temporaryAllBusRoutes?.find(bus => Number(bus.bus_id) === selectedBusId);
    if (!selectedBus) return;
    const stops = getTemporaryStopPickerRouteStops(selectedBus.map_stops || selectedBus.stops || []);
    const selectedLatitude = selection?.[`${temporaryStopDirection}_temporary_latitude`];
    const selectedLongitude = selection?.[`${temporaryStopDirection}_temporary_longitude`];
    if (!specificBus && hasTemporaryCoordinates(selectedLatitude, selectedLongitude) &&
        !stops.some(stop => Number(stop.latitude) === Number(selectedLatitude) && Number(stop.longitude) === Number(selectedLongitude))) {
        stops.push({ latitude: selectedLatitude, longitude: selectedLongitude, name: selection[`${temporaryStopDirection}_temporary_stop_name`], affected_directions: [temporaryStopDirection] });
    }
    const color = temporaryDirectionColor();
    if (!stops.length && status) status.textContent = `No ${temporaryStopDirection} stops registered for this bus`;
    if (temporaryRouteView !== "all") {
        drawTemporaryStopPickerRoute(tempStopPickerMap, stops, color, version, selectedBusId);
    }
    const markerStops = stops;
    markerStops.forEach(stop => {
        const color = stop.affected_directions?.includes(temporaryStopDirection) ? "#f97316" : "#2563eb";
        const marker = L.circleMarker([Number(stop.latitude), Number(stop.longitude)], {
            radius: 7, color, fillColor: color, fillOpacity: 0.8, weight: 2
        }).addTo(tempStopPickerMap);
        marker.bindPopup(`<div class="text-xs font-semibold">${escapeTemporaryStopText(stop.name)}</div>`);
        tempStopRouteStopMarkers.push(marker);
    });

}

function setTemporaryRouteView(value) {
    temporaryRouteView = value;
    renderTemporaryCurrentRoute();
    renderTemporaryRouteExplorer();
}
window.setTemporaryRouteView = setTemporaryRouteView;

function escapeTemporaryStopText(value) {
    const element = document.createElement("span");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function saveTemporaryStopDraft() {
    const draft = temporaryStopDrafts[temporaryStopDirection];
    draft.mode = temporaryStopInputMode;
    if (draft.mode === "pin") {
        const latitude = document.getElementById("temporaryPinLatitude")?.value;
        const longitude = document.getElementById("temporaryPinLongitude")?.value;
        tempStopPickerLat = hasTemporaryCoordinates(latitude, longitude) ? Number(latitude) : null;
        tempStopPickerLng = hasTemporaryCoordinates(latitude, longitude) ? Number(longitude) : null;
    }
    draft.latitude = tempStopPickerLat;
    draft.longitude = tempStopPickerLng;
    draft.address = tempStopPickerAddress;
    draft.stopId = Number(document.getElementById("temporaryRegisteredStop")?.value) || null;
    draft.routeCheck = temporaryStopRouteCheck;
    draft.candidateBusId = temporarySelectedCandidateBusId;
}

function temporaryStopInputFromDraft(direction) {
    const draft = temporaryStopDrafts[direction];
    if (draft.mode === "registered" && draft.stopId) return { stop_id: draft.stopId };
    if (draft.mode === "pin" && hasTemporaryCoordinates(draft.latitude, draft.longitude)) {
        return { latitude: Number(draft.latitude), longitude: Number(draft.longitude), address: draft.address || null };
    }
    return null;
}

function renderTemporaryDirectionSummary() {
    ["morning", "evening"].forEach(direction => {
        const summary = document.getElementById(`temporary${direction[0].toUpperCase()}${direction.slice(1)}Summary`);
        const draft = temporaryStopDrafts[direction];
        if (!summary) return;
        if (draft.mode === "registered" && draft.stopId) {
            const stop = [...routeStops, ...(temporaryAllBusRoutes || []).flatMap(bus => bus.stops || [])].find(item => Number(item.stop_id) === Number(draft.stopId));
            summary.textContent = stop?.name || "Registered stop selected";
        } else if (hasTemporaryCoordinates(draft.latitude, draft.longitude)) {
            summary.textContent = draft.address || "Map pin selected";
        } else {
            summary.textContent = "Not selected";
        }
    });
}

function setTemporaryStopDirection(direction) {
    if (!["morning", "evening"].includes(direction) || direction === temporaryStopDirection) return;
    saveTemporaryStopDraft();
    temporaryStopDirection = direction;
    const draft = temporaryStopDrafts[direction];
    temporaryStopInputMode = draft.mode;
    tempStopPickerLat = draft.latitude;
    tempStopPickerLng = draft.longitude;
    tempStopPickerAddress = draft.address;
    const savedRouteCheck = draft.routeCheck;
    const savedCandidateBusId = draft.candidateBusId;
    const select = document.getElementById("temporaryRegisteredStop");
    if (select) select.value = draft.stopId || "";
    document.getElementById("temporaryMorningDirectionBtn")?.classList.toggle("is-active", direction === "morning");
    document.getElementById("temporaryEveningDirectionBtn")?.classList.toggle("is-active", direction === "evening");
    setTemporaryStopInputMode(temporaryStopInputMode, false);
    // Mode rendering clears the active validation UI; retain this direction's
    // completed route check so switching sections does not invalidate it.
    temporaryStopRouteCheck = savedRouteCheck;
    temporarySelectedCandidateBusId = savedCandidateBusId;
    draft.routeCheck = savedRouteCheck;
    draft.candidateBusId = savedCandidateBusId;
    const result = document.getElementById("temporaryRouteCheckResult");
    const candidates = document.getElementById("temporaryCandidateBuses");
    if (result) {
        result.className = savedRouteCheck ? "kx-notice" : "hidden";
        result.textContent = savedRouteCheck?.message || "";
    }
    if (candidates) candidates.innerHTML = "";
    if (savedRouteCheck && !savedRouteCheck.on_route) {
        renderTemporaryStopCandidates(savedRouteCheck.candidate_buses || []);
        temporarySelectedCandidateBusId = savedCandidateBusId;
        draft.candidateBusId = savedCandidateBusId;
        candidates?.querySelectorAll("input[name='temporaryCandidateBus']").forEach(input => {
            input.checked = Number(input.value) === Number(savedCandidateBusId);
        });
    }
    renderTemporaryDirectionSummary();
    const latitudeInput = document.getElementById("temporaryPinLatitude");
    const longitudeInput = document.getElementById("temporaryPinLongitude");
    if (latitudeInput) latitudeInput.value = draft.latitude ?? "";
    if (longitudeInput) longitudeInput.value = draft.longitude ?? "";
    renderTemporaryCurrentRoute();
    renderTemporaryRouteExplorer();
    updateTemporaryStopSubmitState();
}
window.setTemporaryStopDirection = setTemporaryStopDirection;

function resetTemporaryStopRouteCheck() {
    temporaryStopRouteCheck = null;
    temporarySelectedCandidateBusId = null;
    temporaryStopDrafts[temporaryStopDirection].routeCheck = null;
    temporaryStopDrafts[temporaryStopDirection].candidateBusId = null;

    const result = document.getElementById("temporaryRouteCheckResult");
    const candidates = document.getElementById("temporaryCandidateBuses");
    const submit = document.getElementById("confirmTemporaryStopBtn");

    if (result) {
        result.className = "hidden";
        result.innerHTML = "";
    }
    if (candidates) candidates.innerHTML = "";
    if (submit) {
        submit.disabled = true;
        submit.classList.add("opacity-50", "cursor-not-allowed");
        submit.innerHTML = `<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-lock"/></svg><span>Step 2: Complete Step 1 First</span>`;
    }
}

function updateTemporaryStopSubmitState() {
    const directions = ["morning", "evening"].filter(direction => temporaryStopInputFromDraft(direction));
    const ready = directions.length > 0 && directions.every(direction => {
        const draft = temporaryStopDrafts[direction];
        return draft.routeCheck && (draft.routeCheck.on_route || draft.candidateBusId);
    });
    const submit = document.getElementById("confirmTemporaryStopBtn");
    if (!submit) return;
    if (ready) enableTemporaryStopSubmit("Confirm Stop Change");
    else {
        submit.disabled = true;
        submit.classList.add("opacity-50", "cursor-not-allowed");
    }
}

function clearTemporaryStopDirection() {
    temporaryStopDrafts[temporaryStopDirection] = { mode: "pin", latitude: null, longitude: null, address: null, stopId: null, routeCheck: null, candidateBusId: null };
    tempStopPickerLat = tempStopPickerLng = tempStopPickerAddress = null;
    ["temporaryPinLatitude", "temporaryPinLongitude", "temporaryRegisteredStop"].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = "";
    });
    setTemporaryStopInputMode("pin");
    renderTemporaryDirectionSummary();
    renderTemporaryRouteExplorer();
    updateTemporaryStopSubmitState();
}
window.clearTemporaryStopDirection = clearTemporaryStopDirection;

function setTemporaryStopInputMode(mode, reset = true) {
    temporaryStopInputMode = mode;
    temporaryStopDrafts[temporaryStopDirection].mode = mode;
    const registeredFields = document.getElementById("temporaryRegisteredStopFields");
    const pinCoordinates = document.getElementById("temporaryPinCoordinates");
    const checkPinButton = document.getElementById("checkTemporaryPinBtn");
    const registeredButton = document.getElementById("temporaryRegisteredModeBtn");
    const pinButton = document.getElementById("temporaryPinModeBtn");

    registeredFields?.classList.toggle("hidden", mode !== "registered");
    pinCoordinates?.classList.toggle("hidden", mode !== "pin");
    checkPinButton?.classList.toggle("hidden", mode !== "pin");
    document.getElementById("manualCoordinatesDetails")?.classList.toggle("hidden", mode !== "pin");
    if (registeredButton) registeredButton.className = mode === "registered" ? "kx-seg-btn is-active" : "kx-seg-btn";
    if (pinButton) pinButton.className = mode === "pin" ? "kx-seg-btn is-active" : "kx-seg-btn";
    if (reset) resetTemporaryStopRouteCheck();
}
window.setTemporaryStopInputMode = setTemporaryStopInputMode;

function getTemporaryStopRequestInput() {
    if (temporaryStopInputMode === "registered") {
        const stopId = Number(document.getElementById("temporaryRegisteredStop")?.value);
        return Number.isInteger(stopId) && stopId > 0 ? { stop_id: stopId } : null;
    }

    const latitude = document.getElementById("temporaryPinLatitude")?.value;
    const longitude = document.getElementById("temporaryPinLongitude")?.value;
    return hasTemporaryCoordinates(latitude, longitude) ? { latitude: Number(latitude), longitude: Number(longitude) } : null;
}

function renderTemporaryCurrentRoute() {
    const routeBox = document.getElementById("temporaryCurrentRoute");
    const select = document.getElementById("temporaryRegisteredStop");
    if (!routeBox || !select) return;

    const selectedBus = temporaryAllBusRoutes?.find(bus => Number(bus.bus_id) === Number(temporaryRouteView));
    const busName = selectedBus?.bus_number || regularStudentAssignment?.bus_number || studentAssignment?.bus_number || "Your bus";
    const sortedStops = getTemporaryStopPickerRouteStops(temporarySelectedBusStops());
    routeBox.textContent = `${busName} normal route: ${sortedStops.map(stop => stop.name).join(" → ") || "No stops configured"}`;
    select.innerHTML = `<option value="">Select a registered stop</option>${sortedStops.map(stop =>
        `<option value="${Number(stop.stop_id)}">${escapeTemporaryStopText(stop.stop_order)}. ${escapeTemporaryStopText(stop.name)}</option>`
    ).join("")}`;
    select.value = temporaryStopDrafts[temporaryStopDirection].stopId || "";
}

// -- All Bus Routes Reference Panel (read-only, lazy-loaded) -----------
let allBusRoutesPanelLoaded = false;

async function loadAllBusRoutesPanel() {
    if (allBusRoutesPanelLoaded) return;

    const container = document.getElementById("allBusRoutesContent");
    if (!container) return;

    const token = getToken();
    if (!token) {
        container.innerHTML = `<div class="text-danger font-semibold">Session expired — please log in again.</div>`;
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/student/all-bus-routes`, {
            method: "GET",
            headers: { "Accept": "application/json", "Authorization": `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Unable to load bus routes.");

        const buses = data.buses || [];
        if (!buses.length) {
            container.innerHTML = `<div class="text-slate-400 italic">No bus routes configured.</div>`;
            allBusRoutesPanelLoaded = true;
            return;
        }

        container.innerHTML = buses.map(bus => {
            const stopNames = (bus.stops || [])
                .sort((a, b) => (a.stop_order || 0) - (b.stop_order || 0))
                .map(s => escapeTemporaryStopText(s.name));
            return `<div class="rounded border border-line bg-surface p-2">
                <div class="font-bold text-navy text-[11px]">Bus ${escapeTemporaryStopText(bus.bus_number)}
                    <span class="font-semibold text-ink-muted">· ${escapeTemporaryStopText(bus.route_name || "No route")}</span>
                </div>
                <div class="text-[10px] text-ink-muted mt-0.5 leading-relaxed">${stopNames.join(" -> ") || "No stops"}</div>
            </div>`;
        }).join("");

        allBusRoutesPanelLoaded = true;
    } catch (error) {
        console.error("[ERROR] Failed to load all bus routes:", error);
        container.innerHTML = `<div class="text-danger font-semibold">${escapeTemporaryStopText(error.message)}</div>`;
    }
}
window.loadAllBusRoutesPanel = loadAllBusRoutesPanel;

function enableTemporaryStopSubmit(label) {
    const submit = document.getElementById("confirmTemporaryStopBtn");
    if (!submit) return;
    submit.disabled = false;
    submit.classList.remove("opacity-50", "cursor-not-allowed");
    submit.innerHTML = `<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-check"/></svg><span>${escapeTemporaryStopText(label)}</span>`;
}

function renderTemporaryStopCandidates(candidates) {
    const container = document.getElementById("temporaryCandidateBuses");
    if (!container) return;

    if (!candidates.length) {
        // No bus currently passes through this location — make this clear
        // instead of leaving the Confirm button silently disabled.
        container.innerHTML = `<div class="kx-notice kx-notice--row kx-notice--danger"><svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-xmark"/></svg><span>No bus is currently available for this location. You cannot submit a temporary stop change here.</span></div>`;
        return;
    }

    temporarySelectedCandidateBusId = Number(candidates[0].bus_id);
    temporaryStopDrafts[temporaryStopDirection].candidateBusId = temporarySelectedCandidateBusId;
    container.innerHTML = candidates.map(candidate => {
        const eta = Number.isFinite(Number(candidate.eta_minutes)) ? `ETA ~${candidate.eta_minutes} min` : "Live ETA unavailable";
        const occupancy = candidate.capacity == null ? `Occupancy: ${candidate.occupancy ?? "unavailable"}` : `Occupancy: ${candidate.occupancy ?? "—"}/${candidate.capacity}`;
        const approximate = candidate.is_approximate_match ? `<span class="kx-muted">${escapeTemporaryStopText(candidate.match_description)}</span>` : "";
        return `<label class="kx-bus-option">
            <input type="radio" name="temporaryCandidateBus" value="${Number(candidate.bus_id)}" ${candidate.is_recommended ? "checked" : ""}>
            <span class="kx-bus-body">
                <span class="kx-bus-title">${escapeTemporaryStopText(candidate.bus_number)}${candidate.is_own_bus ? "<span class=\"kx-tag kx-tag--ok\">• Your Assigned Bus</span>" : ""}${candidate.is_recommended ? "<span class=\"kx-tag kx-tag--brand\">• Recommended</span>" : ""}</span>
                <span>${escapeTemporaryStopText(candidate.route_name)} · ${escapeTemporaryStopText(candidate.driver_name)} (${escapeTemporaryStopText(candidate.driver_phone)})</span>
                <span>${eta} · ${occupancy}</span>
                ${approximate}
            </span>
        </label>`;
    }).join("");
    container.querySelectorAll("input[name='temporaryCandidateBus']").forEach(input => {
        input.addEventListener("change", event => {
            temporarySelectedCandidateBusId = Number(event.target.value);
            temporaryStopDrafts[temporaryStopDirection].candidateBusId = temporarySelectedCandidateBusId;
        });
    });
    enableTemporaryStopSubmit("Confirm Stop Change");
}

async function checkTemporaryStopRoute() {
    const token = getToken();
    const input = getTemporaryStopRequestInput();
    if (!token) return featureNotify("warning", "Session expired", "Please login again.");
    if (!input) return featureNotify("warning", "Choose a stop", "Select a registered stop or provide valid map coordinates.");

    saveTemporaryStopDraft();
    const direction = temporaryStopDirection;
    const draft = temporaryStopDrafts[direction];
    resetTemporaryStopRouteCheck();
    try {
        const response = await fetch(`${API_BASE}/student/temporary-stop-change/check-route`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ ...input, trip_type: direction })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Unable to check this route.");

        if (direction !== temporaryStopDirection || draft !== temporaryStopDrafts[direction] ||
            JSON.stringify(input) !== JSON.stringify(getTemporaryStopRequestInput())) return;
        temporaryStopRouteCheck = data;
        temporaryStopDrafts[temporaryStopDirection].routeCheck = data;
        const result = document.getElementById("temporaryRouteCheckResult");
        if (result) {
            result.classList.remove("hidden");
            if (data.on_route) {
                result.className = "kx-notice kx-notice--row kx-notice--ok";
                result.innerHTML = `<svg class="w-4 h-4 shrink-0 text-ok" aria-hidden="true"><use href="icons.svg#icon-check"/></svg><span>${escapeTemporaryStopText(data.message || "Selected stop is on your assigned bus route")}</span>`;
            } else {
                result.className = "kx-notice kx-notice--row kx-notice--danger";
                result.innerHTML = `<svg class="w-4 h-4 shrink-0 text-danger" aria-hidden="true"><use href="icons.svg#icon-xmark"/></svg><span>${escapeTemporaryStopText(data.message || "Selected stop is not on your assigned bus route")}</span>`;
            }
        }
        if (data.on_route) enableTemporaryStopSubmit("Confirm Stop");
        else renderTemporaryStopCandidates(data.candidate_buses || []);
        updateTemporaryStopSubmitState();
    } catch (error) {
        console.error("[ERROR] Temporary stop route check failed:", error);
        featureNotify("error", "Route check failed", error.message || "Please try again.");
    }
}
window.checkTemporaryStopRoute = checkTemporaryStopRoute;

function initTempStopPickerMap() {
    const container = document.getElementById("tempStopPickerMap");
    if (!container) return;

    // Determine starting centre: use assignedStop → routeStops[0] → college
    let centre = [18.054145, 79.535587];
    if (assignedStop?.latitude && assignedStop?.longitude) {
        centre = [assignedStop.latitude, assignedStop.longitude];
    } else if (routeStops?.length > 0 && routeStops[0].latitude) {
        centre = [routeStops[0].latitude, routeStops[0].longitude];
    }

    // Reuse the map and tiles; only route and marker layers change.
    if (tempStopPickerMap) {
        tempStopPickerMap.invalidateSize({ animate: false, pan: false });
        renderTemporaryRouteExplorer();
        return;
    }

    // Must invalidate after modal becomes visible
    setTimeout(() => {
        if (tempStopPickerMap) return;
        tempStopPickerMap = L.map("tempStopPickerMap", {
            zoomControl: true,
            attributionControl: false,
            rotate: true,
            rotateControl: false,
            touchRotate: false,
            compassBearing: false
        }).setView(centre, 16);
        const pickerMap = tempStopPickerMap;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19
        }).addTo(tempStopPickerMap);

        tempStopPickerExplorerRoutes = L.layerGroup().addTo(tempStopPickerMap);
        temporaryArrowLayer = L.layerGroup().addTo(tempStopPickerMap);
        tempStopPickerMap.on("zoomend", renderTemporaryRouteArrows);

        // Explorer routes are separate from pins and stop markers. The default
        // view is the student's bus, rendered as OSRM road geometry.
        renderTemporaryRouteExplorer();

        // Allow user to click the map to place / move the draggable pin
        tempStopPickerMap.on("click", (e) => {
            if (temporaryStopInputMode === "pin") placeTempStopMarker(e.latlng.lat, e.latlng.lng);
        });

        // The modal body is a flex scroll container. Wait for its final layout
        // and then invalidate again so Leaflet measures the resized map.
        tempStopPickerMap.invalidateSize();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (tempStopPickerMap === pickerMap) {
                    pickerMap.invalidateSize({ animate: false, pan: false });
                }
            });
        });
        setTimeout(() => {
            if (tempStopPickerMap === pickerMap) pickerMap.invalidateSize({ animate: false, pan: false });
        }, 320);
    }, 120);
}

function selectTemporaryPickup() {
    if (temporaryStopInputMode === "registered") {
        const id = Number(document.getElementById("temporaryRegisteredStop")?.value);
        const stop = getTemporaryStopPickerRouteStops(temporarySelectedBusStops()).find(stop => Number(stop.stop_id) === id);
        if (stop) placeTempStopMarker(Number(stop.latitude), Number(stop.longitude), stop.name);
    } else {
        const input = getTemporaryStopRequestInput();
        if (input) placeTempStopMarker(input.latitude, input.longitude, "Selected coordinates");
    }
}

function placeTempStopMarker(lat, lng, addressHint, restore = false) {
    if (!tempStopPickerMap) return;

    const direction = temporaryStopDirection;
    const draft = temporaryStopDrafts[direction];
    if (!restore) {
        tempStopPickerLat = lat;
        tempStopPickerLng = lng;
        draft.latitude = lat;
        draft.longitude = lng;
        const latitudeInput = document.getElementById("temporaryPinLatitude");
        const longitudeInput = document.getElementById("temporaryPinLongitude");
        if (latitudeInput) latitudeInput.value = Number(lat).toFixed(6);
        if (longitudeInput) longitudeInput.value = Number(lng).toFixed(6);
        resetTemporaryStopRouteCheck();
    }

    if (!pickupMarker) {
        const icon = L.divIcon({
            className: "",
            html: `<div style="width:28px;height:28px;background:#16a34a;border:2px solid #FFFFFF;border-radius:50% 50% 50% 0;transform:rotate(-45deg);"></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 28]
        });
        pickupMarker = L.marker([lat, lng], { draggable: true, icon }).addTo(tempStopPickerMap);
        pickupMarker.on("dragend", (e) => {
            const pos = e.target.getLatLng();
            placeTempStopMarker(pos.lat, pos.lng);
        });
    } else {
        pickupMarker.setLatLng([lat, lng]);
    }

    // Update label
    const labelBox = document.getElementById("tempStopPickerLabel");
    const addrEl = document.getElementById("tempStopPickerAddress");
    if (labelBox) labelBox.classList.remove("hidden");

    if (addressHint) {
        if (!restore) {
            tempStopPickerAddress = addressHint;
            draft.address = addressHint;
        }
        if (addrEl) addrEl.textContent = addressHint;
        renderTemporaryDirectionSummary();
    } else {
        if (addrEl) addrEl.textContent = "Selected Map Location (resolving address…)";
        // Best-effort reverse geocode via Nominatim
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
            headers: { "User-Agent": "KAMBUS-App/1.0" }
        })
            .then(r => r.json())
            .catch(() => null)
            .then(data => {
                if (draft !== temporaryStopDrafts[direction] || draft.latitude !== lat || draft.longitude !== lng) return;
                const name = data?.display_name
                    ? data.display_name.split(",").slice(0, 3).join(", ")
                    : "Selected Map Location";
                draft.address = name;
                if (temporaryStopDirection === direction) {
                    tempStopPickerAddress = name;
                    if (addrEl) addrEl.textContent = name;
                }
                renderTemporaryDirectionSummary();
            });
    }
}

async function openTemporaryStopModal() {
    const modal = document.getElementById("temporaryStopModal");
    if (!modal) return;

    if (!assignedStop) {
        featureNotify("warning", "Stop unavailable", "Your current stop has not loaded yet.");
        return;
    }

    const startInput = document.getElementById("temporaryStartDate");
    const endInput = document.getElementById("temporaryEndDate");
    const today = formatDateForInput(new Date());

    if (startInput) {
        startInput.min = today;
        if (!startInput.value) startInput.value = today;
    }
    if (endInput) {
        endInput.min = startInput?.value || today;
        if (!endInput.value) endInput.value = startInput?.value || today;
    }

    renderTemporaryStopStatus();
    modal.classList.remove("hidden");

    await Promise.all([loadRouteStops(), loadTemporaryStopExplorerRoutes()]);
    renderTemporaryCurrentRoute();
    setTemporaryStopInputMode(temporaryStopInputMode, false);
    renderTemporaryDirectionSummary();
    updateTemporaryStopSubmitState();

    // Initialize or reinitialize the map picker AFTER the modal is visible
    initTempStopPickerMap();
}
window.openTemporaryStopModal = openTemporaryStopModal;

function closeTemporaryStopModal() {
    document.getElementById("temporaryStopModal")?.classList.add("hidden");
}
window.closeTemporaryStopModal = closeTemporaryStopModal;

function renderTemporaryStopStatus() {
    const statusBox = document.getElementById("temporaryStopStatus");
    const cancelBtn = document.getElementById("cancelTemporaryStopBtn");
    const tempBtnText = document.querySelector("#btnTemporaryStop span");

    if (temporaryStopChange?.active) {
        if (cancelBtn) cancelBtn.classList.remove("hidden");
        if (tempBtnText) tempBtnText.textContent = "Temporary Stop (Active)";

        if (statusBox) {
            statusBox.className = "kx-notice kx-notice--ok";
            statusBox.innerHTML = `
                <div class="kx-status-head">
                    <span>Temporary Stop Active</span>
                    <span class="kx-status-dates">${temporaryStopChange.start_date} → ${temporaryStopChange.end_date}</span>
                </div>
                <div class="kx-status-name">${temporaryStopChange.temporary_stop_name || "Custom pickup location"}</div>
            `;
            statusBox.classList.remove("hidden");
        }
        return;
    }

    if (temporaryStopChange?.scheduled) {
        if (cancelBtn) cancelBtn.classList.remove("hidden");
        if (tempBtnText) tempBtnText.textContent = "Temporary Stop (Scheduled)";

        if (statusBox) {
            statusBox.className = "kx-notice kx-notice--warn";
            statusBox.innerHTML = `
                <div class="kx-status-head">
                    <span>Temporary Stop Scheduled</span>
                    <span class="kx-status-dates">${temporaryStopChange.start_date} → ${temporaryStopChange.end_date}</span>
                </div>
                <div class="kx-status-name">${temporaryStopChange.temporary_stop_name || "Custom pickup location"}</div>
            `;
            statusBox.classList.remove("hidden");
        }
        return;
    }

    if (temporaryStopChange?.pending_approval) {
        if (cancelBtn) cancelBtn.classList.remove("hidden");
        if (tempBtnText) tempBtnText.textContent = "Temporary Stop (Pending)";
        if (statusBox) {
            statusBox.className = "kx-notice kx-notice--warn";
            statusBox.innerHTML = `<div class="kx-status-head"><span>Requires Admin Confirmation</span></div>
                <div class="kx-status-name">${temporaryStopChange.temporary_stop_name || "Temporary pickup location"}</div>`;
            statusBox.classList.remove("hidden");
        }
        return;
    }

    if (cancelBtn) cancelBtn.classList.add("hidden");
    if (tempBtnText) tempBtnText.textContent = "Temporary Stop";
    if (statusBox) {
        statusBox.className = "hidden";
        statusBox.innerHTML = "";
    }
}

async function loadTemporaryStopChange() {
    const token = getToken();
    if (!token) return null;

    try {
        const response = await fetch(`${API_BASE}/student/temporary-stop-change`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            temporaryStopChange = null;
            renderTemporaryStopStatus();
            return null;
        }

        temporaryStopChange = data.active || data.scheduled || data.pending_approval ? data : null;
        renderTemporaryStopStatus();
        return temporaryStopChange;
    } catch (error) {
        console.warn("[WARN] Failed to load temporary stop change:", error);
        temporaryStopChange = null;
        renderTemporaryStopStatus();
        return null;
    }
}

async function submitTemporaryStopChange() {
    if (studentFeatureSubmitting) return;

    const token = getToken();
    if (!token) {
        featureNotify("warning", "Session expired", "Please login again.");
        return;
    }

    const startInput = document.getElementById("temporaryStartDate");
    const endInput = document.getElementById("temporaryEndDate");
    const submit = document.getElementById("confirmTemporaryStopBtn");

    const startDate = startInput?.value;
    const endDate = endInput?.value;

    saveTemporaryStopDraft();
    const morningInput = temporaryStopInputFromDraft("morning");
    const eveningInput = temporaryStopInputFromDraft("evening");
    const primaryDirection = morningInput ? "morning" : "evening";
    const primaryInput = morningInput || eveningInput;
    const primaryDraft = temporaryStopDrafts[primaryDirection];
    if (!primaryInput || !primaryDraft.routeCheck) {
        featureNotify("warning", "Check the route first", "Select at least one stop or location and check its route before submitting.");
        return;
    }
    if ((morningInput && !temporaryStopDrafts.morning.routeCheck) ||
        (eveningInput && !temporaryStopDrafts.evening.routeCheck)) {
        featureNotify("warning", "Check both locations", "Run the route check for each temporary stop you selected.");
        return;
    }

    // Only selected directions are submitted. Two locations need a shared bus.
    const candidateBusIds = ["morning", "evening"]
        .filter(direction => temporaryStopInputFromDraft(direction))
        .map(direction => temporaryStopDrafts[direction].candidateBusId)
        .filter(Boolean);
    const uniqueCandidateBusIds = [...new Set(candidateBusIds)];
    if (uniqueCandidateBusIds.length > 1) {
        featureNotify("warning", "Choose one shared bus", "Both temporary stops must be served by the same bus.");
        return;
    }

    if (!startDate || !endDate || endDate < startDate) {
        featureNotify("warning", "Check the dates", "The end date must be on or after the start date.");
        return;
    }

    if (temporaryStopChange?.active || temporaryStopChange?.scheduled || temporaryStopChange?.pending_approval) {
        featureNotify("warning", "Temporary stop already exists", "Cancel the existing temporary change before creating another one.");
        return;
    }

    studentFeatureSubmitting = true;
    if (submit) {
        submit.disabled = true;
        submit.innerHTML = `<svg class="w-4 h-4 shrink-0 animate-spin" aria-hidden="true"><use href="icons.svg#icon-spinner"/></svg><span>Saving…</span>`;
    }

    try {
        const response = await fetch(`${API_BASE}/student/temporary-stop-change`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                ...(morningInput ? { morning_location: morningInput } : {}),
                ...(eveningInput ? { evening_location: eveningInput } : {}),
                ...(uniqueCandidateBusIds.length ? { target_bus_id: uniqueCandidateBusIds[0] } : {}),
                start_date: startDate,
                end_date: endDate
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Unable to schedule the temporary stop.");

        temporaryStopChange = {
            ...data,
            active: data.status === "active",
            scheduled: data.status === "scheduled",
            pending_approval: data.status === "pending_admin_approval"
        };
        renderTemporaryStopStatus();

        // Reset picker state for next open
        tempStopPickerLat = null;
        tempStopPickerLng = null;
        tempStopPickerAddress = null;
        ["morning", "evening"].forEach(direction => {
            temporaryStopDrafts[direction] = { mode: "pin", latitude: null, longitude: null, address: null, stopId: null, routeCheck: null, candidateBusId: null };
        });

        closeTemporaryStopModal();
        featureNotify(
            "success",
            data.status === "pending_admin_approval" ? "Requires Admin Confirmation" : (data.status === "active" ? "Temporary stop active" : "Temporary stop scheduled"),
            data.status === "pending_admin_approval" ? "Your selected bus and stop are waiting for admin approval." : `${data.temporary_stop_name || "Temporary stop"} is set for ${data.start_date} → ${data.end_date}.`
        );

        // Re-read effective stop so the dashboard card/map updates immediately
        await loadMyStop(true);
        await loadTemporaryStopChange();
        await loadStudentBus();
    } catch (error) {
        console.error("[ERROR] Temporary stop change failed:", error);
        featureNotify("error", "Unable to change stop", error.message || "Please try again.");
    } finally {
        studentFeatureSubmitting = false;
        if (submit) {
            submit.disabled = false;
            submit.innerHTML = `<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-lock"/></svg><span>Step 2: Complete Step 1 First</span>`;
        }
    }
}
window.submitTemporaryStopChange = submitTemporaryStopChange;

async function cancelTemporaryStopChange() {
    if (studentFeatureSubmitting) return;
    if (!temporaryStopChange?.active && !temporaryStopChange?.scheduled && !temporaryStopChange?.pending_approval) return;

    const approved = typeof KambusNotify !== "undefined"
        ? await KambusNotify.confirm({
            title: "Cancel temporary stop?",
            message: "Your original stop will become effective again.",
            confirmText: "Cancel Change",
            cancelText: "Keep It"
        })
        : await confirm("Cancel this temporary stop change?");

    if (!approved) return;

    const token = getToken();
    if (!token) {
        featureNotify("warning", "Session expired", "Please login again.");
        return;
    }

    studentFeatureSubmitting = true;

    try {
        // Check before DELETE so validation still sees the replacement
        // we are reverting from, before the backend restores the assignment.
        let revertedStopCheck = null;
        if (temporaryStopChange.active) {
            const checkResponse = await fetch(`${API_BASE}/student/temporary-stop-change/check-route`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ stop_id: temporaryStopChange.original_stop_id })
            });
            revertedStopCheck = await checkResponse.json().catch(() => ({}));
            if (!checkResponse.ok) throw new Error(revertedStopCheck.detail || "Unable to validate your original stop.");
        }

        const response = await fetch(`${API_BASE}/student/temporary-stop-change`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Unable to cancel the temporary stop.");

        temporaryStopChange = null;
        temporaryRouteSelection = null;
        renderTemporaryStopStatus();
        closeTemporaryStopModal();
        // Reload bus, driver, route and stop together, just as submission does.
        clearStudentAssignmentTracking();
        assignedBusId = null;
        studentAssignment = null;
        regularStudentAssignment = null;
        activeAlternativeAllotment = null;
        updateStudentDashboard({});
        updateMissedBusButtonUI();
        setMyStopState("Updating assigned stop…", "Updating route…", "Bus: —", "Driver: —");
        if (!await loadStudentBus()) {
            featureNotify("warning", "Temporary stop cancelled", "Unable to reload your registered assignment. Please refresh to try again.");
            return;
        }
        if (revertedStopCheck && !revertedStopCheck.on_route &&
            !(revertedStopCheck.candidate_buses || []).some(candidate => candidate.is_own_bus)) {
            featureNotify("warning", "Temporary stop cancelled", "This bus does not travel through this stop. Your temporary bus allotment has been cleared.");
        } else {
            featureNotify("success", "Temporary stop cancelled", "Your original stop is active again.");
        }
    } catch (error) {
        console.error("[ERROR] Temporary stop cancellation failed:", error);
        featureNotify("error", "Unable to cancel", error.message || "Please try again.");
    } finally {
        studentFeatureSubmitting = false;
    }
}
window.cancelTemporaryStopChange = cancelTemporaryStopChange;

// ========================================================================
// INITIALIZATION ON DOM CONTENT LOADED
// ========================================================================

document.addEventListener("DOMContentLoaded", () => {
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
