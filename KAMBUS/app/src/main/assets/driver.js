// ========================================================================
// KAMBUS - Driver Live Dashboard & Active Trip Controller
// ========================================================================

const API_BASE = "https://kambus-backend.onrender.com";
const OSRM_BASE = "https://kambus-orsm.onrender.com";

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

// Driver & Trip State
let isTripActive = false;
let isGpsPaused = false;
let isTripStarting = false;
let isTripEnding = false;
let selectedTripType = null;
let busAssignmentCheckInterval = null; // Polls for driver->bus reassignment while a trip is active

let BUS_ID = null;
let currentBusData = null;
let driverRouteStops = [];
let passedStopIds = new Set();
let currentNextStop = null;

// GPS Tracking State
let gpsWatchId = null;
let lastPosition = null;
let lastLocationSentAt = 0;
let locationRequestInFlight = false;
let statusElapsedTimer = null;

// Wait Request Polling & Countdown State
let waitRequestPollTimer = null;
let waitCountdownInterval = null;
let activeWaitRequest = null;
const waitRequestSkipInFlight = new Set();

// Map & Visualization Layers
let routeMap = null;
let driverMarker = null;
let completedRouteLayer = null;
let remainingRouteLayer = null;
let stopMarkersGroup = null;
let collegeMarker = null;

// Authoritative College Coordinates (fallback default)
const COLLEGE_LOCATION = {
    latitude: 18.054145359568437,
    longitude: 79.53558731724873,
    name: "KITSW / College"
};

// OSRM Road Routing Cache & Throttle State
let lastRouteFetchAt = 0;
let lastRouteFetchPos = null;
let lastNextStopId = null;
let isRouteFetchInFlight = false;
const ROUTE_REFRESH_MIN_INTERVAL_MS = 25000; // 25 seconds minimum between OSRM requests
const ROUTE_REFRESH_MIN_DISTANCE_M = 120;    // 120 meters minimum movement before recalculating
let wakeLockSentinel = null;

async function acquireWakeLock() {
    try {
        if ("wakeLock" in navigator) {
            wakeLockSentinel = await navigator.wakeLock.request("screen");
            wakeLockSentinel.addEventListener("release", () => {
});
}
    } catch (err) {
        console.warn("Wake lock request failed:", err.message);
    }
}

async function releaseWakeLock() {
    if (wakeLockSentinel) {
        try { await wakeLockSentinel.release(); } catch (_) {}
        wakeLockSentinel = null;
    }
}

// Re-acquire on tab/app resume — wake locks are auto-released on visibility change
document.addEventListener("visibilitychange", async () => {
    if (isTripActive && document.visibilityState === "visible") {
        await acquireWakeLock();
    }
});
// ========================================================================
// AUTHENTICATION HELPER
// ========================================================================

function getToken() {
    return localStorage.getItem("kambus_token");
}

// ========================================================================
// INITIALIZATION ON DOM LOAD
// ========================================================================

document.addEventListener("DOMContentLoaded", () => {
// Bind Start & End Trip Buttons
    document.getElementById("startTripBtn")?.addEventListener("click", handleStartTrip);
    document.getElementById("endTripBtn")?.addEventListener("click", confirmAndEndTrip);
    document.getElementById("morningTripTypeBtn")?.addEventListener("click", () => selectTripType("morning"));
    document.getElementById("eveningTripTypeBtn")?.addEventListener("click", () => selectTripType("evening"));
    updateTripTypeControls();

    // Bind Recenter Map Button
    document.getElementById("recenterBtn")?.addEventListener("click", recenterRouteMap);

    // Bind Skip Wait Button
    document.getElementById("skipWaitBtn")?.addEventListener("click", handleSkipActiveWait);

    // Bind Logout Button
    document.getElementById("driverLogoutBtn")?.addEventListener("click", handleDriverLogout);

    // Start Live Status Elapsed Ticker
    startStatusElapsedTicker();

    // Restore Driver State
    restoreDriverDashboardState();
});

// ========================================================================
// LOGOUT HANDLER
// ========================================================================

