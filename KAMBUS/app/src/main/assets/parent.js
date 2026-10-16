// ========================================================================
// KAMBUS - Parent Portal: Multi-Child Live Tracking & Attendance History
// ========================================================================

(function () {
    "use strict";

    // --------------------------------------------------------------------
    // Configuration & Constants
    // --------------------------------------------------------------------
    const API_BASE = window.KAMBUS_API_BASE ||
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
            ? "http://127.0.0.1:8000"
            : "https://kambus-backend.onrender.com");

    // 8 distinct, accessible color themes for linked children
    const CHILD_PALETTE = [
        {
            id: "blue",
            name: "Blue",
            primary: "#2563eb",
            secondary: "#1d4ed8",
            bgLight: "#eff6ff",
            border: "#bfdbfe",
            text: "#1e40af",
            badgeBg: "#dbeafe",
            badgeText: "#1e40af"
        },
        {
            id: "emerald",
            name: "Emerald",
            primary: "#059669",
            secondary: "#047857",
            bgLight: "#ecfdf5",
            border: "#a7f3d0",
            text: "#065f46",
            badgeBg: "#d1fae5",
            badgeText: "#065f46"
        },
        {
            id: "amber",
            name: "Amber",
            primary: "#d97706",
            secondary: "#b45309",
            bgLight: "#fffbeb",
            border: "#fde68a",
            text: "#92400e",
            badgeBg: "#fef3c7",
            badgeText: "#92400e"
        },
        {
            id: "purple",
            name: "Purple",
            primary: "#7c3aed",
            secondary: "#6d28d9",
            bgLight: "#f5f3ff",
            border: "#ddd6fe",
            text: "#5b21b6",
            badgeBg: "#ede9fe",
            badgeText: "#5b21b6"
        },
        {
            id: "rose",
            name: "Rose",
            primary: "#e11d48",
            secondary: "#be123c",
            bgLight: "#fff1f2",
            border: "#fecdd3",
            text: "#9f1239",
            badgeBg: "#ffe4e6",
            badgeText: "#9f1239"
        },
        {
            id: "teal",
            name: "Teal",
            primary: "#0d9488",
            secondary: "#0f766e",
            bgLight: "#f0fdfa",
            border: "#99f6e4",
            text: "#115e59",
            badgeBg: "#ccfbf1",
            badgeText: "#115e59"
        },
        {
            id: "orange",
            name: "Orange",
            primary: "#ea580c",
            secondary: "#c2410c",
            bgLight: "#fff7ed",
            border: "#fed7aa",
            text: "#9a3412",
            badgeBg: "#ffedd5",
            badgeText: "#9a3412"
        },
        {
            id: "indigo",
            name: "Indigo",
            primary: "#4f46e5",
            secondary: "#4338ca",
            bgLight: "#eef2ff",
            border: "#c7d2fe",
            text: "#3730a3",
            badgeBg: "#e0e7ff",
            badgeText: "#3730a3"
        }
    ];

    function getChildColor(index) {
        return CHILD_PALETTE[index % CHILD_PALETTE.length];
    }

    // --------------------------------------------------------------------
    // State Management
    // --------------------------------------------------------------------
    let parentData = null;
    let linkedChildren = [];
    let busLocations = {}; // bus_id -> location object
    let tripHistoryData = null;
    let activeTab = "live"; // "live" | "history"
    let historyFilterChildId = "all";
    let pollTimer = null;
    let expandedChildIds = new Set();

    // Leaflet map objects
    let map = null;
    let busMarkers = {}; // bus_id -> L.Marker
    let stopMarkers = {}; // child_id -> L.Marker
    let routePolylines = {}; // child_id -> L.Polyline

    // --------------------------------------------------------------------
    // Utility Functions
    // --------------------------------------------------------------------
    function getToken() {
        return localStorage.getItem("kambus_token");
    }

    function getRole() {
        return localStorage.getItem("kambus_role");
    }

    function escapeHtml(str) {
        return String(str ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[c]);
    }

    function distanceInMetres(lat1, lon1, lat2, lon2) {
        const toRad = deg => (deg * Math.PI) / 180;
        const R = 6371000;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function formatTime(isoStr) {
        if (!isoStr) return "--";
        try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return isoStr;
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return isoStr;
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return "--";
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) {
            return dateStr;
        }
    }

    // --------------------------------------------------------------------
    // Authentication & Session
    // --------------------------------------------------------------------
    function checkAuth() {
        const token = getToken();
        const role = getRole();
        if (!token || role !== "parent") {
            showLoginView();
            return false;
        }
        return true;
    }

    function showLoginView() {
        const loginView = document.getElementById("parentLoginView");
        const zeroView = document.getElementById("zeroChildrenView");
        const liveView = document.getElementById("liveTrackingView");
        const historyView = document.getElementById("tripHistoryView");
        const tabBar = document.getElementById("parentTabBar");

        if (loginView) loginView.classList.remove("hidden");
        if (zeroView) zeroView.classList.add("hidden");
        if (liveView) liveView.classList.add("hidden");
        if (historyView) historyView.classList.add("hidden");
        if (tabBar) tabBar.classList.add("hidden");

        const headerName = document.getElementById("headerParentName");
        if (headerName) headerName.textContent = "Please sign in";

        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function hideLoginView() {
        const loginView = document.getElementById("parentLoginView");
        const tabBar = document.getElementById("parentTabBar");
        if (loginView) loginView.classList.add("hidden");
        if (tabBar) tabBar.classList.remove("hidden");
    }

    async function handleLoginForm(event) {
        event.preventDefault();
        const errEl = document.getElementById("parentLoginError");
        const submitBtn = document.getElementById("btnParentSignIn");
        const phoneOrId = document.getElementById("loginPhoneOrId")?.value.trim();
        const password = document.getElementById("loginPassword")?.value;
        const rememberMe = document.getElementById("loginRememberMe")?.checked;

        if (errEl) {
            errEl.classList.add("hidden");
            errEl.textContent = "";
        }

        if (!phoneOrId || !password) {
            if (errEl) {
                errEl.textContent = "Please enter both Phone / Login ID and password.";
                errEl.classList.remove("hidden");
            }
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Signing in...</span>`;
        }

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    identifier: phoneOrId,
                    password: password,
                    role: "parent"
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || "Invalid login credentials. Please try again.");
            }

            if (!data.access_token || data.role !== "parent") {
                throw new Error("Invalid parent session received from server.");
            }

            localStorage.setItem("kambus_token", data.access_token);
            localStorage.setItem("kambus_role", data.role);
            localStorage.setItem("kambus_user_id", data.user_id || "");

            if (rememberMe) {
                localStorage.setItem("kambus_remember", "true");
                localStorage.setItem("kambus_saved_identifier", phoneOrId);
                localStorage.setItem("kambus_saved_role", "parent");
            }

            hideLoginView();
            await registerDeviceToken();
            await initApp();

            if (typeof notifyUser === "function") {
                notifyUser("ok", "Welcome", "Signed in successfully.");
            }

        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message;
                errEl.classList.remove("hidden");
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span>Sign In</span><svg class="w-4 h-4" aria-hidden="true"><use href="icons.svg#icon-arrow-right"/></svg>`;
            }
        }
    }

    function togglePasswordVisible() {
        const input = document.getElementById("loginPassword");
        const icon = document.getElementById("loginEyeIcon");
        if (!input || !icon) return;
        const isPassword = input.type === "password";
        input.type = isPassword ? "text" : "password";
        icon.innerHTML = `<use href="icons.svg#icon-${isPassword ? 'eye-slash' : 'eye'}"/>`;
    }

    function logout() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        localStorage.removeItem("kambus_token");
        localStorage.removeItem("kambus_role");
        localStorage.removeItem("kambus_user_id");
        window.location.replace("index.html");
    }

    // --------------------------------------------------------------------
    // Device Token Registration (Push Notifications)
    // --------------------------------------------------------------------
    async function registerDeviceToken() {
        const token = getToken();
        if (!token) return;

        let deviceToken = localStorage.getItem("kambus_parent_device_token");
        if (!deviceToken) {
            try {
                if (window.AndroidInterface && typeof window.AndroidInterface.getDeviceToken === "function") {
                    deviceToken = window.AndroidInterface.getDeviceToken();
                }
            } catch (e) {}

            if (!deviceToken) {
                deviceToken = "parent-web-" + Math.random().toString(36).substring(2, 12);
                localStorage.setItem("kambus_parent_device_token", deviceToken);
            }
        }

        try {
            await fetch(`${API_BASE}/parent/device-token`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ device_token: deviceToken })
            });
        } catch (e) {
            // Silently continue if device token fails
        }
    }

    // --------------------------------------------------------------------
    // Leaflet Map Initialization
    // --------------------------------------------------------------------
    function initMap() {
        if (map) return;
        const mapContainer = document.getElementById("map");
        if (!mapContainer || typeof L === "undefined") return;

        // Default center Warangal / Telangana area
        map = L.map("map", {
            zoomControl: true,
            attributionControl: false
        }).setView([17.51, 78.52], 13);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19
        }).addTo(map);
    }

    function fitAllMarkers() {
        if (!map) return;
        const latLngs = [];

        // Collect all bus locations
        Object.values(busLocations).forEach(loc => {
            if (loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))) {
                latLngs.push([Number(loc.latitude), Number(loc.longitude)]);
            }
        });

        // Collect all children stop locations
        linkedChildren.forEach(child => {
            if (Number.isFinite(Number(child.stop_latitude)) && Number.isFinite(Number(child.stop_longitude))) {
                latLngs.push([Number(child.stop_latitude), Number(child.stop_longitude)]);
            }
        });

        if (latLngs.length === 1) {
            map.setView(latLngs[0], 15);
        } else if (latLngs.length > 1) {
            map.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50], maxZoom: 16 });
        }
    }

    function focusChildOnMap(childIndex) {
        if (!map) return;
        const child = linkedChildren[childIndex];
        if (!child) return;

        const points = [];
        const busLoc = child.bus_id ? busLocations[child.bus_id] : null;

        if (busLoc && Number.isFinite(Number(busLoc.latitude))) {
            points.push([Number(busLoc.latitude), Number(busLoc.longitude)]);
        }
        if (Number.isFinite(Number(child.stop_latitude))) {
            points.push([Number(child.stop_latitude), Number(child.stop_longitude)]);
        }

        if (points.length === 1) {
            map.setView(points[0], 16);
        } else if (points.length > 1) {
            map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 16 });
        }

        // Open bus marker popup if available
        if (child.bus_id && busMarkers[child.bus_id]) {
            busMarkers[child.bus_id].openPopup();
        }
    }

    // --------------------------------------------------------------------
    // Custom Marker Icons (Child Color Coded)
    // --------------------------------------------------------------------
    function createBusMarkerIcon(color, busNumber, childNames) {
        const namesLabel = childNames.length > 1 ? `${childNames.length} children` : (childNames[0] || "");
        return L.divIcon({
            className: "leaflet-div-icon",
            html: `
                <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
                    <div class="bus-marker-bubble" style="background:${color.primary};border:2px solid #ffffff;">
                        <svg style="width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:2.2;" viewBox="0 0 24 24"><use href="icons.svg#icon-bus"/></svg>
                        <span>Bus ${escapeHtml(busNumber || '')}</span>
                    </div>
                    <div class="bus-marker-arrow" style="border-top:6px solid ${color.primary};"></div>
                    <span style="font-size:10px;font-weight:700;background:rgba(255,255,255,0.95);color:${color.text};padding:1px 6px;border-radius:4px;border:1px solid ${color.border};box-shadow:0 2px 4px rgba(0,0,0,0.1);margin-top:2px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        ${escapeHtml(namesLabel)}
                    </span>
                </div>
            `,
            iconSize: [90, 52],
            iconAnchor: [45, 26],
            popupAnchor: [0, -26]
        });
    }

    function createStopMarkerIcon(color, stopName, childName) {
        return L.divIcon({
            className: "leaflet-div-icon",
            html: `
                <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
                    <div class="stop-marker-bubble" style="border-color:${color.primary};color:${color.primary};">
                        <svg style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.2;" viewBox="0 0 24 24"><use href="icons.svg#icon-map-pin"/></svg>
                    </div>
                    <span style="font-size:9px;font-weight:700;background:rgba(255,255,255,0.95);color:#0f172a;padding:1px 5px;border-radius:3px;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin-top:2px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        ${escapeHtml(stopName || childName + "'s Stop")}
                    </span>
                </div>
            `,
            iconSize: [80, 44],
            iconAnchor: [40, 22],
            popupAnchor: [0, -22]
        });
    }

    function hasValidCoords(loc) {
        return Boolean(
            loc &&
            loc.latitude !== null &&
            loc.latitude !== undefined &&
            loc.longitude !== null &&
            loc.longitude !== undefined &&
            loc.latitude !== "" &&
            loc.longitude !== "" &&
            Number.isFinite(Number(loc.latitude)) &&
            Number.isFinite(Number(loc.longitude)) &&
            !(Number(loc.latitude) === 0 && Number(loc.longitude) === 0)
        );
    }

    // --------------------------------------------------------------------
    // ETA Calculation (Matching student ETA math)
    // --------------------------------------------------------------------
    function calculateEta(busLoc, child) {
        if (!hasValidCoords(busLoc)) {
            return {
                etaText: "Bus location unavailable",
                subText: "Waiting for driver GPS signal",
                isLive: false,
                distanceText: "--"
            };
        }

        if (child.stop_latitude == null || child.stop_longitude == null || !Number.isFinite(Number(child.stop_latitude))) {
            return {
                etaText: "Stop coordinates unassigned",
                subText: "Contact school admin",
                isLive: false,
                distanceText: "--"
            };
        }

        const distanceM = distanceInMetres(
            Number(busLoc.latitude),
            Number(busLoc.longitude),
            Number(child.stop_latitude),
            Number(child.stop_longitude)
        );

        const distanceText = distanceM >= 1000
            ? `${(distanceM / 1000).toFixed(1)} km`
            : `${Math.round(distanceM)} m`;

        if (distanceM <= 150) {
            return {
                etaText: "Arriving at stop now",
                subText: `${distanceText} away • ${child.stop_name || 'Assigned Stop'}`,
                isLive: true,
                distanceText: distanceText
            };
        }

        let speedKmh = Number(busLoc.speed);
        if (!Number.isFinite(speedKmh) || speedKmh < 5) {
            speedKmh = 25; // default urban school bus speed in km/h
        }

        const minutes = Math.max(1, Math.ceil(distanceM / ((speedKmh * 1000) / 60)));

        return {
            etaText: `~${minutes} min`,
            subText: `${distanceText} away • Heading to ${child.stop_name || 'Stop'}`,
            isLive: true,
            distanceText: distanceText
        };
    }

    // --------------------------------------------------------------------
    // GPS Signal Freshness & Status
    // --------------------------------------------------------------------
    function getGpsStatus(busLoc, child) {
        if (!child.bus_id || !hasValidCoords(busLoc)) {
            return {
                dotClass: "gps-dot-unavailable",
                label: "unavailable",
                textClass: "gps-text-unavailable",
                subText: "Waiting for driver signal"
            };
        }

        const timestamp = busLoc.timestamp;
        const locationTime = timestamp ? Date.parse(timestamp) : NaN;
        if (!Number.isFinite(locationTime)) {
            return {
                dotClass: "gps-dot-unavailable",
                label: "unavailable",
                textClass: "gps-text-unavailable",
                subText: "Waiting for driver signal"
            };
        }

        const now = Date.now();
        const ageMs = now - locationTime;
        const GPS_STALE_AFTER_MS = 90 * 1000;
        const isStale = ageMs > GPS_STALE_AFTER_MS;

        const eta = calculateEta(busLoc, child);

        if (isStale) {
            return {
                dotClass: "gps-dot-stale",
                label: "stale signal",
                textClass: "gps-text-stale",
                subText: eta.isLive ? `${eta.etaText} • ${eta.distanceText}` : "Last updated earlier"
            };
        }

        return {
            dotClass: "gps-dot-live live-pulse-dot",
            label: "live GPS",
            textClass: "gps-text-live",
            subText: eta.isLive ? `${eta.etaText} • ${eta.distanceText}` : "Tracking active"
        };
    }

    function toggleCard(cardKey) {
        const keyStr = String(cardKey);
        const cardEl = document.getElementById(`childCard-${keyStr}`);
        if (!cardEl) return;

        const isExpanded = expandedChildIds.has(keyStr);
        if (isExpanded) {
            expandedChildIds.delete(keyStr);
            cardEl.classList.remove("expanded");
            cardEl.querySelector(".child-card-expandable")?.classList.remove("expanded");
            cardEl.querySelector(".child-card-chevron")?.classList.remove("rotate-180");
            cardEl.setAttribute("aria-expanded", "false");
        } else {
            expandedChildIds.add(keyStr);
            cardEl.classList.add("expanded");
            cardEl.querySelector(".child-card-expandable")?.classList.add("expanded");
            cardEl.querySelector(".child-card-chevron")?.classList.add("rotate-180");
            cardEl.setAttribute("aria-expanded", "true");
        }
    }

    // --------------------------------------------------------------------
    // Data Loading: Children & Live Bus Locations
    // --------------------------------------------------------------------
    async function fetchMyChildren() {
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`${API_BASE}/parent/my-children`, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                }
            });

            if (res.status === 401) {
                logout();
                return;
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Failed to load linked children.");

            parentData = data.parent || {};
            linkedChildren = Array.isArray(data.children) ? data.children : [];

            // Update header info
            const headerName = document.getElementById("headerParentName");
            if (headerName) {
                headerName.textContent = parentData.name ? `Parent: ${parentData.name}` : "Parent Portal";
            }
            const countBadge = document.getElementById("childrenCountBadge");
            if (countBadge) countBadge.textContent = String(linkedChildren.length);
            const tabBadge = document.getElementById("tabBadgeChildrenCount");
            if (tabBadge) tabBadge.textContent = String(linkedChildren.length);

            // Handle zero children state
            if (linkedChildren.length === 0) {
                renderZeroChildrenState();
                return;
            }

            // Normal state: linked children present
            document.getElementById("zeroChildrenView")?.classList.add("hidden");
            if (activeTab === "live") {
                document.getElementById("liveTrackingView")?.classList.remove("hidden");
            }

            initMap();
            renderMapLegend();
            await fetchAllBusLocations();
            renderChildrenCards();
            updateMapVisuals();

        } catch (err) {
            console.error("fetchMyChildren error:", err);
            if (typeof notifyUser === "function") {
                notifyUser("warn", "Notice", err.message);
            }
        }
    }

    function renderZeroChildrenState() {
        document.getElementById("liveTrackingView")?.classList.add("hidden");
        document.getElementById("tripHistoryView")?.classList.add("hidden");
        const zeroView = document.getElementById("zeroChildrenView");
        if (zeroView) zeroView.classList.remove("hidden");

        const nameEl = document.getElementById("zeroParentName");
        const phoneEl = document.getElementById("zeroParentPhone");
        const idEl = document.getElementById("zeroParentId");

        if (nameEl) nameEl.textContent = parentData?.name || "--";
        if (phoneEl) phoneEl.textContent = parentData?.phone || "--";
        if (idEl) idEl.textContent = parentData?.id ? `P-${parentData.id}` : "--";
    }

    async function fetchAllBusLocations() {
        const token = getToken();
        if (!token || linkedChildren.length === 0) return;

        // Collect unique bus IDs
        const uniqueBusIds = [...new Set(linkedChildren.map(c => c.bus_id).filter(Boolean))];

        await Promise.all(uniqueBusIds.map(async busId => {
            try {
                const res = await fetch(`${API_BASE}/buses/${busId}/location`, {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    }
                });
                if (res.ok) {
                    const loc = await res.json();
                    busLocations[busId] = loc;
                }
            } catch (e) {
                // Ignore per-bus location network drop
            }
        }));
    }

    // --------------------------------------------------------------------
    // Rendering: Multi-Child Cards
    // --------------------------------------------------------------------
    function renderChildrenCards() {
        const container = document.getElementById("childrenCardsContainer");
        if (!container) return;

        if (linkedChildren.length === 0) {
            container.innerHTML = `<div class="p-4 text-center text-xs text-ink-muted">No linked children.</div>`;
            return;
        }

        container.innerHTML = linkedChildren.map((child, index) => {
            const cardKey = String(child.id || index);
            const isExpanded = expandedChildIds.has(cardKey);
            const color = getChildColor(index);
            const busLoc = child.bus_id ? busLocations[child.bus_id] : null;
            const eta = calculateEta(busLoc, child);
            const gps = getGpsStatus(busLoc, child);

            // Travel-status pill (right)
            let statusBadgeHtml = "";
            if (child.live_status === "on_bus") {
                statusBadgeHtml = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 live-pulse-dot"></span>
                        <span>On Bus</span>
                    </span>
                `;
            } else if (child.live_status === "dropped") {
                statusBadgeHtml = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        <svg class="w-3.5 h-3.5 text-blue-600" aria-hidden="true"><use href="icons.svg#icon-check"/></svg>
                        <span>Dropped Off</span>
                    </span>
                `;
            } else {
                statusBadgeHtml = `
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                        <span>Not Travelling</span>
                    </span>
                `;
            }

            return `
                <article class="child-card cursor-pointer select-none transition-all duration-200 ${isExpanded ? 'expanded' : ''}"
                         id="childCard-${cardKey}"
                         data-child-id="${cardKey}"
                         onclick="window.parentApp?.toggleCard?.('${cardKey}')"
                         role="button"
                         tabindex="0"
                         aria-expanded="${isExpanded ? 'true' : 'false'}"
                         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.parentApp?.toggleCard?.('${cardKey}');}"
                         style="border-left: 5px solid ${color.primary};">
                    <div class="p-3.5 sm:p-4">
                        <!-- Collapsed Row: Avatar + Name + Roll (left) & Travel-status pill + Chevron (right) -->
                        <div class="flex items-center justify-between gap-3">
                            <!-- Left: Avatar + Name + Roll Number -->
                            <div class="flex items-center gap-2.5 min-w-0">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-xs"
                                     style="background:${color.bgLight};color:${color.text};border:2px solid ${color.border};">
                                    ${escapeHtml((child.name || "C").charAt(0).toUpperCase())}
                                </div>
                                <div class="min-w-0">
                                    <h3 class="text-sm font-bold text-navy truncate">
                                        ${escapeHtml(child.name)}
                                    </h3>
                                    <p class="text-xs text-ink-muted truncate font-mono mt-0.5">
                                        <span>${escapeHtml(child.roll_number || 'No Roll #')}</span>
                                        <span class="font-sans font-semibold ml-1.5" style="color:${color.text};">&middot; Bus ${escapeHtml(child.bus_number || child.bus_id || 'Unassigned')}</span>
                                    </p>
                                </div>
                            </div>

                            <!-- Right: Travel-status pill + Chevron (⌄) -->
                            <div class="flex items-center gap-2 shrink-0">
                                ${statusBadgeHtml}
                                <div class="child-card-chevron-wrapper w-6 h-6 flex items-center justify-center text-ink-muted" title="Toggle card details">
                                    <svg class="w-4 h-4 transition-transform duration-200 child-card-chevron ${isExpanded ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        <!-- Status line below with colored dot: 🟢 live GPS / 🔴 unavailable / 🟡 stale signal -->
                        <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                            <div class="flex items-center gap-1.5 min-w-0">
                                <span class="gps-dot ${gps.dotClass}"></span>
                                <span class="${gps.textClass}">${escapeHtml(gps.label)}</span>
                                <span class="text-slate-300">&middot;</span>
                                <span class="text-ink-muted truncate">${escapeHtml(gps.subText)}</span>
                            </div>
                        </div>

                        <!-- Expanded (on tap): Reveals ROUTE / ASSIGNED STOP two-column block + “Focus Map” button below a divider -->
                        <div class="child-card-expandable ${isExpanded ? 'expanded' : ''}">
                            <div class="child-card-expandable-inner">
                                <div class="pt-3 mt-2.5 border-t border-slate-100 flex flex-col gap-2.5">
                                    <!-- Reveals ROUTE / ASSIGNED STOP two-column block -->
                                    <div class="bg-slate-50 border border-line rounded-lg p-2.5 text-xs grid grid-cols-2 gap-2">
                                        <div>
                                            <span class="text-[10px] uppercase font-bold text-ink-muted block">Route</span>
                                            <span class="font-semibold text-navy truncate block">
                                                ${escapeHtml(child.route_name || 'Standard Route')}
                                            </span>
                                        </div>
                                        <div>
                                            <span class="text-[10px] uppercase font-bold text-ink-muted block">Assigned Stop</span>
                                            <span class="font-semibold text-navy truncate block">
                                                ${escapeHtml(child.stop_name || 'School Stop')}
                                            </span>
                                        </div>
                                    </div>

                                    <!-- “Focus Map” button below a divider -->
                                    <div class="flex items-center justify-between gap-2 pt-0.5">
                                        <div class="text-[11px] text-ink-muted truncate">
                                            ${escapeHtml(eta.subText)}
                                        </div>
                                        <button type="button"
                                                onclick="event.stopPropagation(); window.parentApp?.focusChild?.(${index})"
                                                class="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 shadow-2xs hover:opacity-90 cursor-pointer"
                                                style="background:${color.bgLight};color:${color.text};border-color:${color.border};">
                                            <svg class="w-3.5 h-3.5" aria-hidden="true"><use href="icons.svg#icon-map-pin"/></svg>
                                            <span>Focus Map</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </article>
            `;
        }).join("");
    }

    // --------------------------------------------------------------------
    // Rendering: Interactive Map Legend
    // --------------------------------------------------------------------
    function renderMapLegend() {
        const list = document.getElementById("legendItemsList");
        if (!list) return;

        if (linkedChildren.length === 0) {
            list.innerHTML = "";
            return;
        }

        list.innerHTML = linkedChildren.map((child, index) => {
            const color = getChildColor(index);
            return `
                <button type="button" onclick="window.parentApp?.focusChild?.(${index})"
                        class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition border hover:opacity-90 cursor-pointer shadow-2xs"
                        style="background:${color.bgLight};color:${color.text};border-color:${color.border};"
                        title="Click to zoom to ${escapeHtml(child.name)}">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color.primary};"></span>
                    <span class="truncate max-w-[120px]">${escapeHtml(child.name)}</span>
                    <span class="text-[10px] opacity-75 font-mono">(Bus ${escapeHtml(child.bus_number || child.bus_id || '')})</span>
                </button>
            `;
        }).join("");
    }

    // --------------------------------------------------------------------
    // Map Visuals: Markers, Stops & Connecting Lines
    // --------------------------------------------------------------------
    function updateMapVisuals() {
        if (!map) return;

        // Group children by bus_id to prevent overlapping bus markers
        const busChildrenMap = {};
        linkedChildren.forEach((child, index) => {
            const busId = child.bus_id;
            if (!busId) return;
            if (!busChildrenMap[busId]) {
                busChildrenMap[busId] = {
                    busNumber: child.bus_number || String(busId),
                    children: [],
                    primaryColor: getChildColor(index)
                };
            }
            busChildrenMap[busId].children.push({
                child: child,
                index: index,
                color: getChildColor(index)
            });
        });

        // 1. Update Bus Markers
        Object.keys(busChildrenMap).forEach(busId => {
            const group = busChildrenMap[busId];
            const loc = busLocations[busId];
            if (!hasValidCoords(loc)) return;

            const lat = Number(loc.latitude);
            const lon = Number(loc.longitude);
            const childNames = group.children.map(c => c.child.name);
            const icon = createBusMarkerIcon(group.primaryColor, group.busNumber, childNames);

            if (busMarkers[busId]) {
                busMarkers[busId].setLatLng([lat, lon]);
                busMarkers[busId].setIcon(icon);
            } else {
                const marker = L.marker([lat, lon], { icon: icon }).addTo(map);
                marker.bindPopup(`
                    <div style="font-family:sans-serif;padding:2px;">
                        <strong style="color:#173541;font-size:13px;">Bus ${escapeHtml(group.busNumber)}</strong>
                        <p style="margin:4px 0 0;font-size:11px;color:#475569;">Assigned to: ${escapeHtml(childNames.join(", "))}</p>
                        <p style="margin:2px 0 0;font-size:11px;color:#059669;">Speed: ${Math.round(loc.speed || 0)} km/h</p>
                    </div>
                `);
                busMarkers[busId] = marker;
            }
        });

        // 2. Update Stop Markers & Polylines per child
        linkedChildren.forEach((child, index) => {
            const color = getChildColor(index);
            const childId = child.id;
            const hasStop = Number.isFinite(Number(child.stop_latitude)) && Number.isFinite(Number(child.stop_longitude));

            if (hasStop) {
                const stopLat = Number(child.stop_latitude);
                const stopLon = Number(child.stop_longitude);
                const stopIcon = createStopMarkerIcon(color, child.stop_name, child.name);

                if (stopMarkers[childId]) {
                    stopMarkers[childId].setLatLng([stopLat, stopLon]);
                    stopMarkers[childId].setIcon(stopIcon);
                } else {
                    const marker = L.marker([stopLat, stopLon], { icon: stopIcon }).addTo(map);
                    marker.bindPopup(`
                        <div style="font-family:sans-serif;padding:2px;">
                            <strong style="color:${color.text};font-size:12px;">${escapeHtml(child.name)}'s Stop</strong>
                            <p style="margin:3px 0 0;font-size:11px;color:#173541;">${escapeHtml(child.stop_name || 'Assigned Stop')}</p>
                        </div>
                    `);
                    stopMarkers[childId] = marker;
                }

                // Connect bus location to stop with dashed line in child's color
                const busLoc = child.bus_id ? busLocations[child.bus_id] : null;
                if (busLoc && Number.isFinite(Number(busLoc.latitude))) {
                    const busLatLng = [Number(busLoc.latitude), Number(busLoc.longitude)];
                    const stopLatLng = [stopLat, stopLon];

                    if (routePolylines[childId]) {
                        routePolylines[childId].setLatLngs([busLatLng, stopLatLng]);
                    } else {
                        const line = L.polyline([busLatLng, stopLatLng], {
                            color: color.primary,
                            weight: 3,
                            dashArray: "6, 6",
                            opacity: 0.8
                        }).addTo(map);
                        routePolylines[childId] = line;
                    }
                }
            }
        });
    }

    // --------------------------------------------------------------------
    // 30-Day Trip History
    // --------------------------------------------------------------------
    async function loadTripHistory() {
        const token = getToken();
        if (!token) return;

        const container = document.getElementById("historyContentContainer");
        const filterSelect = document.getElementById("historyChildFilter");

        if (container) {
            container.innerHTML = `
                <div class="text-center py-12 text-xs text-ink-muted">
                    <svg class="w-6 h-6 animate-spin mx-auto mb-2 text-brand" aria-hidden="true"><use href="icons.svg#icon-spinner"/></svg>
                    <span>Loading 30-day boarding and drop records...</span>
                </div>
            `;
        }

        try {
            const res = await fetch(`${API_BASE}/parent/trip-history?days=30`, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                }
            });

            if (res.status === 401) {
                logout();
                return;
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Failed to load trip history.");

            tripHistoryData = data;

            // Populate filter options if needed
            if (filterSelect && filterSelect.options.length <= 1) {
                const existing = new Set();
                tripHistoryData.history.forEach(item => {
                    if (item.child && !existing.has(String(item.child.id))) {
                        existing.add(String(item.child.id));
                        const opt = document.createElement("option");
                        opt.value = String(item.child.id);
                        opt.textContent = item.child.name;
                        filterSelect.appendChild(opt);
                    }
                });
            }

            renderTripHistory();

        } catch (err) {
            if (container) {
                container.innerHTML = `
                    <div class="p-6 text-center text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
                        ${escapeHtml(err.message)}
                    </div>
                `;
            }
        }
    }

    function renderTripHistory() {
        const container = document.getElementById("historyContentContainer");
        if (!container || !tripHistoryData) return;

        const historyItems = tripHistoryData.history || [];
        if (historyItems.length === 0) {
            container.innerHTML = `
                <div class="py-12 text-center text-xs text-ink-muted">
                    <p class="font-semibold text-navy">No trip records found.</p>
                    <p class="mt-1">Scanned boarding and drop events from the last 30 days will appear here.</p>
                </div>
            `;
            return;
        }

        // Apply filter if selected
        const filtered = historyFilterChildId === "all"
            ? historyItems
            : historyItems.filter(item => String(item.child.id) === String(historyFilterChildId));

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="py-8 text-center text-xs text-ink-muted">
                    No records found for the selected child.
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map((item, index) => {
            const child = item.child || {};
            // Match color with linkedChildren index if possible
            const childIdx = linkedChildren.findIndex(c => c.id === child.id);
            const color = getChildColor(childIdx >= 0 ? childIdx : index);
            const events = Array.isArray(item.events) ? item.events : [];

            let eventsHtml = "";
            if (events.length === 0) {
                eventsHtml = `
                    <div class="py-6 text-center text-xs text-ink-muted">
                        No scan events recorded for ${escapeHtml(child.name)} in the last 30 days.
                    </div>
                `;
            } else {
                eventsHtml = `
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs">
                            <thead class="bg-slate-50 border-b border-line text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                                <tr>
                                    <th class="py-2.5 px-3">Date</th>
                                    <th class="py-2.5 px-3">Time</th>
                                    <th class="py-2.5 px-3">Direction</th>
                                    <th class="py-2.5 px-3">Bus</th>
                                    <th class="py-2.5 px-3">Verification</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${events.map(ev => {
                                    const isBoarding = ev.direction === "boarding";
                                    const dirBadge = isBoarding
                                        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                               <svg class="w-3 h-3" aria-hidden="true"><use href="icons.svg#icon-arrow-right"/></svg>
                                               <span>Boarding</span>
                                           </span>`
                                        : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                               <svg class="w-3 h-3" aria-hidden="true"><use href="icons.svg#icon-check"/></svg>
                                               <span>Drop Off</span>
                                           </span>`;

                                    return `
                                        <tr class="hover:bg-slate-50/60 transition">
                                            <td class="py-2.5 px-3 font-medium text-navy whitespace-nowrap">
                                                ${escapeHtml(formatDate(ev.date || ev.timestamp))}
                                            </td>
                                            <td class="py-2.5 px-3 font-mono text-ink-muted whitespace-nowrap">
                                                ${escapeHtml(ev.time || formatTime(ev.timestamp))}
                                            </td>
                                            <td class="py-2.5 px-3 whitespace-nowrap">
                                                ${dirBadge}
                                            </td>
                                            <td class="py-2.5 px-3 font-semibold text-navy whitespace-nowrap">
                                                Bus ${escapeHtml(ev.bus_id || child.bus_number || '--')}
                                            </td>
                                            <td class="py-2.5 px-3 text-ink-muted whitespace-nowrap">
                                                <span class="text-[11px] text-emerald-700 font-medium">QR Verified</span>
                                            </td>
                                        </tr>
                                    `;
                                }).join("")}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            return `
                <div class="border border-line rounded-xl overflow-hidden bg-surface shadow-2xs">
                    <!-- Child Header -->
                    <div class="p-3.5 sm:px-4 bg-slate-50/80 border-b border-line flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <span class="w-3 h-3 rounded-full shrink-0" style="background:${color.primary};"></span>
                            <div class="min-w-0">
                                <h3 class="text-sm font-bold text-navy truncate">${escapeHtml(child.name)}</h3>
                                <p class="text-[11px] text-ink-muted font-mono">
                                    Roll: ${escapeHtml(child.roll_number || '--')} &middot; Assigned Bus: ${escapeHtml(child.bus_number || child.bus_id || '--')}
                                </p>
                            </div>
                        </div>

                        <span class="text-xs font-semibold px-2 py-0.5 rounded bg-white border border-line text-ink-muted shrink-0">
                            ${events.length} scan${events.length === 1 ? '' : 's'}
                        </span>
                    </div>

                    <!-- Events Table -->
                    ${eventsHtml}
                </div>
            `;
        }).join("");
    }

    function filterTripHistory(childId) {
        historyFilterChildId = childId;
        renderTripHistory();
    }

    // --------------------------------------------------------------------
    // Tab Navigation
    // --------------------------------------------------------------------
    function switchTab(tab) {
        activeTab = tab;
        const liveView = document.getElementById("liveTrackingView");
        const historyView = document.getElementById("tripHistoryView");
        const tabBtnLive = document.getElementById("tabBtnLive");
        const tabBtnHistory = document.getElementById("tabBtnHistory");

        if (tab === "live") {
            if (liveView) liveView.classList.remove("hidden");
            if (historyView) historyView.classList.add("hidden");
            tabBtnLive?.classList.add("active");
            tabBtnHistory?.classList.remove("active");
            if (map) {
                setTimeout(() => {
                    map.invalidateSize();
                    fitAllMarkers();
                }, 100);
            }
        } else {
            if (liveView) liveView.classList.add("hidden");
            if (historyView) historyView.classList.remove("hidden");
            tabBtnLive?.classList.remove("active");
            tabBtnHistory?.classList.add("active");
            loadTripHistory();
        }
    }

    // --------------------------------------------------------------------
    // Notification Feed Decorator (Tagging with Child Color)
    // --------------------------------------------------------------------
    function setupNotificationDecorators() {
        const list = document.getElementById("kambusNotificationList");
        if (!list) return;

        const observer = new MutationObserver(() => {
            const items = list.querySelectorAll(".kambus-notification-item");
            items.forEach(item => {
                if (item.dataset.parentEnhanced) return;
                item.dataset.parentEnhanced = "true";

                const strong = item.querySelector("strong");
                const text = strong ? strong.textContent : "";

                // Find matching child
                const matchIndex = linkedChildren.findIndex(c => text.includes(c.name));
                if (matchIndex >= 0) {
                    const child = linkedChildren[matchIndex];
                    const color = getChildColor(matchIndex);

                    const badge = document.createElement("span");
                    badge.style.cssText = `
                        display: inline-block;
                        font-size: 10px;
                        font-weight: 700;
                        padding: 1px 6px;
                        border-radius: 9999px;
                        background: ${color.bgLight};
                        color: ${color.text};
                        border: 1px solid ${color.border};
                        margin-bottom: 4px;
                    `;
                    badge.textContent = child.name;
                    item.insertBefore(badge, item.firstChild);
                }
            });
        });

        observer.observe(list, { childList: true, subtree: true });
    }

    // --------------------------------------------------------------------
    // Polling & Lifecycle
    // --------------------------------------------------------------------
    async function refreshData(forceFull = false) {
        if (!checkAuth()) return;
        await fetchMyChildren();
        if (activeTab === "history" || forceFull) {
            await loadTripHistory();
        }
        if (typeof notifyUser === "function" && forceFull) {
            notifyUser("ok", "Updated", "Latest tracking data loaded.");
        }
    }

    async function initApp() {
        if (!checkAuth()) return;
        hideLoginView();
        await fetchMyChildren();
        setupNotificationDecorators();

        // 10-second polling for live GPS updates while on live tracking
        if (!pollTimer) {
            pollTimer = setInterval(async () => {
                if (activeTab === "live" && linkedChildren.length > 0 && !document.hidden) {
                    await fetchMyChildren();
                }
            }, 10000);
        }
    }

    // --------------------------------------------------------------------
    // DOM Ready Initialization & Global API Export
    // --------------------------------------------------------------------
    document.addEventListener("DOMContentLoaded", () => {
        initApp();
        registerDeviceToken();
    });

    window.parentApp = {
        initApp: initApp,
        switchTab: switchTab,
        focusChild: focusChildOnMap,
        fitAllMarkers: fitAllMarkers,
        filterTripHistory: filterTripHistory,
        refreshData: refreshData,
        handleLoginForm: handleLoginForm,
        togglePasswordVisible: togglePasswordVisible,
        toggleCard: toggleCard,
        logout: logout
    };

})();