async function handleDriverLogout(event) {
    if (event) event.preventDefault();

    if (isTripActive) {
        const confirmed = confirm("You have an active trip in progress. Are you sure you want to log out? The trip will be ended automatically.");
        if (!confirmed) return;

        // End the trip on the backend before clearing local state
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE}/driver/end-trip`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });
            if (response.ok) {
} else {
                const data = await response.json().catch(() => ({}));
                console.warn("[WARN] End-trip call during logout returned non-OK:", response.status, data.detail || "");
                // Proceed with logout anyway — don't block the user
            }
        } catch (err) {
            console.error("[ERROR] End-trip call during logout failed (network error):", err);
            // Proceed with logout anyway — don't block the user
        }
    }

    // Stop GPS tracking & any active polling
    stopGpsTracking();
    stopWaitRequestsPolling();
    stopBusAssignmentPolling();

    // Clear session tokens
    localStorage.removeItem("kambus_token");
    localStorage.removeItem("kambus_role");
    localStorage.removeItem("kambus_user_id");

    // Redirect to login page
    window.location.href = "index.html";
}

// ========================================================================
// STATUS BAR ELAPSED TIMER (Sending • 3s ago)
// ========================================================================

function startStatusElapsedTicker() {
    if (statusElapsedTimer) clearInterval(statusElapsedTimer);

    statusElapsedTimer = setInterval(() => {
        updateTopStatusBar();
    }, 1000);
}

function updateTopStatusBar() {
    const dot = document.getElementById("statusDot");
    const statusText = document.getElementById("liveStatusText");
    const elapsedText = document.getElementById("lastUpdateElapsed");

    if (!dot || !statusText || !elapsedText) return;

    if (!isTripActive) {
        dot.className = "w-2 h-2 rounded-full bg-slate-300";
        statusText.textContent = "Offline";
        statusText.className = "text-xs font-bold text-slate-500";
        elapsedText.textContent = "GPS not active";
        return;
    }

    if (isGpsPaused) {
        dot.className = "w-2 h-2 rounded-full bg-warn animate-pulse";
        statusText.textContent = "GPS Paused";
        statusText.className = "text-xs font-bold text-warn";
        elapsedText.textContent = "Updates suspended";
        return;
    }

    if (lastLocationSentAt === 0) {
        dot.className = "w-2 h-2 rounded-full bg-ok animate-pulse";
        statusText.textContent = "Acquiring GPS";
        statusText.className = "text-xs font-bold text-ok";
        elapsedText.textContent = "Waiting for first fix…";
        return;
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastLocationSentAt) / 1000));

    if (elapsedSeconds <= 15) {
        dot.className = "w-2 h-2 rounded-full bg-ok animate-pulse";
        statusText.textContent = "LIVE";
        statusText.className = "text-xs font-bold text-ok";
        elapsedText.textContent = `Sending • ${elapsedSeconds}s ago`;
    } else {
        dot.className = "w-2 h-2 rounded-full bg-warn";
        statusText.textContent = "Slow GPS";
        statusText.className = "text-xs font-bold text-warn";
        elapsedText.textContent = `Sending • ${elapsedSeconds}s ago`;
    }
}

// ========================================================================
// RESTORE DASHBOARD STATE ON LOAD
// ========================================================================

async function restoreDriverDashboardState() {
    const token = getToken();
    if (!token) return;

    // 1. Load Driver's Assigned Bus
    const myBus = await loadDriverBus();
    if (!myBus.success) return;

    // 2. Load Driver's Route Stops
    await loadDriverRouteStops();

    try {
        const response = await fetch(`${API_BASE}/driver/trip-status`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok && data.active) {
            await loadDriverRouteStops();
            isTripActive = true;
            switchToActiveTripView();
            startGpsTracking();
            startWaitRequestsPolling();
            startBusAssignmentPolling();
        } else {
isTripActive = false;
            switchToPreTripView();
        }
    } catch (error) {
        console.warn("Trip status restore error:", error);
        switchToPreTripView();
    }
}

// ========================================================================
// SWITCH VIEWS: PRE-TRIP vs ACTIVE TRIP
// ========================================================================

function switchToPreTripView() {
    document.getElementById("preTripView")?.classList.remove("hidden");
    document.getElementById("preTripFooter")?.classList.remove("hidden");
    document.getElementById("activeTripView")?.classList.add("hidden");
    document.getElementById("waitRequestCard")?.classList.add("hidden");

    // Update floating status badge on map for pre-trip preview
    const statusBadge = document.getElementById("routeStatusBadge");
    const statusDot = document.getElementById("routeStatusDot");
    const statusText = document.getElementById("routeStatusText");
    if (statusBadge) statusBadge.classList.remove("hidden");
    if (statusDot) statusDot.className = "w-1.5 h-1.5 rounded-full bg-brand";
    if (statusText) statusText.textContent = "Route Preview • Ready";

    updatePreTripOverview();
    updateTopStatusBar();

    // Render map preview for pre-trip
    setTimeout(() => {
        initOrUpdateRouteMap();
        if (routeMap) {
            routeMap.invalidateSize();
            if (driverRouteStops.length > 0) {
                const boundsCoords = driverRouteStops.map(s => [s.latitude, s.longitude]);
                boundsCoords.push([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude]);
                routeMap.fitBounds(L.latLngBounds(boundsCoords), { padding: [35, 35] });
            }
        }
    }, 150);
}

function switchToActiveTripView() {
    document.getElementById("preTripView")?.classList.add("hidden");
    document.getElementById("preTripFooter")?.classList.add("hidden");
    document.getElementById("activeTripView")?.classList.remove("hidden");

    // Update floating status badge on map for active trip
    const statusBadge = document.getElementById("routeStatusBadge");
    const statusDot = document.getElementById("routeStatusDot");
    const statusText = document.getElementById("routeStatusText");
    if (statusBadge) statusBadge.classList.remove("hidden");
    if (statusDot) statusDot.className = "w-1.5 h-1.5 rounded-full bg-ok animate-pulse";
    if (statusText) statusText.textContent = "Trip Active • Live GPS";

    // Initialize/refresh map on active switch
    setTimeout(() => {
        initOrUpdateRouteMap();
        if (routeMap) routeMap.invalidateSize();
    }, 150);

    updateTopStatusBar();
}

// ========================================================================
// LOAD DRIVER'S ASSIGNED BUS
// ========================================================================

async function loadDriverBus() {
    const token = getToken();
    if (!token) {
        return { success: false, message: "Token missing" };
    }

    try {
        const response = await fetch(`${API_BASE}/driver/my-bus`, {
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok || !data.bus_id) {
            console.error("[ERROR] Failed to load driver bus:", data);
            return { success: false, message: data.detail || "Bus unavailable" };
        }

        BUS_ID = data.bus_id;
        currentBusData = data;

        // Update header & badges
        const busBadge = document.getElementById("headerBusBadge");
        if (busBadge) busBadge.textContent = `Bus ${data.bus_number || "—"}`;

        const driverName = document.getElementById("headerDriverName");
        if (driverName) driverName.textContent = data.driver_name || "Driver";

        return { success: true, bus: data };
    } catch (error) {
        console.error("[ERROR] loadDriverBus connection error:", error);
        return { success: false, message: error.message };
    }
}

// ========================================================================
// LOAD ROUTE STOPS & EXPECTED STUDENTS
// ========================================================================

async function loadDriverRouteStops() {
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/driver/route-stops`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.warn("Failed to load route stops:", data);
            return;
        }

        // The backend already returns stops in the active trip's direction.
        const rawStops = Array.isArray(data.stops) ? data.stops : [];
        driverRouteStops = [...rawStops];

        // Dynamic College Coordinates from Backend if provided
        if (data.college_location?.latitude && data.college_location?.longitude) {
            COLLEGE_LOCATION.latitude = Number(data.college_location.latitude);
            COLLEGE_LOCATION.longitude = Number(data.college_location.longitude);
            if (data.college_location.name) COLLEGE_LOCATION.name = data.college_location.name;
        }

        // Update Today's Total Students Count
        const todayStudentsElem = document.getElementById("todayStudentsCount");
        if (todayStudentsElem) {
            const count = data.total_students_today ?? data.total_assigned_students ?? "--";
            todayStudentsElem.textContent = count;
        }

        updatePreTripOverview();
        updateStopProgressionUI();

        if (isTripActive) {
            initOrUpdateRouteMap();
            if (lastPosition) {
                updateNextStopAndEta(lastPosition);
                triggerRoadRouteFetchIfNeeded(lastPosition, true);
            }
        }
    } catch (error) {
        console.error("loadDriverRouteStops error:", error);
    }
}

// ========================================================================
// PRE-TRIP OVERVIEW RENDERING
// ========================================================================

function updatePreTripOverview() {
    const routeName = document.getElementById("preTripRouteName");
    if (routeName) {
        routeName.textContent = currentBusData?.route_name || "Assigned Route";
    }

    const stopCount = document.getElementById("preTripStopCount");
    if (stopCount) {
        const count = driverRouteStops.length;
        stopCount.textContent = `${count} stop${count === 1 ? "" : "s"}`;
    }

    const firstStopName = document.getElementById("preTripFirstStopName");
    if (firstStopName) {
        firstStopName.textContent = driverRouteStops[0]?.name || "Route stops ready";
    }
}

// ========================================================================
// START TRIP CONTROLLER
// ========================================================================

function selectTripType(tripType) {
    selectedTripType = tripType;
    updateTripTypeControls();
}

function updateTripTypeControls() {
    const startBtn = document.getElementById("startTripBtn");
    const startText = document.getElementById("startTripText");
    const labels = { morning: "Morning", evening: "Evening" };

    ["morning", "evening"].forEach((tripType) => {
        const button = document.getElementById(`${tripType}TripTypeBtn`);
        if (!button) return;
        const isSelected = selectedTripType === tripType;
        button.setAttribute("aria-pressed", String(isSelected));
        button.classList.toggle("bg-navy", isSelected);
        button.classList.toggle("text-white", isSelected);
        button.classList.toggle("border-navy", isSelected);
        button.classList.toggle("bg-bg", !isSelected);
        button.classList.toggle("text-navy", !isSelected);
        button.classList.toggle("border-line", !isSelected);
    });

    if (startBtn && !isTripStarting) startBtn.disabled = !selectedTripType;
    if (startText && !isTripStarting) {
        startText.textContent = selectedTripType
            ? `START ${labels[selectedTripType].toUpperCase()} TRIP`
            : "SELECT TRIP TYPE";
    }
}

async function handleStartTrip() {
    if (isTripActive || isTripStarting) return;

    if (!selectedTripType) {
        KambusNotify.notify({
            type: "warning",
            title: "Select trip type",
            message: "Choose Morning or Evening before starting the trip."
        });
        return;
    }

    const token = getToken();
    if (!token) {
        KambusNotify.notify({
            type: "warning",
            title: "Session expired",
            message: "Please login again."
        });
        return;
    }

    if (!BUS_ID) {
        await loadDriverBus();
        if (!BUS_ID) {
            KambusNotify.notify({
                type: "error",
                title: "Bus not assigned",
                message: "No bus assignment found for your driver account."
            });
            return;
        }
    }

    isTripStarting = true;

    const startBtn = document.getElementById("startTripBtn");
    const startIcon = document.getElementById("startTripIcon");
    const startText = document.getElementById("startTripText");

    if (startBtn) startBtn.disabled = true;
    if (startIcon) {
        startIcon.className = "w-4 h-4 animate-spin shrink-0";
        startIcon.innerHTML = '<use href="icons.svg#icon-spinner"/>';
    }
    if (startText) startText.textContent = "STARTING TRIP…";

    try {
        const response = await fetch(`${API_BASE}/driver/start-trip`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ trip_type: selectedTripType })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Server failed to start trip");
        }
        await loadDriverRouteStops();
        isTripActive = true;
        isGpsPaused = false;
        passedStopIds.clear();
        lastRouteFetchAt = 0;
        lastRouteFetchPos = null;
        lastNextStopId = null;

        switchToActiveTripView();
        startGpsTracking();
        startWaitRequestsPolling();
        startBusAssignmentPolling();

        KambusNotify.notify({
            type: "success",
            title: "Trip started",
            message: "Live GPS sharing has started."
        });
    } catch (error) {
        console.error("Start trip failed:", error);
        KambusNotify.notify({
            type: "error",
            title: "Unable to start trip",
            message: error.message || "Please check your connection."
        });
    } finally {
        isTripStarting = false;
        if (startBtn) startBtn.disabled = !selectedTripType;
        if (startIcon) {
        startIcon.className = "w-4 h-4 shrink-0";
        startIcon.innerHTML = '<use href="icons.svg#icon-play"/>';
    }
        updateTripTypeControls();
    }
}

// ========================================================================
// END TRIP CONTROLLER (WITH CONFIRMATION MODAL)
// ========================================================================

async function confirmAndEndTrip() {
    if (!isTripActive || isTripEnding) return;

    // Safety Confirmation Modal
    const confirmed = await KambusNotify.confirm({
        title: "End this trip?",
        message: "Your live location sharing will stop.",
        confirmText: "End Trip",
        cancelText: "Cancel",
        danger: true
    });

    if (!confirmed) return;

    isTripEnding = true;
    const token = getToken();

    try {
        const response = await fetch(`${API_BASE}/driver/end-trip`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Failed to end trip");
        }
// Stop GPS & Intervals
        stopGpsTracking();
        stopWaitRequestsPolling();
        stopBusAssignmentPolling();

        isTripActive = false;
        isGpsPaused = false;
        lastPosition = null;
        lastLocationSentAt = 0;
        passedStopIds.clear();
        lastRouteFetchAt = 0;
        lastRouteFetchPos = null;

        // Clear Map Layers
        if (remainingRouteLayer) remainingRouteLayer.clearLayers();
        if (completedRouteLayer) completedRouteLayer.clearLayers();
        if (driverMarker && routeMap) {
            routeMap.removeLayer(driverMarker);
            driverMarker = null;
        }

        switchToPreTripView();

        KambusNotify.notify({
            type: "success",
            title: "Trip ended",
            message: "Live location sharing stopped."
        });
    } catch (error) {
        console.error("End trip failed:", error);
        KambusNotify.notify({
            type: "error",
            title: "Unable to end trip",
            message: error.message || "Please try again."
        });
    } finally {
        isTripEnding = false;
    }
}

// ========================================================================
// GPS TRACKING & LOCATION BROADCAST
// ========================================================================

function startGpsTracking() {
    acquireWakeLock();
    stopGpsTracking();

    if (!navigator.geolocation) {
        KambusNotify.notify({
            type: "error",
            title: "GPS not supported",
            message: "Geolocation is not supported on this device."
        });
        return;
    }

    gpsWatchId = navigator.geolocation.watchPosition(
        handleDriverLocationFix,
        handleDriverLocationError,
        {
            enableHighAccuracy: true,
            maximumAge: 2000,
            timeout: 10000
        }
    );
}

function stopGpsTracking() {
     releaseWakeLock();
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
}

function handleDriverLocationFix(position) {
    if (!isTripActive || isGpsPaused) return;

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const speedMs = position.coords.speed;
    const speed = (speedMs !== null && speedMs !== undefined && speedMs >= 0)
        ? Math.round(speedMs * 3.6)
        : null;

    const isFirstFix = !lastPosition;
    lastPosition = { latitude, longitude, speed };

    // 1. Smoothly update Driver live marker ONLY (NO map reconstruction)
    updateDriverMarkerOnMap(latitude, longitude, speed, isFirstFix);

    // 2. Update Next Stop progress, ETA, and distance
    updateNextStopAndEta(lastPosition);

    // 3. Check if road route recalculation is needed (throttled/debounced)
    triggerRoadRouteFetchIfNeeded(lastPosition, isFirstFix);

    // 4. Broadcast live GPS to backend
    sendLocationUpdateToBackend(latitude, longitude, speed);
}

function handleDriverLocationError(error) {
    console.warn("GPS Location Error:", error);
    updateTopStatusBar();
}

async function sendLocationUpdateToBackend(latitude, longitude, speed) {
    if (locationRequestInFlight || Date.now() - lastLocationSentAt < 2500) {
        return;
    }

    const token = getToken();
    if (!token || !BUS_ID) return;

    locationRequestInFlight = true;

    try {
        const response = await fetch(`${API_BASE}/buses/${BUS_ID}/location`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                latitude: latitude,
                longitude: longitude,
                speed: speed
            })
        });

        if (response.ok) {
            lastLocationSentAt = Date.now();
            updateTopStatusBar();
        } else if (response.status === 403) {
            // Bus was reassigned to another driver mid-trip — this driver no longer owns it
            handleBusReassignmentDetected();
        }
    } catch (e) {
        console.warn("Location send network failure:", e);
    } finally {
        locationRequestInFlight = false;
    }
}

// ========================================================================
// BUS REASSIGNMENT DETECTION (POLLING)
// ========================================================================
// While a trip is active, the admin can reassign this driver's bus to
// someone else at any time. The app previously kept using the stale
// BUS_ID until the driver manually logged out and back in. This polls
// /driver/my-bus periodically and also reacts immediately if a location
// POST comes back 403, so the driver is notified right away instead of
// silently continuing to broadcast to a bus they no longer own.

function startBusAssignmentPolling() {
    if (busAssignmentCheckInterval) return; // already running

    busAssignmentCheckInterval = setInterval(async () => {
        const previousBusId = BUS_ID;
        const result = await loadDriverBus();

        if (!result.success || BUS_ID !== previousBusId) {
            handleBusReassignmentDetected();
        }
    }, 45000); // check every 45 seconds
}

function stopBusAssignmentPolling() {
    if (busAssignmentCheckInterval) {
        clearInterval(busAssignmentCheckInterval);
        busAssignmentCheckInterval = null;
    }
}

async function handleBusReassignmentDetected() {
    // Avoid duplicate handling if this fires more than once in quick succession
    if (!isTripActive) return;

    stopBusAssignmentPolling();
    stopGpsTracking();
    stopWaitRequestsPolling();

    BUS_ID = null;
    currentBusData = null;
    isTripActive = false;
    isGpsPaused = false;
    lastPosition = null;
    lastLocationSentAt = 0;

    switchToPreTripView();

    KambusNotify.notify({
        type: "error",
        title: "Bus reassigned",
        message: "You are no longer assigned to this bus. Please log in again to continue."
    });
}

// ========================================================================
// NEXT STOP, DISTANCE, ETA & STOP PROGRESSION
// ========================================================================

function updateNextStopAndEta(driverPos) {
    if (!driverPos || driverRouteStops.length === 0) return;

    // The backend returns this array in the active trip's travel order.
    const remainingStops = driverRouteStops.filter(s => !passedStopIds.has(s.stop_id || s.id));

    if (remainingStops.length === 0) {
        // All stops completed; route destination is College
        const distToCollege = calculateDistance(
            driverPos.latitude,
            driverPos.longitude,
            COLLEGE_LOCATION.latitude,
            COLLEGE_LOCATION.longitude
        );

        renderNextStopCard({
            name: COLLEGE_LOCATION.name,
            distance: distToCollege,
            orderText: "Final Destination",
            studentCount: null,
            isCollege: true
        });

        currentNextStop = null;
        updateStopProgressionUI();
        updateCollegeEta(driverPos);
        return;
    }

    // Next upcoming stop in sequence
    const nextStop = remainingStops[0];
    const nextStopPosition = driverRouteStops.findIndex(
        stop => (stop.stop_id || stop.id) === (nextStop.stop_id || nextStop.id)
    ) + 1;
    const distToNext = calculateDistance(driverPos.latitude, driverPos.longitude, nextStop.latitude, nextStop.longitude);

    VoiceAnnouncer.checkProximityAnnouncement(
        nextStop.stop_id || nextStop.id,
        nextStop.name,
        nextStop.student_count,
        distToNext
    );

    // Auto-mark passed if within 80m of the stop
    if (distToNext <= 80) {
        passedStopIds.add(nextStop.stop_id || nextStop.id);
        updateStopProgressionUI();
        updateStopMarkersAppearance();
        triggerRoadRouteFetchIfNeeded(driverPos, true);
        return;
    }

    const previousNextStopId = currentNextStop ? (currentNextStop.stop_id || currentNextStop.id) : null;
    currentNextStop = nextStop;

    renderNextStopCard({
        name: nextStop.name,
        distance: distToNext,
        orderText: `Stop ${nextStopPosition} of ${driverRouteStops.length}`,
        studentCount: nextStop.student_count,
        isCollege: false
    });

    updateStopProgressionUI();
    updateCollegeEta(driverPos);

    // If next stop changed, update markers and trigger route refetch
    if (previousNextStopId !== (nextStop.stop_id || nextStop.id)) {
        updateStopMarkersAppearance();
        triggerRoadRouteFetchIfNeeded(driverPos, true);
    }
}

function renderNextStopCard({ name, distance, orderText, studentCount, isCollege }) {
    const nameElem = document.getElementById("nextStopName");
    if (nameElem) nameElem.textContent = name;

    const distElem = document.getElementById("nextStopDistance");
    if (distElem) {
        distElem.textContent = distance >= 1000
            ? `${(distance / 1000).toFixed(1)} km`
            : `${Math.round(distance)} m`;
    }

    const badgeElem = document.getElementById("nextStopOrderBadge");
    if (badgeElem) badgeElem.textContent = orderText;

    // Next Stop ETA calculation
    const etaElem = document.getElementById("nextStopEta");
    if (etaElem) {
        const speedKmh = (lastPosition?.speed && lastPosition.speed >= 12) ? lastPosition.speed : 25;
        const minutes = Math.max(1, Math.ceil((distance / 1000) / (speedKmh / 60)));
        etaElem.textContent = `ETA: ~${minutes} min`;
    }

    // Expected Students Count
    const studentsContainer = document.getElementById("nextStopStudentsContainer");
    const studentsElem = document.getElementById("nextStopStudents");

    if (studentsContainer && studentsElem) {
        const count = Number(studentCount);
        if (isCollege || !Number.isFinite(count) || count <= 0) {
            studentsContainer.classList.add("hidden");
        } else {
            studentsContainer.classList.remove("hidden");
            studentsElem.textContent = `${count} students expected`;
        }
    }
}

function updateCollegeEta(driverPos) {
    const clockElem = document.getElementById("collegeClockEta");
    const durationElem = document.getElementById("collegeDurationEta");

    if (!clockElem || !durationElem || !driverPos) return;

    const distanceMeters = calculateDistance(
        driverPos.latitude,
        driverPos.longitude,
        COLLEGE_LOCATION.latitude,
        COLLEGE_LOCATION.longitude
    );

    const speedKmh = (driverPos.speed && driverPos.speed >= 15) ? driverPos.speed : 28;
    const durationMinutes = Math.max(2, Math.ceil((distanceMeters / 1000) / (speedKmh / 60)));

    durationElem.textContent = `~${durationMinutes} min`;

    const etaDate = new Date(Date.now() + durationMinutes * 60000);
    clockElem.textContent = etaDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function updateStopProgressionUI() {
    const passedCount = passedStopIds.size;
    const totalStops = driverRouteStops.length;
    const remainingCount = Math.max(0, totalStops - passedCount);

    const passedElem = document.getElementById("progressPassedText");
    if (passedElem) passedElem.innerHTML = `<svg class="w-3.5 h-3.5 text-ok shrink-0 inline mr-1" aria-hidden="true"><use href="icons.svg#icon-check"/></svg>${passedCount} passed`;

    const remainingElem = document.getElementById("progressRemainingText");
    if (remainingElem) remainingElem.textContent = `${remainingCount} remaining`;

    const nextElem = document.getElementById("progressNextText");
    if (nextElem) {
        nextElem.textContent = currentNextStop ? `Next: ${currentNextStop.name}` : `To College`;
    }
}

// ========================================================================
// LIVE ROAD ROUTE MAP (LEAFLET + OSRM PUBLIC ROUTING)
// ========================================================================

function initOrUpdateRouteMap() {
    const mapContainer = document.getElementById("routeMap");
    if (!mapContainer) return;

    if (!routeMap) {
        routeMap = L.map("routeMap", {
            zoomControl: false,
            attributionControl: false
        }).setView([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude], 14);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19
        }).addTo(routeMap);

        // Separate layer groups for roads and markers
        completedRouteLayer = L.geoJSON(null, {
            style: { color: "#52707A", weight: 4, opacity: 0.55 }
        }).addTo(routeMap);

        remainingRouteLayer = L.geoJSON(null, {
            style: { color: "#4A6F79", weight: 5, opacity: 0.85 }
        }).addTo(routeMap);

        stopMarkersGroup = L.layerGroup().addTo(routeMap);
    }

    renderMapMarkers();
}

function renderMapMarkers() {
    if (!stopMarkersGroup) return;
    stopMarkersGroup.clearLayers();

    // 1. Plot Stops
    driverRouteStops.forEach((stop, index) => {
        const lat = Number(stop.latitude);
        const lng = Number(stop.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const isPassed = passedStopIds.has(stop.stop_id || stop.id);
        const isNext = currentNextStop && (currentNextStop.stop_id || currentNextStop.id) === (stop.stop_id || stop.id);

        const stopIcon = createStopMarkerIcon(index + 1, isPassed, isNext);

        const marker = L.marker([lat, lng], { icon: stopIcon, zIndexOffset: isNext ? 500 : 100 })
            .bindPopup(`<strong>${stop.name}</strong><br>Stop ${index + 1}${stop.student_count ? ` • ${stop.student_count} expected` : ''}`);

        marker.stopData = stop;
        stopMarkersGroup.addLayer(marker);
    });

    // 2. Plot College Marker
    const collegeIcon = L.divIcon({
        className: "",
        html: `
            <div style="
                width: 32px; height: 32px;
                border-radius: 4px;
                background: var(--navy);
                color: #ffffff;
                border: 2px solid #ffffff;
                display: flex; align-items: center; justify-content: center;
            ">
                <svg style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;"><use href="icons.svg#icon-kambus"/></svg>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    collegeMarker = L.marker([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude], {
        icon: collegeIcon,
        zIndexOffset: 300
    }).bindPopup(`<strong>${COLLEGE_LOCATION.name}</strong>`);

    stopMarkersGroup.addLayer(collegeMarker);

    // Initial bounds fitting if no GPS fix yet
    if (!lastPosition && driverRouteStops.length > 0) {
        const boundsCoords = driverRouteStops.map(s => [s.latitude, s.longitude]);
        boundsCoords.push([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude]);
        routeMap.fitBounds(L.latLngBounds(boundsCoords), { padding: [35, 35] });
    }
}

function createStopMarkerIcon(stopOrder, isPassed, isNext) {
    let bg = '#ffffff';
    let color = '#173541';
    let border = '3px solid #E3E8E8';
    let size = 26;

    if (isPassed) {
        bg = '#52707A';
        color = '#ffffff';
        border = '2px solid #173541';
    } else if (isNext) {
        bg = '#4A6F79';
        color = '#ffffff';
        border = '3px solid #173541';
        size = 30;
    }

    return L.divIcon({
        className: "",
        html: `
            <div style="
                width: ${size}px; height: ${size}px;
                border-radius: 50%;
                background: ${bg};
                color: ${color};
                border: ${border};
                display: flex; align-items: center; justify-content: center;
                font-size: ${isNext ? '12px' : '11px'}; font-weight: 900;
                box-shadow: ${isNext ? '0 0 0 4px rgba(79, 70, 229, 0.25), 0 3px 8px rgba(0,0,0,0.2)' : '0 2px 6px rgba(0,0,0,0.15)'};
            ">
                ${isPassed ? '•' : (stopOrder || '•')}
            </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}

function updateStopMarkersAppearance() {
    if (!stopMarkersGroup) return;

    stopMarkersGroup.eachLayer(layer => {
        if (layer.stopData) {
            const stop = layer.stopData;
            const isPassed = passedStopIds.has(stop.stop_id || stop.id);
            const isNext = currentNextStop && (currentNextStop.stop_id || currentNextStop.id) === (stop.stop_id || stop.id);
            const stopPosition = driverRouteStops.findIndex(
                routeStop => (routeStop.stop_id || routeStop.id) === (stop.stop_id || stop.id)
            ) + 1;
            layer.setIcon(createStopMarkerIcon(stopPosition, isPassed, isNext));
            layer.setZIndexOffset(isNext ? 500 : (isPassed ? 50 : 100));
        }
    });
}

function updateDriverMarkerOnMap(latitude, longitude, speed, isFirstFix = false) {
    if (!routeMap) return;

    if (!driverMarker) {
        const busIcon = L.divIcon({
            className: "",
            html: `
                <div style="position: relative; width: 36px; height: 36px;">
                    <div class="bus-pulse-ring" style="
                        position: absolute; inset: -4px;
                        border-radius: 50%;
                        background: rgba(30, 58, 138, 0.25);
                    "></div>
                    <div style="
                        position: relative;
                        width: 36px; height: 36px;
                        border-radius: 50%;
                        background: var(--navy);
                        color: white;
                        border: 2px solid white;
                        display: flex; align-items: center; justify-content: center;
                    ">
                        <svg style="width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2;"><use href="icons.svg#icon-bus"/></svg>
                    </div>
                </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });

        driverMarker = L.marker([latitude, longitude], { icon: busIcon, zIndexOffset: 1000 }).addTo(routeMap);

        if (isFirstFix) {
            routeMap.setView([latitude, longitude], 15);
        }
        } else {
            // Smoothly update marker location
            driverMarker.setLatLng([latitude, longitude]);

            // Auto-recenter map to follow the bus on every fix while trip is active
            if (isTripActive) {
                routeMap.panTo([latitude, longitude], { animate: true, duration: 0.5 });
            }
        }
}

function recenterRouteMap() {
    if (!routeMap) return;

    if (isTripActive && lastPosition) {
        routeMap.setView([lastPosition.latitude, lastPosition.longitude], 16, { animate: true });
        driverMarker?.openPopup();
        return;
    }

    if (driverRouteStops.length > 0) {
        const boundsCoords = driverRouteStops.map(s => [s.latitude, s.longitude]);
        boundsCoords.push([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude]);
        if (lastPosition) {
            boundsCoords.push([lastPosition.latitude, lastPosition.longitude]);
        }
        routeMap.fitBounds(L.latLngBounds(boundsCoords), { padding: [35, 35], animate: true });
        return;
    }

    routeMap.setView([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude], 14, { animate: true });
}

// ========================================================================
// OSRM ROAD ROUTING ENGINE & THROTTLED DISPATCH
// ========================================================================

function triggerRoadRouteFetchIfNeeded(driverPos, force = false) {
    if (!isTripActive || isRouteFetchInFlight) return;

    const now = Date.now();
    const currentNextId = currentNextStop ? (currentNextStop.stop_id || currentNextStop.id) : "college";

    // Check conditions for routing recalculation
    const timeElapsed = now - lastRouteFetchAt >= ROUTE_REFRESH_MIN_INTERVAL_MS;
    const nextStopChanged = currentNextId !== lastNextStopId;
    const distanceMoved = lastRouteFetchPos
        ? calculateDistance(driverPos.latitude, driverPos.longitude, lastRouteFetchPos.latitude, lastRouteFetchPos.longitude)
        : Infinity;

    const shouldFetch = force || !lastRouteFetchPos || nextStopChanged || (timeElapsed || distanceMoved >= ROUTE_REFRESH_MIN_DISTANCE_M);

    if (shouldFetch) {
        fetchAndDrawRoadRoute(driverPos, currentNextId);
    }
}

async function fetchAndDrawRoadRoute(driverPos, nextId) {
    if (isRouteFetchInFlight) return;
    isRouteFetchInFlight = true;

    const statusBadge = document.getElementById("routeStatusBadge");
    const statusDot = document.getElementById("routeStatusDot");
    const statusText = document.getElementById("routeStatusText");

    try {
        // Build remaining waypoints: Driver Position -> Remaining Unpassed Stops -> College
        const remainingStops = driverRouteStops.filter(s => !passedStopIds.has(s.stop_id || s.id));

        const waypoints = [
            { latitude: driverPos.latitude, longitude: driverPos.longitude }
        ];

        remainingStops.forEach(stop => {
            waypoints.push({ latitude: Number(stop.latitude), longitude: Number(stop.longitude) });
        });

        waypoints.push({ latitude: COLLEGE_LOCATION.latitude, longitude: COLLEGE_LOCATION.longitude });

        // IMPORTANT: OSRM uses longitude,latitude format
        const coordString = waypoints
            .map(p => `${p.longitude},${p.latitude}`)
            .join(";");

        const url = `${OSRM_BASE}/route/v1/driving/${coordString}?overview=full&geometries=geojson&steps=false`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`OSRM HTTP error: ${response.status}`);

        const data = await response.json();
        if (!data.routes || !data.routes.length) throw new Error("No road route found in OSRM response");

        const routeGeoJson = {
            type: "Feature",
            geometry: data.routes[0].geometry
        };

        // Render Road Geometry onto remainingRouteLayer
        if (remainingRouteLayer) {
            remainingRouteLayer.clearLayers();
            remainingRouteLayer.addData(routeGeoJson);
        }

        // Cache fetch state
        lastRouteFetchAt = Date.now();
        lastRouteFetchPos = { latitude: driverPos.latitude, longitude: driverPos.longitude };
        lastNextStopId = nextId;

        // Update Road Status Badge
        if (statusBadge && statusDot && statusText) {
            statusBadge.classList.remove("hidden");
            statusDot.className = "w-1.5 h-1.5 rounded-full bg-ok";
            statusText.textContent = "Road Route Active";
        }
} catch (error) {
        console.warn("Road routing notice:", error.message);

        // Fallback: Keep markers working, do not draw fake straight lines
        if (statusBadge && statusDot && statusText) {
            statusBadge.classList.remove("hidden");
            statusDot.className = "w-1.5 h-1.5 rounded-full bg-warn";
            statusText.textContent = "Road Route Unavailable";
        }
    } finally {
        isRouteFetchInFlight = false;
    }
}

// ========================================================================
// WAIT REQUESTS: AUTO-ACCEPT BY DEFAULT & COUNTDOWN CONTROLLER
// ========================================================================

function startWaitRequestsPolling() {
    stopWaitRequestsPolling();
    loadActiveWaitRequests();
    waitRequestPollTimer = setInterval(loadActiveWaitRequests, 4000);
}

function stopWaitRequestsPolling() {
    if (waitRequestPollTimer) clearInterval(waitRequestPollTimer);
    if (waitCountdownInterval) clearInterval(waitCountdownInterval);
    waitRequestPollTimer = null;
    waitCountdownInterval = null;
}

async function loadActiveWaitRequests() {
    if (!isTripActive) return;

    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/driver/wait-requests`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (!response.ok) return;

        const requests = Array.isArray(data.requests) ? data.requests : [];

        if (requests.length > 0) {
            renderActiveWaitCard(requests[0]);
        } else {
            hideActiveWaitCard();
        }
    } catch (e) {
        console.warn("Wait requests poll error:", e);
    }
}

function renderActiveWaitCard(group) {
    activeWaitRequest = group;
    VoiceAnnouncer.checkWaitRequestAnnouncement(group);

    const card = document.getElementById("waitRequestCard");
    const title = document.getElementById("waitStopTitle");
    const countElem = document.getElementById("waitStudentCount");
    const countdownElem = document.getElementById("waitCountdownBadge");

    if (!card || !title || !countdownElem) return;

    card.classList.remove("hidden");
    title.textContent = `WAIT REQUEST — ${group.stop_name || "Upcoming Stop"}`;

    const studentCount = Number(group.student_count || 1);
    if (countElem) {
        countElem.textContent = `• ${studentCount} ${studentCount === 1 ? "student" : "students"} waiting (${group.minutes} min)`;
    }

    // Live Auto-Accept Countdown
    if (waitCountdownInterval) clearInterval(waitCountdownInterval);

    function updateCountdown() {
        const deadline = Date.parse(group.auto_accept_at);
        if (!Number.isFinite(deadline)) {
            countdownElem.textContent = "Auto-accepting soon…";
            return;
        }

        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
            countdownElem.textContent = "Auto-accepted";
            clearInterval(waitCountdownInterval);
            setTimeout(loadActiveWaitRequests, 1000);
            return;
        }

        const remainingSec = Math.ceil(remainingMs / 1000);
        const formatted = remainingSec < 10 ? `00:0${remainingSec}` : `00:${remainingSec}`;
        countdownElem.textContent = `Auto-accepting in ${formatted}`;
    }

    updateCountdown();
    waitCountdownInterval = setInterval(updateCountdown, 1000);
}

function hideActiveWaitCard() {
    activeWaitRequest = null;
    VoiceAnnouncer.resetWaitDedup();
    if (waitCountdownInterval) clearInterval(waitCountdownInterval);
    document.getElementById("waitRequestCard")?.classList.add("hidden");
}

async function handleSkipActiveWait() {
    if (!activeWaitRequest) return;

    const firstStudentRequestId = activeWaitRequest.students?.[0]?.request_id;
    if (!firstStudentRequestId) return;

    const skipBtn = document.getElementById("skipWaitBtn");
    if (skipBtn) {
        skipBtn.disabled = true;
        skipBtn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true"><use href="icons.svg#icon-spinner"/></svg>`;
    }

    const token = getToken();

    try {
        const response = await fetch(`${API_BASE}/driver/wait-request/${firstStudentRequestId}/skip`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            KambusNotify.notify({
                type: "warning",
                title: "Wait skipped",
                message: `Wait request at ${activeWaitRequest.stop_name} was skipped.`
            });
            hideActiveWaitCard();
            setTimeout(loadActiveWaitRequests, 500);
        } else {
            throw new Error(data.detail || "Unable to skip");
        }
    } catch (e) {
        KambusNotify.notify({
            type: "error",
            title: "Skip failed",
            message: e.message || "Please try again."
        });
    } finally {
        if (skipBtn) {
            skipBtn.disabled = false;
            skipBtn.innerHTML = `<svg class="w-3 h-3 shrink-0" aria-hidden="true"><use href="icons.svg#icon-forward-step"/></svg><span>SKIP</span>`;
        }
    }
}

// ========================================================================
// UTILITY HELPERS: DISTANCE CALCULATION
// ========================================================================

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius in meters
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ========================================================================
// DRIVER UTILITY & MODAL CONTROLLERS (PASS SCANNER, DETOUR, SOS)
// ========================================================================

let scannerStream = null;
let scannerScanInterval = null;
let scannerFallbackTimeout = null;
let scannerFallbackStarted = false;
let scannerHasDecoded = false;
let isQuaggaLiveScanning = false;
let quaggaDetectedHandler = null;
let currentDetourReason = "Road Construction";
let currentDetourDelay = 10;
let currentSosType = "Vehicle Breakdown";
let isVerifyingPass = false;

// 1. STUDENT PASS SCANNER & LOOKUP
function verifyStudentPass() {
    openPassScannerModal();
}
window.verifyStudentPass = verifyStudentPass;

function openPassScannerModal() {
    const modal = document.getElementById("passScannerModal");
    if (!modal) return;

    modal.classList.remove("hidden");
    const resultCard = document.getElementById("passResultCard");
    if (resultCard) resultCard.classList.add("hidden");
    const errorCard = document.getElementById("passErrorCard");
    if (errorCard) errorCard.classList.add("hidden");

    const rollInput = document.getElementById("manualRollInput");
    if (rollInput) {
        rollInput.value = "";
        setTimeout(() => rollInput.focus(), 150);
    }
}
window.openPassScannerModal = openPassScannerModal;

function closePassScannerModal() {
    const modal = document.getElementById("passScannerModal");
    if (modal) modal.classList.add("hidden");

    stopCameraScanner();
}
window.closePassScannerModal = closePassScannerModal;

async function startCameraScanner() {
    const video = document.getElementById("scannerVideo");
    const placeholder = document.getElementById("scannerPlaceholder");
    const laser = document.getElementById("scannerLaser");

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Camera API not supported in this browser/WebView.");
        }

        // Try environment camera first, then any camera
        try {
            scannerStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
            });
        } catch (e) {
            scannerStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        if (video) {
            video.srcObject = scannerStream;
            video.classList.remove("hidden");
            if (placeholder) placeholder.classList.add("hidden");
            if (laser) laser.classList.remove("hidden");
            await video.play().catch(() => {});
        }

        scannerFallbackStarted = false;
        scannerHasDecoded = false;
        console.info("[PassScanner] camera stream started", {
            nativeBarcodeDetector: 'BarcodeDetector' in window,
            trackCount: scannerStream?.getVideoTracks().length || 0
        });

        // Try the native detector first. QuaggaJS takes over if it is absent
        // or has not decoded a barcode after a short active scan window.
        startBarcodeDetectionLoop(video);

    } catch (err) {
        console.warn("Camera start failed, falling back to manual/file:", err);
        KambusNotify.notify({
            type: "warning",
            title: "Camera Access",
            message: "Camera not available. Please enter the Roll Number or upload a pass image."
        });
    }
}
window.startCameraScanner = startCameraScanner;

function startBarcodeDetectionLoop(video) {
    const nativeBarcodeDetectorAvailable = 'BarcodeDetector' in window;
    console.info("[PassScanner] BarcodeDetector availability", nativeBarcodeDetectorAvailable);
    if (!nativeBarcodeDetectorAvailable) {
        startQuaggaFallback(video, "native BarcodeDetector unavailable");
        return;
    }

    try {
        const barcodeDetector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'data_matrix'] });
        console.info("[PassScanner] BarcodeDetector scan loop started");

        if (scannerFallbackTimeout) clearTimeout(scannerFallbackTimeout);
        scannerFallbackTimeout = setTimeout(() => {
            console.info("[PassScanner] native fallback timeout fired", {
                scannerHasDecoded,
                scannerFallbackStarted,
                hasStream: Boolean(scannerStream)
            });
            if (!scannerHasDecoded) startQuaggaFallback(video, "no native decode after 4 seconds");
        }, 4000);
        console.info("[PassScanner] native fallback timeout registered", { timeoutMs: 4000 });

        if (scannerScanInterval) clearInterval(scannerScanInterval);
        scannerScanInterval = setInterval(async () => {
            if (!scannerStream || !video || video.readyState < 2 || isVerifyingPass) return;
            try {
                console.debug("[PassScanner] native detection attempt");
                const barcodes = await barcodeDetector.detect(video);
                console.debug("[PassScanner] native detection result", { count: barcodes?.length || 0 });
                if (barcodes && barcodes.length > 0) {
                    const rawVal = barcodes[0].rawValue;
                    if (rawVal) handleDecodedPass(rawVal);
                }
            } catch (scanErr) {
                console.debug("[PassScanner] native detection frame error", scanErr);
            }
        }, 500);
    } catch (err) {
        console.warn("Barcode detector init error:", err);
        startQuaggaFallback(video, "native BarcodeDetector initialization failed");
    }
}

function stopBarcodeDetectionLoops() {
    console.info("[PassScanner] stopping decoder loops", {
        nativeLoop: Boolean(scannerScanInterval),
        fallbackTimeout: Boolean(scannerFallbackTimeout),
        quaggaLive: isQuaggaLiveScanning
    });
    if (scannerScanInterval) {
        clearInterval(scannerScanInterval);
        scannerScanInterval = null;
    }
    if (scannerFallbackTimeout) {
        clearTimeout(scannerFallbackTimeout);
        scannerFallbackTimeout = null;
    }
}

function handleDecodedPass(rawValue) {
    if (!rawValue || scannerHasDecoded || isVerifyingPass) {
        console.debug("[PassScanner] decoded value ignored", { hasValue: Boolean(rawValue), scannerHasDecoded, isVerifyingPass });
        return;
    }
    console.info("[PassScanner] barcode decoded; sending existing verification request");
    scannerHasDecoded = true;
    stopBarcodeDetectionLoops();
    stopQuaggaLiveScanner();
    void verifyStudentPassBackend(rawValue);
}

function startQuaggaFallback(video, reason = "unspecified") {
    console.info("[PassScanner] startQuaggaFallback called", {
        reason,
        scannerFallbackStarted,
        scannerHasDecoded,
        hasStream: Boolean(scannerStream),
        hasVideo: Boolean(video),
        quaggaAvailable: Boolean(window.Quagga)
    });
    if (scannerFallbackStarted || !scannerStream || !video) return;
    scannerFallbackStarted = true;
    stopBarcodeDetectionLoops();

    if (!window.Quagga) {
        console.warn("QuaggaJS is unavailable; use manual roll-number entry.");
        KambusNotify.notify({
            type: "warning",
            title: "Barcode scanner unavailable",
            message: "Please enter the Roll Number manually."
        });
        return;
    }

    // Quagga LiveStream owns its own camera track, so release the native
    // preview before starting it to avoid two consumers competing for camera focus.
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
    video.srcObject = null;
    video.classList.add("hidden");

    const viewport = document.getElementById("quaggaViewport");
    if (!viewport) return;
    viewport.innerHTML = "";
    viewport.classList.remove("hidden");

    console.info("[PassScanner] starting QuaggaJS LiveStream scanner", { reason });
    window.Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: viewport,
            constraints: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            size: 1600
        },
        numOfWorkers: 2,
        frequency: 10,
        locate: true,
        locator: {
            patchSize: "small",
            halfSample: false
        },
        decoder: { readers: ["code_128_reader", "code_39_reader"] }
    }, error => {
        if (error) {
            console.warn("[PassScanner] QuaggaJS LiveStream initialization failed", error);
            viewport.classList.add("hidden");
            document.getElementById("scannerPlaceholder")?.classList.remove("hidden");
            document.getElementById("scannerLaser")?.classList.add("hidden");
            KambusNotify.notify({
                type: "warning",
                title: "Barcode scanner unavailable",
                message: "Please enter the Roll Number manually."
            });
            return;
        }

        isQuaggaLiveScanning = true;
        quaggaDetectedHandler = result => {
            const code = result?.codeResult?.code;
            console.debug("[PassScanner] QuaggaJS LiveStream detection result", { decoded: Boolean(code) });
            if (code) handleDecodedPass(code);
        };
        window.Quagga.onDetected(quaggaDetectedHandler);
        window.Quagga.start();
        console.info("[PassScanner] QuaggaJS LiveStream scanner started");
    });
}

function stopQuaggaLiveScanner() {
    const viewport = document.getElementById("quaggaViewport");
    if (window.Quagga && quaggaDetectedHandler && typeof window.Quagga.offDetected === "function") {
        window.Quagga.offDetected(quaggaDetectedHandler);
    }
    quaggaDetectedHandler = null;
    if (window.Quagga && isQuaggaLiveScanning) {
        try {
            window.Quagga.stop();
        } catch (error) {
            console.warn("[PassScanner] QuaggaJS stop failed", error);
        }
    }
    isQuaggaLiveScanning = false;
    if (viewport) {
        viewport.innerHTML = "";
        viewport.classList.add("hidden");
    }
}

async function handleQrFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!('BarcodeDetector' in window)) {
        KambusNotify.notify({
            type: "info",
            title: "Pass image selected",
            message: "Please enter the roll number directly below to verify."
        });
        return;
    }

    try {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await img.decode();

        const barcodeDetector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39'] });
        const barcodes = await barcodeDetector.detect(img);

        if (barcodes && barcodes.length > 0) {
            await verifyStudentPassBackend(barcodes[0].rawValue);
        } else {
            KambusNotify.notify({
                type: "warning",
                title: "QR Not Detected",
                message: "Could not read QR from the uploaded image. Please enter roll number."
            });
        }
    } catch (err) {
        console.warn("QR File decode error:", err);
    }
}
window.handleQrFileUpload = handleQrFileUpload;

function stopCameraScanner() {
    console.info("[PassScanner] camera scanner stopped");
    stopBarcodeDetectionLoops();
    stopQuaggaLiveScanner();
    scannerFallbackStarted = false;
    scannerHasDecoded = false;
    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
        scannerStream = null;
    }
    const video = document.getElementById("scannerVideo");
    const placeholder = document.getElementById("scannerPlaceholder");
    const laser = document.getElementById("scannerLaser");
    if (video) {
        video.srcObject = null;
        video.classList.add("hidden");
    }
    if (placeholder) placeholder.classList.remove("hidden");
    if (laser) laser.classList.add("hidden");
}

async function handleManualPassLookup(event) {
    if (event) event.preventDefault();

    const rollInput = document.getElementById("manualRollInput");
    const rawQuery = rollInput ? rollInput.value.trim().toUpperCase() : "";

    if (!rawQuery) {
        KambusNotify.notify({
            type: "warning",
            title: "Roll Number Required",
            message: "Please enter a valid student roll number."
        });
        return;
    }

    await verifyStudentPassBackend(rawQuery);
}
window.handleManualPassLookup = handleManualPassLookup;

// REAL BACKEND PASS VERIFICATION
async function verifyStudentPassBackend(queryStr) {
    queryStr = typeof queryStr === "string" ? queryStr.trim() : "";
    if (/^data:image\//i.test(queryStr)) {
        console.error("[PassScanner] refused image frame data as a verification query");
        KambusNotify.notify({
            type: "error",
            title: "Invalid scanner value",
            message: "The scanner returned an image frame instead of a barcode value. Please scan again or enter the Roll Number."
        });
        return;
    }
    if (isVerifyingPass) return;
    isVerifyingPass = true;

    const resultCard = document.getElementById("passResultCard");
    const errorCard = document.getElementById("passErrorCard");
    const submitBtn = document.getElementById("verifyPassSubmitBtn");

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Checking…";
    }

    const token = getToken();
    try {
        console.info("[PassScanner] verify-pass request query:", queryStr);
        const response = await fetch(`${API_BASE}/driver/verify-pass`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                query: queryStr,
                latitude: lastPosition ? lastPosition.latitude : null,
                longitude: lastPosition ? lastPosition.longitude : null
            })
        });

        const data = await response.json();

        if (response.ok && data.valid) {
            // SUCCESSFUL PASS VALIDATION
            if (errorCard) errorCard.classList.add("hidden");
            if (resultCard) {
                const nameElem = document.getElementById("passStudentName");
                const rollElem = document.getElementById("passStudentRoll");
                const stopElem = document.getElementById("passStopName");
                const busElem = document.getElementById("passBusNum");
                const timeElem = document.getElementById("passVerifiedTime");
                const badgeElem = document.getElementById("passBadgeStatus");

                if (nameElem) nameElem.textContent = data.student_name || "Student";
                if (rollElem) rollElem.textContent = `Roll: ${data.roll_number || queryStr} • ${data.department || "General"}`;
                if (stopElem) stopElem.textContent = data.stop_name || "Route Stop";
                if (busElem) busElem.textContent = `Bus ${data.bus_number || "—"}`;
                if (timeElem) timeElem.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                if (badgeElem) {
                    if (data.status === "warning_not_travelling") {
                        badgeElem.className = "text-[11px] font-black tracking-wider uppercase text-warn bg-warn/10 border border-warn/20 px-2.5 py-1 rounded";
                        badgeElem.textContent = "MARKED NOT TRAVELLING";
                    } else {
                        badgeElem.className = "text-[11px] font-black tracking-wider uppercase text-ok bg-ok/10 border border-ok/20 px-2.5 py-1 rounded";
                        badgeElem.textContent = "PASS VALID & ACTIVE";
                    }
                }

                resultCard.classList.remove("hidden");
            }

            // Haptic/audio vibration on device if supported
            if (navigator.vibrate) navigator.vibrate(100);

            KambusNotify.notify({
                type: "success",
                title: "Student Verified",
                message: `${data.student_name} (${data.roll_number}) boarded for ${data.stop_name}.`
            });

        } else {
            // FAILED / INVALID PASS
            if (resultCard) resultCard.classList.add("hidden");
            if (errorCard) {
                const errTitle = document.getElementById("passErrorTitle");
                const errMsg = document.getElementById("passErrorMessage");
                if (errTitle) errTitle.textContent = "Invalid Student Pass";
                if (errMsg) errMsg.textContent = data.detail || "Student not found or assigned to another bus.";
                errorCard.classList.remove("hidden");
            }

            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

            KambusNotify.notify({
                type: "error",
                title: "Pass Invalid",
                message: data.detail || "Student pass could not be verified."
            });
        }
    } catch (err) {
        console.error("Pass verification network error:", err);
        if (errorCard) {
            const errMsg = document.getElementById("passErrorMessage");
            if (errMsg) errMsg.textContent = "Network error communicating with server.";
            errorCard.classList.remove("hidden");
        }
    } finally {
        isVerifyingPass = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Verify";
        }
    }
}

// 2. REAL BACKEND ROUTE DETOUR REPORTING
function reportDetour() {
    openDetourModal();
}
window.reportDetour = reportDetour;

function openDetourModal() {
    const modal = document.getElementById("detourModal");
    if (modal) modal.classList.remove("hidden");
}
window.openDetourModal = openDetourModal;

function closeDetourModal() {
    const modal = document.getElementById("detourModal");
    if (modal) modal.classList.add("hidden");
}
window.closeDetourModal = closeDetourModal;

function selectDetourReason(button, reason) {
    currentDetourReason = reason;
    const allButtons = document.querySelectorAll(".detourReasonBtn");
    allButtons.forEach(btn => {
        btn.className = "detourReasonBtn py-2.5 px-3 rounded border border-line bg-surface text-ink font-bold text-left";
    });
    button.className = "detourReasonBtn py-2.5 px-3 rounded border border-warn bg-warn/10 text-warn font-black text-left";
}
window.selectDetourReason = selectDetourReason;

function selectDetourDelay(button, minutes) {
    currentDetourDelay = Number(minutes);
    const allButtons = document.querySelectorAll(".detourDelayBtn");
    allButtons.forEach(btn => {
        btn.className = "detourDelayBtn py-2 rounded border border-line bg-surface text-ink";
    });
    button.className = "detourDelayBtn py-2 rounded border border-warn bg-warn/10 text-warn font-black";
}
window.selectDetourDelay = selectDetourDelay;

async function submitDetourReport() {
    const submitBtn = document.getElementById("submitDetourBtn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Broadcasting…";
    }

    const token = getToken();
    try {
        const response = await fetch(`${API_BASE}/driver/report-detour`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                reason: currentDetourReason,
                delay_minutes: currentDetourDelay
            })
        });

        const data = await response.json();
        const banner = document.getElementById("activeDetourBanner");
        const textElem = document.getElementById("activeDetourText");

        if (banner && textElem) {
            textElem.textContent = `Active Detour: ${currentDetourReason} (+${currentDetourDelay} min delay)`;
            banner.classList.remove("hidden");
        }

        closeDetourModal();

        KambusNotify.notify({
            type: "warning",
            title: "Detour Broadcasted",
            message: data.message || `Dispatch & students alerted: ${currentDetourReason} (+${currentDetourDelay}m).`
        });
    } catch (err) {
        console.error("Detour report error:", err);
        closeDetourModal();
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Broadcast Detour to Students & Admin";
        }
    }
}
window.submitDetourReport = submitDetourReport;

function clearDetourReport() {
    const banner = document.getElementById("activeDetourBanner");
    if (banner) banner.classList.add("hidden");

    KambusNotify.notify({
        type: "info",
        title: "Detour Cleared",
        message: "Normal route travel resumed."
    });
}
window.clearDetourReport = clearDetourReport;

// 3. REAL BACKEND EMERGENCY SOS & BREAKDOWN
function triggerEmergencySOS() {
    openSosModal();
}
window.triggerEmergencySOS = triggerEmergencySOS;

function openSosModal() {
    const modal = document.getElementById("sosModal");
    if (modal) modal.classList.remove("hidden");
}
window.openSosModal = openSosModal;

function closeSosModal() {
    const modal = document.getElementById("sosModal");
    if (modal) modal.classList.add("hidden");
}
window.closeSosModal = closeSosModal;

function selectSosType(button, type) {
    currentSosType = type;
    const allButtons = document.querySelectorAll(".sosTypeBtn");
    allButtons.forEach(btn => {
        btn.className = "sosTypeBtn py-2.5 px-3 rounded border border-line bg-surface text-ink font-bold text-left";
    });
    button.className = "sosTypeBtn py-2.5 px-3 rounded border border-danger bg-danger/10 text-danger font-black text-left";
}
window.selectSosType = selectSosType;

async function submitEmergencySos() {
    const submitBtn = document.getElementById("submitSosBtn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Transmitting SOS…";
    }

    const token = getToken();
    try {
        const response = await fetch(`${API_BASE}/driver/emergency-sos`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                incident_type: currentSosType,
                latitude: lastPosition ? lastPosition.latitude : null,
                longitude: lastPosition ? lastPosition.longitude : null
            })
        });

        const data = await response.json();
        const banner = document.getElementById("activeSosBanner");
        const textElem = document.getElementById("activeSosText");

        if (banner && textElem) {
            textElem.textContent = `SOS ACTIVE: ${currentSosType} — Authorities & Dispatch Alerted`;
            banner.classList.remove("hidden");
        }

        closeSosModal();

        KambusNotify.notify({
            type: "error",
            title: "EMERGENCY SOS DISPATCHED",
            message: data.message || `College Transport Cell & Emergency services notified of ${currentSosType}.`
        });
    } catch (err) {
        console.error("SOS report error:", err);
        closeSosModal();
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "TRANSMIT EMERGENCY SOS";
        }
    }
}
window.submitEmergencySos = submitEmergencySos;

function cancelEmergencySos() {
    const banner = document.getElementById("activeSosBanner");
    if (banner) banner.classList.add("hidden");

    KambusNotify.notify({
        type: "info",
        title: "Emergency Status Cleared",
        message: "SOS alert has been stood down."
    });
}
window.cancelEmergencySos = cancelEmergencySos;

// Close modals when clicking background overlay or pressing Escape
document.addEventListener("click", event => {
    const passModal = document.getElementById("passScannerModal");
    const detourModal = document.getElementById("detourModal");
    const sosModal = document.getElementById("sosModal");

    if (event.target === passModal) closePassScannerModal();
    if (event.target === detourModal) closeDetourModal();
    if (event.target === sosModal) closeSosModal();
});

document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    closePassScannerModal();
    closeDetourModal();
    closeSosModal();
});
