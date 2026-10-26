/**
 * KAMBUS — ADMIN DESK CONTROLLER
 * Authoritative Client Controller for Transport Management Desk
 * Fully integrated with FastAPI Backend & SQLite/PostgreSQL Database Models
 */

(function () {
    "use strict";

    const API_BASE = "https://kambus-backend.onrender.com";
    const WS_BASE = "wss://kambus-backend.onrender.com";
    const COLLEGE_COORDS = [18.054145359568437, 79.53558731724873];

    // State Variables
    let activeSection = "dashboard";
    let liveMap = null;
    let liveBusMarkers = {};
    let liveTrackingInterval = null;
    let stopPickerMap = null;
    let stopPickerMarker = null;
    let stopPickerDropMarker = null;
    let addStopPickMode = "pickup";
    let editStopPickerMap = null;
    let editStopPickerMarker = null;
    let editStopPickerDropMarker = null;
    let editStopPickMode = "pickup";
    let routeMap = null;
    let routeMapLayers = [];
    let adminSocket = null;
    let adminWsTimer = null;
    let cachedBuses = [];
    let cachedDrivers = [];
    let cachedStudents = [];
    let cachedAdmins = [];
    let cachedCampuses = [];
    let cachedRoutes = [];
    let cachedStops = [];
    let cachedComplaints = [];
    let currentViewingBusId = null;
    let selectedStudentIds = new Set();

    // =========================================================================
    // AUTHENTICATION & API REQUEST HELPERS
    // =========================================================================

    function getToken() {
        let token = localStorage.getItem("kambus_token") || localStorage.getItem("token") || "";
        if (!token && window.AndroidSession && typeof window.AndroidSession.getToken === "function") {
            token = window.AndroidSession.getToken() || "";
            if (token) localStorage.setItem("kambus_token", token);
        }
        return token;
    }

    function isSuperAdmin() {
        const role = localStorage.getItem("kambus_role") || localStorage.getItem("role") || "";
        if (role === "super_admin") return true;
        const token = getToken();
        if (!token) return false;
        try {
            const payload = JSON.parse(atob(token.split(".")[1]));
            return payload.role === "super_admin";
        } catch {
            return false;
        }
    }

    function getJwtPayload() {
        const token = getToken();
        if (!token) return null;
        try {
            const parts = token.split(".");
            if (parts.length < 2) return null;
            return JSON.parse(atob(parts[1]));
        } catch {
            return null;
        }
    }

    function isPlatformSuperAdmin() {
        if (!isSuperAdmin()) return false;
        const payload = getJwtPayload();
        // Platform super-admin has role === 'super_admin' AND campus_id == null
        if (payload && payload.campus_id != null) {
            return false;
        }
        return true;
    }

    function getSelectedCampusId() {
        const val = localStorage.getItem("kambus_active_campus_id");
        if (!val || val === "null" || val === "undefined") return null;
        const parsed = parseInt(val, 10);
        return isNaN(parsed) ? null : parsed;
    }

    function setSelectedCampusId(campusId) {
        if (!campusId) {
            localStorage.removeItem("kambus_active_campus_id");
        } else {
            localStorage.setItem("kambus_active_campus_id", String(campusId));
        }
    }

    function applyCampusScope(endpoint, options = {}) {
        if (!isPlatformSuperAdmin()) return endpoint;
        const method = (options.method || "GET").toUpperCase();
        if (method !== "GET") return endpoint;

        const campusId = getSelectedCampusId();
        if (!campusId) return endpoint;

        // Scoped operational list/dashboard endpoints:
        // /admin/dashboard, /admin/buses, /admin/routes, /admin/stops, /admin/students, /admin/parents, /parent/list
        const regex = /^(\/admin\/(dashboard|buses|routes|stops|students|parents)|\/parent\/list)(\?|$)/;
        if (!regex.test(endpoint)) return endpoint;

        if (/[?&]campus_id=/.test(endpoint)) return endpoint;

        const separator = endpoint.includes("?") ? "&" : "?";
        return `${endpoint}${separator}campus_id=${encodeURIComponent(campusId)}`;
    }

    function checkAuth() {
        const token = getToken();
        const role = localStorage.getItem("kambus_role") || localStorage.getItem("role") || "";
        if (!token) {
            window.location.href = "index.html";
            return false;
        }
        if (role && role !== "admin" && role !== "super_admin") {
            if (role === "student") window.location.href = "student.html";
            else if (role === "driver") window.location.href = "driver.html";
            return false;
        }
        return true;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[c]);
    }

    // Safe way to pass a text value into an inline onclick="..." attribute:
    // JSON-quote it (so quotes and backslashes cannot end the string), then HTML-escape it.
    function jsArg(value) {
        return escapeHtml(JSON.stringify(String(value ?? "")));
    }

    function formatDateTime(isoString) {
        if (!isoString) return "-";
        try {
            const d = new Date(isoString);
            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }) +
                " &bull; " + d.toLocaleDateString([], { month: "short", day: "numeric" });
        } catch {
            return isoString;
        }
    }

    function showToast(type, title, message) {
        const toast = document.createElement("div");
        toast.className = `fixed bottom-5 right-5 z-[9999] max-w-sm w-full p-4 rounded border flex items-start gap-3 transition-all duration-300 transform translate-y-2 opacity-0 ${
            type === "error"
                ? "bg-surface text-danger border-danger"
                : type === "warning"
                ? "bg-surface text-warn border-warn"
                : type === "success"
                ? "bg-surface text-ok border-ok"
                : "bg-surface text-ink border-line"
        }`;

        const iconSymbol = type === "error" ? "icon-alert" : type === "warning" ? "icon-alert" : type === "success" ? "icon-check" : "icon-bell";

        toast.innerHTML = `
            <svg class="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true"><use href="icons.svg#${iconSymbol}"/></svg>
            <div class="flex-1 min-w-0">
                <h4 class="text-xs font-black tracking-wide text-ink">${escapeHtml(title)}</h4>
                <p class="text-xs text-ink-muted mt-0.5 leading-relaxed">${escapeHtml(message)}</p>
            </div>
            <button class="text-ink-muted hover:text-ink w-5 h-5 flex items-center justify-center shrink-0" onclick="this.parentElement.remove()">
                <svg class="w-3.5 h-3.5"><use href="icons.svg#icon-xmark"/></svg>
            </button>
        `;

        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove("translate-y-2", "opacity-0");
        }, 20);

        setTimeout(() => {
            toast.classList.add("opacity-0", "translate-y-2");
            setTimeout(() => toast.remove(), 350);
        }, 5000);
    }

    async function apiRequest(endpoint, options = {}) {
        endpoint = applyCampusScope(endpoint, options);
        const token = getToken();
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            ...(options.headers || {})
        };

        const config = {
            ...options,
            headers
        };

        if (options.body && typeof options.body === "object") {
            config.body = JSON.stringify(options.body);
        }

        try {
            const res = await fetch(API_BASE + endpoint, config);
            let data = {};
            try {
                data = await res.json();
            } catch {
                data = {};
            }

            if (!res.ok) {
                if (res.status === 401) {
                    localStorage.removeItem("kambus_token");
                    localStorage.removeItem("kambus_role");
                    localStorage.removeItem("kambus_ops_dashboard");
                    if (window.AndroidSession && typeof window.AndroidSession.clearSession === "function") {
                        try { window.AndroidSession.clearSession(); } catch (_) {}
                    }
                    window.location.href = "index.html";
                    return;
                }
                const errorMsg = data.detail || `Server responded with status ${res.status}`;
                throw new Error(errorMsg);
            }
            return data;
        } catch (error) {
            console.error(`API Request Error [${endpoint}]:`, error);
            throw error;
        }
    }

    // =========================================================================
    // CAMPUS PLAN ENTITLEMENTS & FEATURE GATING
    // =========================================================================

    let adminCampusEntitlements = null;

    async function loadAdminCampusEntitlements(overrideCampusId = null) {
        try {
            const payload = getJwtPayload();
            const campusId = overrideCampusId !== null ? overrideCampusId : (getSelectedCampusId() || (payload ? payload.campus_id : null));
            const endpoint = campusId ? `/campus/me/entitlements?campus_id=${campusId}` : `/me/entitlements`;
            const data = await apiRequest(endpoint);
            if (data && Array.isArray(data.features)) {
                adminCampusEntitlements = data;
                applyAdminFeatureGating();
            }
        } catch (e) {
            console.warn("Could not load campus entitlements:", e);
        }
    }

    function hasAdminEntitlement(featureName) {
        if (!adminCampusEntitlements || !Array.isArray(adminCampusEntitlements.features)) {
            return true; // default open while loading
        }
        return adminCampusEntitlements.features.includes(featureName);
    }

    function renderPlanUpgradeView(container, featureTitle, requiredTier, featureDescription, priceInfo) {
        if (!container) return;
        if (!container.dataset.originalContent) {
            container.dataset.originalContent = container.innerHTML;
        }
        const tierBadgeClass = requiredTier === "Premium" ? "bg-purple-100 text-purple-800 border-purple-200" : "bg-amber-100 text-amber-800 border-amber-200";
        container.innerHTML = `
            <div class="max-w-2xl mx-auto my-12 p-8 bg-surface rounded-2xl border border-line shadow-xs text-center">
                <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                </div>
                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${tierBadgeClass} mb-3">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                    <span>Requires ${requiredTier} Plan</span>
                </div>
                <h2 class="text-xl font-bold text-navy tracking-tight">${escapeHtml(featureTitle)}</h2>
                <p class="text-xs text-ink-muted mt-2 max-w-md mx-auto leading-relaxed">${escapeHtml(featureDescription)}</p>
                
                <div class="mt-6 p-4 rounded-xl bg-bg border border-line text-xs text-ink max-w-md mx-auto flex items-center justify-between">
                    <span class="font-medium text-ink-muted">Plan tier required:</span>
                    <span class="font-bold text-navy">${requiredTier} (${priceInfo})</span>
                </div>

                <div class="mt-6 flex items-center justify-center gap-3">
                    <a href="mailto:support@kambus.in?subject=Upgrade%20Campus%20to%20${requiredTier}%20Plan" class="px-5 py-2.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90 transition shadow-xs">
                        Contact Support to Upgrade
                    </a>
                </div>
            </div>
        `;
    }

    function restorePlanContent(container) {
        if (!container) return;
        if (container.dataset.originalContent) {
            container.innerHTML = container.dataset.originalContent;
            delete container.dataset.originalContent;
        }
    }

    function updateNavBadge(sectionName, requiredTier, isEntitled) {
        const btn = document.querySelector(`.admin-nav-btn[data-section="${sectionName}"]`);
        if (!btn) return;
        const existingBadge = btn.querySelector(".plan-gate-badge");
        if (isEntitled) {
            if (existingBadge) existingBadge.remove();
            restorePlanContent(document.getElementById(`section-${sectionName}`));
        } else {
            if (!existingBadge) {
                const badge = document.createElement("span");
                const badgeColor = requiredTier === "Premium" ? "bg-purple-100 text-purple-800" : "bg-amber-100 text-amber-800";
                badge.className = `ml-auto text-[9px] px-1.5 py-0.5 rounded ${badgeColor} font-bold uppercase tracking-wider inline-flex items-center gap-0.5 plan-gate-badge`;
                badge.innerHTML = `<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg> ${requiredTier}`;
                btn.appendChild(badge);
            }
        }
    }

    function applyAdminFeatureGating() {
        updateNavBadge("temp-stop-logs", "Top", hasAdminEntitlement("temporary_stop_change"));
        updateNavBadge("notifications", "Top", hasAdminEntitlement("admin_broadcasts"));
        updateNavBadge("messages", "Premium", hasAdminEntitlement("student_to_admin_query"));

        // If currently viewing a section that was gated, reload that section view immediately
        if (activeSection === "temp-stop-logs" && hasAdminEntitlement("temporary_stop_change")) {
            loadTemporaryStopLogs();
        } else if (activeSection === "notifications" && hasAdminEntitlement("admin_broadcasts")) {
            initAnnouncementComposer();
        } else if (activeSection === "messages" && hasAdminEntitlement("student_to_admin_query")) {
            loadMessages();
        }
    }

    // =========================================================================
    // NAVIGATION & SECTIONS
    // =========================================================================

    function showSection(sectionName) {
        activeSection = sectionName;

        // Toggle section container visibility
        document.querySelectorAll(".admin-section").forEach(sec => {
            sec.classList.remove("active");
        });
        const target = document.getElementById(`section-${sectionName}`);
        if (target) {
            target.classList.add("active");
        }

        // Toggle sidebar button styles
        document.querySelectorAll(".admin-nav-btn").forEach(btn => {
            if (btn.getAttribute("data-section") === sectionName) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });

        closeMobileSidebar();
        document.querySelectorAll('[data-modal="true"]:not(.hidden)').forEach(m => m.classList.add("hidden"));
        document.body.style.overflow = "";

        // Load section-specific data
        switch (sectionName) {
            case "dashboard":
                loadDashboard();
                break;
            case "buses":
                loadBuses();
                break;
            case "drivers":
                loadDrivers();
                break;
            case "students":
                loadStudents();
                break;
            case "parents":
                loadParents();
                break;
            case "routes":
                loadRoutes();
                break;
            case "stops":
                loadStops();
                break;
            case "complaints":
                loadComplaints();
                break;
            case "geofence-logs":
                loadGeofenceLogs();
                break;
            case "temp-stop-logs":
                if (!hasAdminEntitlement("temporary_stop_change")) {
                    renderPlanUpgradeView(
                        target,
                        "Temporary Stop Changes",
                        "Top",
                        "Allow students to select temporary pickup and dropoff locations along the route, with automatic route check and administrator approval workflows.",
                        "₹1,300/mo per bus"
                    );
                    break;
                }
                loadTemporaryStopLogs();
                break;
            case "permanent-stop-requests":
                loadPermanentStopRequests();
                break;
            case "live-map":
                setTimeout(initLiveMap, 100);
                break;
            case "messages":
                if (!hasAdminEntitlement("student_to_admin_query")) {
                    renderPlanUpgradeView(
                        target,
                        "Student Messages & Queries",
                        "Premium",
                        "Direct communication inbox allowing students to message campus administrators for inquiries, lost property, and transport feedback.",
                        "₹1,800/mo per bus"
                    );
                    break;
                }
                loadMessages();
                break;
            case "notifications":
                if (!hasAdminEntitlement("admin_broadcasts")) {
                    renderPlanUpgradeView(
                        target,
                        "Announcements & Broadcasts",
                        "Top",
                        "Send real-time broadcast push notifications, route updates, and announcements to students, parents, and drivers across your campus fleet.",
                        "₹1,300/mo per bus"
                    );
                    break;
                }
                initAnnouncementComposer();
                loadAnnouncementHistory();
                loadAdminBusChanges();
                break;
            case "alerts":
                loadAlerts();
                break;
            case "today-operations":
                loadTodayOperations();
                break;
            case "activity-logs":
                loadActivityLogs();
                break;
            case "campuses":
                loadCampuses();
                break;
            case "admins":
                loadAdmins();
                break;
            case "sessions":
                loadSessions();
                break;
            case "search":
                document.getElementById("globalSearchInput")?.focus();
                break;
        }
    }

    // =========================================================================
    // SCROLL LOCK / UNLOCK HELPERS (FIX-2)
    // =========================================================================

    function lockScroll() {
        document.body.style.overflow = "hidden";
    }

    function unlockScroll() {
        const hasOpenModal = document.querySelector('[data-modal="true"]:not(.hidden)');
        const sidebarOpen = document.getElementById("adminSidebar")?.classList.contains("open");
        if (!hasOpenModal && !sidebarOpen) {
            document.body.style.overflow = "";
        }
    }

    function toggleMobileSidebar() {
        const sidebar = document.getElementById("adminSidebar");
        const overlay = document.getElementById("sidebarOverlay");
        if (sidebar && overlay) {
            const isOpen = sidebar.classList.contains("open");
            if (isOpen) {
                sidebar.classList.remove("open");
                overlay.classList.add("hidden");
                unlockScroll();
            } else {
                sidebar.classList.add("open");
                overlay.classList.remove("hidden");
                lockScroll();
            }
        }
    }

    function closeMobileSidebar() {
        const sidebar = document.getElementById("adminSidebar");
        const overlay = document.getElementById("sidebarOverlay");
        if (sidebar) sidebar.classList.remove("open");
        if (overlay) overlay.classList.add("hidden");
        unlockScroll();
    }

    // =========================================================================
    // DROPDOWN LOADERS (BUG-001, BUG-002, BUG-004, BUG-005, BUG-006)
    // =========================================================================

    async function loadBusesDropdown() {
        if (isPlatformSuperAdmin() && !getSelectedCampusId()) {
            cachedBuses = [];
            document.querySelectorAll(".bus-select-dropdown").forEach(select => {
                select.innerHTML = `<option value="">-- Select Campus First --</option>`;
            });
            return;
        }

        try {
            const data = await apiRequest("/admin/buses");
            cachedBuses = data.buses || [];

            // Populate all bus select dropdowns
            const busSelects = document.querySelectorAll(".bus-select-dropdown");
            busSelects.forEach(select => {
                const currentVal = select.value;
                select.innerHTML = `<option value="">-- Select Bus / Unassigned --</option>` +
                    cachedBuses.map(b => `<option value="${b.bus_id}">Bus ${escapeHtml(b.bus_number)} (${escapeHtml(b.route_name || 'No route')})</option>`).join("");
                if (currentVal) select.value = currentVal;
            });

            // Populate Student Directory Filter dropdown (#studentFilterBus)
            const filterBus = document.getElementById("studentFilterBus");
            if (filterBus) {
                const curFilter = filterBus.value;
                filterBus.innerHTML = `<option value="">-- All Buses --</option>` +
                    cachedBuses.map(b => `<option value="${b.bus_id}">Bus ${escapeHtml(b.bus_number)}</option>`).join("");
                if (curFilter) filterBus.value = curFilter;
            }

            // Populate Announcement Target Bus dropdown (#announcementTargetBus)
            const annBus = document.getElementById("announcementTargetBus");
            if (annBus) {
                const curAnnBus = annBus.value;
                annBus.innerHTML = `<option value="">-- Select Bus --</option>` +
                    cachedBuses.map(b => `<option value="${b.bus_id}">Bus ${escapeHtml(b.bus_number)} (${escapeHtml(b.route_name || 'No route')})</option>`).join("");
                if (curAnnBus) annBus.value = curAnnBus;
            }
        } catch (e) {
            console.warn("Failed to load buses dropdown:", e);
        }
    }

    async function loadDriversDropdown() {
        try {
            const data = await apiRequest("/admin/drivers");
            cachedDrivers = data.drivers || [];
            const selects = document.querySelectorAll(".driver-select-dropdown");
            selects.forEach(select => {
                const currentVal = select.value;
                select.innerHTML = `<option value="">-- Select Driver / Unassigned --</option>` +
                    cachedDrivers.map(d => `<option value="${d.driver_id}">${escapeHtml(d.name || d.driver_code)} (${escapeHtml(d.driver_code)})</option>`).join("");
                if (currentVal) select.value = currentVal;
            });
        } catch (e) {
            console.warn("Failed to load drivers dropdown:", e);
        }
    }

    async function loadRoutesDropdown() {
        if (isPlatformSuperAdmin() && !getSelectedCampusId()) {
            cachedRoutes = [];
            document.querySelectorAll(".route-select-dropdown").forEach(select => {
                select.innerHTML = `<option value="">-- Select Campus First --</option>`;
            });
            return;
        }

        try {
            const data = await apiRequest("/admin/routes");
            cachedRoutes = data.routes || [];
            const selects = document.querySelectorAll(".route-select-dropdown");
            selects.forEach(select => {
                const currentVal = select.value;
                select.innerHTML = `<option value="">-- Select Route / Unassigned --</option>` +
                    cachedRoutes.map(r => `<option value="${r.route_id}">${escapeHtml(r.name)} (${r.stops_count} stops)</option>`).join("");
                if (currentVal) select.value = currentVal;
            });

            // Populate Announcement Target Route dropdown (#announcementTargetRoute)
            const annRoute = document.getElementById("announcementTargetRoute");
            if (annRoute) {
                const curAnnRoute = annRoute.value;
                annRoute.innerHTML = `<option value="">-- Select Route --</option>` +
                    cachedRoutes.map(r => `<option value="${r.route_id}">${escapeHtml(r.name)}</option>`).join("");
                if (curAnnRoute) annRoute.value = curAnnRoute;
            }
        } catch (e) {
            console.warn("Failed to load routes dropdown:", e);
        }
    }

    async function loadStopsDropdown() {
        if (isPlatformSuperAdmin() && !getSelectedCampusId()) {
            cachedStops = [];
            document.querySelectorAll(".stop-select-dropdown").forEach(select => {
                select.innerHTML = `<option value="">-- Select Campus First --</option>`;
            });
            return;
        }

        try {
            const data = await apiRequest("/admin/stops");
            cachedStops = data.stops || [];
            const selects = document.querySelectorAll(".stop-select-dropdown");
            selects.forEach(select => {
                const currentVal = select.value;
                select.innerHTML = `<option value="">-- Select Stop / Unassigned --</option>` +
                    cachedStops.map(s => `<option value="${s.stop_id}">${escapeHtml(s.name)} (${escapeHtml(s.route_name || 'Route ' + s.route_id)})</option>`).join("");
                if (currentVal) select.value = currentVal;
            });
        } catch (e) {
            console.warn("Failed to load stops dropdown:", e);
        }
    }

    // Modal Pre-Load Openers
    async function openAddBusModal() {
        await Promise.all([loadDriversDropdown(), loadRoutesDropdown()]);
        const form = document.querySelector("#addBusModal form");
        if (form) form.reset();
        document.getElementById("addBusModal")?.classList.remove("hidden");
    }

    async function openAddStudentModal() {
        await Promise.all([loadBusesDropdown(), loadStopsDropdown()]);
        const form = document.querySelector("#addStudentModal form");
        if (form) form.reset();
        document.getElementById("addStudentModal")?.classList.remove("hidden");
    }

    async function openAddStopModal() {
        await loadRoutesDropdown();
        const form = document.querySelector("#addStopModal form");
        if (form) form.reset();
        addStopPickMode = "pickup";
        document.getElementById("addStopEveningLat").value = "";
        document.getElementById("addStopEveningLng").value = "";
        document.getElementById("addStopDropCoordsDisplay").textContent = "Drop: not set";
        if (stopPickerDropMarker && stopPickerMap) {
            stopPickerMap.removeLayer(stopPickerDropMarker);
        }
        stopPickerDropMarker = null;
        document.getElementById("addStopPickupModeBtn").onclick = () => {
            addStopPickMode = "pickup";
            updateAddStopModeButtons();
        };
        document.getElementById("addStopDropModeBtn").onclick = () => {
            addStopPickMode = "drop";
            updateAddStopModeButtons();
        };
        updateAddStopModeButtons();
        document.getElementById("addStopModal")?.classList.remove("hidden");
        setTimeout(() => initStopMapPicker(17.985, 79.595), 150);
    }

    // =========================================================================
    // 1. DASHBOARD OVERVIEW
    // =========================================================================

    function renderDashboardNoCampusSelected() {
        document.getElementById("statTotalBuses").textContent = "--";
        document.getElementById("statActiveBuses").textContent = "--";
        document.getElementById("statOfflineBuses").textContent = "--";
        document.getElementById("statTotalDrivers").textContent = "--";
        document.getElementById("statTotalStudents").textContent = "--";
        document.getElementById("statTravellingToday").textContent = "--";
        document.getElementById("statTotalRoutes").textContent = "--";
        document.getElementById("statTotalStops").textContent = "--";

        const activeTripsContainer = document.getElementById("dashboardActiveTrips");
        if (activeTripsContainer) {
            activeTripsContainer.innerHTML = `
                <div class="p-8 text-center text-xs text-amber-800 bg-amber-50/60 border border-amber-200/80 rounded-xl">
                    <p class="font-bold text-sm">No Campus Selected</p>
                    <p class="mt-1 text-slate-500">Please choose a campus from the dropdown in the top navigation to view active trips and dashboard statistics.</p>
                </div>
            `;
        }

        const recentAlertsContainer = document.getElementById("dashboardRecentAlerts");
        if (recentAlertsContainer) {
            recentAlertsContainer.innerHTML = `
                <div class="p-8 text-center text-xs text-amber-800 bg-amber-50/60 border border-amber-200/80 rounded-xl">
                    <p class="font-bold text-sm">No Campus Selected</p>
                    <p class="mt-1 text-slate-500">Please choose a campus from the dropdown in the top navigation to view recent alerts.</p>
                </div>
            `;
        }
    }

    function getInitialOpsDashboard() {
        try {
            const raw = localStorage.getItem("kambus_ops_dashboard");
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function renderDashboardData(data) {
        if (!data) return;

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val ?? 0;
        };
        setVal("statTotalBuses", data.total_buses);
        setVal("statActiveBuses", data.active_buses);
        setVal("statOfflineBuses", data.offline_buses);
        setVal("statTotalDrivers", data.total_drivers);
        setVal("statTotalStudents", data.total_students);
        setVal("statTravellingToday", data.students_travelling_today);
        setVal("statTotalRoutes", data.total_routes);
        setVal("statTotalStops", data.total_stops);

        // Render Active Trips
        const activeTripsContainer = document.getElementById("dashboardActiveTrips");
        if (activeTripsContainer) {
            if (!data.active_trips || data.active_trips.length === 0) {
                activeTripsContainer.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">No active trips currently in transit.</div>`;
            } else {
                activeTripsContainer.innerHTML = data.active_trips.map(trip => `
                    <div class="kx-card-sub p-3 flex items-center justify-between gap-2">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full animate-pulse" style="background-color: var(--success);"></span>
                                <span class="font-bold text-xs" style="color: var(--navy-900);">${escapeHtml(trip.bus_number)}</span>
                                <span style="color: var(--border);">&bull;</span>
                                <span class="text-xs font-semibold" style="color: var(--text-muted);">${escapeHtml(trip.route_name || 'Campus Route')}</span>
                            </div>
                            <p class="text-[11px] mt-0.5" style="color: var(--text-muted);">Driver: <strong style="color: var(--text);">${escapeHtml(trip.driver_name)}</strong> &bull; Started: ${formatDateTime(trip.started_at)}</p>
                        </div>
                        <button onclick="window.KambusAdmin.openBusModal(${trip.bus_id})" class="btn-secondary" style="padding: 4px 10px; font-size: 11px;">
                            View Bus
                        </button>
                    </div>
                `).join("");
            }
        }

        // Render Recent Alerts
        const recentAlertsContainer = document.getElementById("dashboardRecentAlerts");
        if (recentAlertsContainer && data.recent_alerts) {
            if (data.recent_alerts.length === 0) {
                recentAlertsContainer.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">No recent alerts logged.</div>`;
            } else {
                recentAlertsContainer.innerHTML = data.recent_alerts.slice(0, 4).map(alert => `
                    <div class="py-2.5 flex items-start justify-between gap-3 text-xs" style="border-bottom: 1px solid var(--border);">
                        <div class="min-w-0">
                            <div class="flex items-center gap-1.5">
                                <span class="w-4 h-4 shrink-0 flex items-center justify-center">${alert.type === 'emergency_sos' ? '<svg class="w-4 h-4" style="color: var(--danger);"><use href="icons.svg#icon-alert"/></svg>' : '<svg class="w-4 h-4" style="color: var(--warning);"><use href="icons.svg#icon-alert"/></svg>'}</span>
                                <span class="font-bold truncate" style="color: var(--text);">${escapeHtml(alert.title)}</span>
                            </div>
                            <p class="text-[11px] truncate mt-0.5" style="color: var(--text-muted);">${escapeHtml(alert.message)}</p>
                        </div>
                        <span class="text-[10px] shrink-0" style="color: var(--text-muted);">${formatDateTime(alert.created_at)}</span>
                    </div>
                `).join("");
            }
        }
    }

    async function loadDashboard() {
        if (isPlatformSuperAdmin() && !getSelectedCampusId()) {
            renderDashboardNoCampusSelected();
            return;
        }

        if (!window.__opsDashboardLoadedFromLogin) {
            const initialOps = getInitialOpsDashboard();
            if (initialOps) {
                window.__opsDashboardLoadedFromLogin = true;
                renderDashboardData(initialOps);
                return;
            }
        }

        try {
            const data = await apiRequest("/admin/dashboard");
            renderDashboardData(data);
        } catch (error) {
            console.error("Dashboard load failed:", error);
            showToast("error", "Error", "Could not refresh overview stats.");
        }
    }

    // =========================================================================
    // 2. BUS FLEET MANAGEMENT
    // =========================================================================

    async function loadBuses() {
        const container = document.getElementById("busesList");
        if (!container) return;

        if (isPlatformSuperAdmin() && !getSelectedCampusId()) {
            cachedBuses = [];
            container.innerHTML = `<div class="p-8 text-center text-xs text-amber-800 bg-amber-50/60 border border-amber-200/80 rounded-xl col-span-full font-semibold">No campus selected. Please select a campus from the top navigation to view its bus fleet.</div>`;
            return;
        }

        container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Loading bus fleet...</div>`;

        try {
            const data = await apiRequest("/admin/buses");
            cachedBuses = data.buses || [];
            renderBusesList(cachedBuses);
        } catch (error) {
            container.innerHTML = `<div class="p-8 text-center text-xs text-red-500">Failed to load buses: ${escapeHtml(error.message)}</div>`;
        }
    }

    function renderBusesList(buses) {
        const container = document.getElementById("busesList");
        if (!container) return;

        if (buses.length === 0) {
            container.innerHTML = `<div class="kx-empty-card text-xs text-slate-400 col-span-full">No buses registered in fleet. Click "Add Bus" to create one.</div>`;
            return;
        }

        container.innerHTML = buses.map(bus => `
            <div class="kx-card kx-card-interactive p-4 flex flex-col justify-between" onclick="window.KambusAdmin.openBusModal(${bus.bus_id})">
                <div>
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-base font-black text-slate-900">Bus ${escapeHtml(bus.bus_number)}</span>
                                ${bus.gender_restriction === 'girls_only' ? '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-pink-50 text-pink-700 border border-pink-200">♀ Girls Only</span>' :
                                  bus.gender_restriction === 'boys_only' ? '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">♂ Boys Only</span>' :
                                  ''}
                            </div>
                            <p class="text-[11px] font-mono text-slate-400">${escapeHtml(bus.registration_number || 'No reg number')}</p>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${bus.trip_status === 'active' ? 'bg-ok/10 text-ok' : 'bg-surface text-ink-muted border border-line'}">
                            ${bus.trip_status === 'active' ? '<span class="w-1.5 h-1.5 rounded-full bg-ok inline-block shrink-0"></span>IN TRANSIT' : 'IDLE'}
                        </span>
                    </div>

                    <div class="mt-3.5 space-y-1.5 text-xs">
                        <div class="flex items-center gap-1.5 text-slate-700">
                            <svg class="w-4 h-4 shrink-0 text-ink-muted inline" aria-hidden="true"><use href="icons.svg#icon-route"/></svg>
                            <span class="truncate font-semibold">${escapeHtml(bus.route_name || 'No Route Assigned')}</span>
                        </div>
                        <div class="flex items-center gap-1.5 text-slate-700">
                            <svg class="w-4 h-4 shrink-0 text-ink-muted inline" aria-hidden="true"><use href="icons.svg#icon-user-tie"/></svg>
                            <span class="truncate">${escapeHtml(bus.driver_name ? `${bus.driver_name} (${bus.driver_code})` : 'No Driver Assigned')}</span>
                        </div>
                    </div>
                </div>

                <div class="pt-3.5 mt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span class="text-ink-muted font-bold inline-flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-users"/></svg>
                        <span><strong>${bus.student_count}</strong> students (${bus.travelling_today_count} today)</span>
                    </span>
                    <button type="button" onclick="event.stopPropagation(); window.KambusAdmin.deleteBus(${bus.bus_id}, ${jsArg(bus.bus_number)})" class="text-slate-300 hover:text-danger p-1 transition" title="Delete Bus">
                        <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-trash"/></svg>
                    </button>
                </div>
            </div>
        `).join("");
    }

    async function openBusModal(busId) {
        currentViewingBusId = busId;
        try {
            await Promise.all([loadDriversDropdown(), loadRoutesDropdown()]);
            const bus = await apiRequest(`/admin/buses/${busId}`);

            document.getElementById("modalBusId").value = bus.bus_id;
            document.getElementById("modalBusTitle").textContent = `Bus ${bus.bus_number}`;
            document.getElementById("modalBusReg").textContent = bus.registration_number ? `Reg: ${bus.registration_number}` : "No registration number";

            // Editable general fields (BUG-008)
            document.getElementById("modalEditBusNumber").value = bus.bus_number || "";
            document.getElementById("modalEditBusReg").value = bus.registration_number || "";
            document.getElementById("modalEditBusStatus").value = bus.status || "active";
            const genderEl = document.getElementById("modalEditBusGender");
            if (genderEl) genderEl.value = bus.gender_restriction || "";

            const badge = document.getElementById("modalBusStatusBadge");
            if (badge) {
                badge.className = `px-2.5 py-1 rounded-full text-xs font-black inline-flex items-center gap-1.5 ${bus.trip_status === 'active' ? 'bg-ok/10 text-ok' : 'bg-surface text-ink-muted border border-line'}`;
                badge.innerHTML = bus.trip_status === 'active' ? '<span class="w-1.5 h-1.5 rounded-full bg-ok inline-block shrink-0"></span>IN TRANSIT' : 'IDLE';
            }

            document.getElementById("modalBusStudentCount").textContent = bus.student_count || 0;
            document.getElementById("modalBusTravellingCount").textContent = bus.travelling_today_count || 0;

            document.getElementById("modalBusDriverName").textContent = bus.driver_name || "Unassigned";
            document.getElementById("modalBusDriverPhone").textContent = bus.driver_phone ? bus.driver_phone : "";
            document.getElementById("modalBusDriverSelect").value = bus.driver_id || "";

            document.getElementById("modalBusRouteName").textContent = bus.route_name || "Unassigned";
            document.getElementById("modalBusRouteSelect").value = bus.route_id || "";

            // Render Assigned Students List
            const studentsContainer = document.getElementById("modalBusStudentsList");
            const students = bus.students || [];
            if (students.length === 0) {
                studentsContainer.innerHTML = `<div class="p-3 text-center text-slate-400">No students assigned to this bus.</div>`;
            } else {
                studentsContainer.innerHTML = students.map(s => `
                    <div class="py-1.5 flex items-center justify-between gap-2">
                        <span class="font-bold text-slate-900">${escapeHtml(s.name)} (${escapeHtml(s.roll_number)})</span>
                        <span class="text-[11px] text-slate-500 font-semibold">${escapeHtml(s.stop_name || 'No Stop')}</span>
                    </div>
                `).join("");
            }

            // Hook Save General Props Button (BUG-008)
            const btnGeneral = document.getElementById("btnSaveBusGeneralProps");
            if (btnGeneral) {
                btnGeneral.onclick = () => submitUpdateBusGeneralProps(bus.bus_id);
            }

            // Hook Driver and Route Save Buttons
            const btnDriver = document.getElementById("btnSaveBusDriver");
            if (btnDriver) {
                btnDriver.onclick = async () => {
                    const newDriverId = document.getElementById("modalBusDriverSelect").value;
                    try {
                        await apiRequest(`/admin/buses/${bus.bus_id}/assign-driver`, {
                            method: "POST",
                            body: { driver_id: newDriverId ? parseInt(newDriverId) : null }
                        });
                        showToast("success", "Driver Updated", `Assigned driver to Bus ${bus.bus_number}`);
                        openBusModal(bus.bus_id);
                        loadBuses();
                    } catch (e) {
                        showToast("error", "Failed", e.message);
                    }
                };
            }

            const btnRoute = document.getElementById("btnSaveBusRoute");
            if (btnRoute) {
                btnRoute.onclick = async () => {
                    const newRouteId = document.getElementById("modalBusRouteSelect").value;
                    try {
                        await apiRequest(`/admin/buses/${bus.bus_id}/assign-route`, {
                            method: "POST",
                            body: { route_id: newRouteId ? parseInt(newRouteId) : null }
                        });
                        showToast("success", "Route Updated", `Assigned route to Bus ${bus.bus_number}`);
                        openBusModal(bus.bus_id);
                        loadBuses();
                    } catch (e) {
                        showToast("error", "Failed", e.message);
                    }
                };
            }

            document.getElementById("busDetailsModal")?.classList.remove("hidden");
        } catch (error) {
            showToast("error", "Error", "Could not load bus details: " + error.message);
        }
    }

    async function submitUpdateBusGeneralProps(busId) {
        const busNumber = document.getElementById("modalEditBusNumber")?.value.trim();
        const regNumber = document.getElementById("modalEditBusReg")?.value.trim();
        const status = document.getElementById("modalEditBusStatus")?.value;
        const genderRestriction = document.getElementById("modalEditBusGender")?.value || null;

        if (!busNumber) {
            showToast("error", "Validation", "Bus Number is required.");
            return;
        }

        try {
            await apiRequest(`/admin/buses/${busId}`, {
                method: "PATCH",
                body: {
                    bus_number: busNumber,
                    registration_number: regNumber,
                    status: status,
                    gender_restriction: genderRestriction
                }
            });
            showToast("success", "Bus Updated", `Bus ${busNumber} properties updated successfully.`);
            openBusModal(busId);
            loadBuses();
        } catch (error) {
            showToast("error", "Update Failed", error.message);
        }
    }

    function replaceCurrentBus() {
        if (!currentViewingBusId) return;
        const busId = currentViewingBusId;
        document.getElementById("busDetailsModal")?.classList.add("hidden");
        unlockScroll();
        showSection("section-announcements");
        const templateSelect = document.getElementById("announcementTemplateSelect");
        if (templateSelect) {
            templateSelect.value = "TEMPLATE_B";
            updateAnnouncementTemplateFields();
            setTimeout(() => {
                const sourceSelect = document.getElementById("annFieldSourceBus");
                if (sourceSelect) {
                    sourceSelect.value = String(busId);
                    previewAnnouncementText();
                    calculateAffectedStudents();
                }
            }, 100);
        }
    }

    async function submitAddBus(event) {
        event.preventDefault();
        const form = event.target;
        const busNumber = form.bus_number.value.trim();
        const regNumber = form.registration_number.value.trim();
        const driverId = form.driver_id.value ? parseInt(form.driver_id.value) : null;
        const routeId = form.route_id.value ? parseInt(form.route_id.value) : null;
        const genderRestriction = form.gender_restriction ? form.gender_restriction.value || null : null;

        try {
            await apiRequest("/admin/buses", {
                method: "POST",
                body: {
                    bus_number: busNumber,
                    registration_number: regNumber,
                    driver_id: driverId,
                    route_id: routeId,
                    status: "active",
                    gender_restriction: genderRestriction
                }
            });
            showToast("success", "Bus Added", `Bus ${busNumber} registered successfully.`);
            document.getElementById("addBusModal")?.classList.add("hidden");
            form.reset();
            loadBuses();
            loadDashboard();
        } catch (error) {
            showToast("error", "Failed to Add Bus", error.message);
        }
    }

    async function deleteBus(busId, busNumber) {
        const confirmed = await confirm(`Are you sure you want to delete Bus ${busNumber}? Students assigned will be unassigned.`);
        if (!confirmed) return;
        try {
            await apiRequest(`/admin/buses/${busId}`, { method: "DELETE" });
            showToast("info", "Bus Deleted", `Bus ${busNumber} removed.`);
            loadBuses();
            loadDashboard();
        } catch (error) {
            showToast("error", "Delete Failed", error.message);
        }
    }

    // =========================================================================
    // 3. DRIVER MANAGEMENT
    // =========================================================================

    async function loadDrivers() {
        const container = document.getElementById("driversList");
        if (!container) return;
        container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Loading drivers...</div>`;

        try {
            const data = await apiRequest("/admin/drivers");
            cachedDrivers = data.drivers || [];
            renderDriversList(cachedDrivers);
        } catch (error) {
            container.innerHTML = `<div class="p-8 text-center text-xs text-red-500">Failed to load drivers: ${escapeHtml(error.message)}</div>`;
        }
    }

    function renderDriversList(drivers) {
        const container = document.getElementById("driversList");
        if (!container) return;

        if (drivers.length === 0) {
            container.innerHTML = `<div class="kx-empty-card text-xs text-slate-400 col-span-full">No drivers registered. Click "Add Driver" to create one.</div>`;
            return;
        }

        container.innerHTML = drivers.map(d => `
            <div class="kx-card kx-card-interactive p-4 flex flex-col justify-between" onclick="window.KambusAdmin.openDriverModal(${d.driver_id})">
                <div>
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <span class="text-base font-black text-slate-900">${escapeHtml(d.name || 'Driver')}</span>
                            <p class="text-[11px] font-mono font-bold text-brand uppercase">${escapeHtml(d.driver_code)}</p>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${d.is_online ? 'bg-ok/10 text-ok' : 'bg-surface text-ink-muted border border-line'}">
                            ${d.is_online ? '<span class="w-1.5 h-1.5 rounded-full bg-ok inline-block shrink-0"></span>ONLINE' : 'OFFLINE'}
                        </span>
                    </div>

                    <div class="mt-3.5 space-y-1.5 text-xs text-slate-600">
                        <p class="inline-flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-phone"/></svg> <strong>${escapeHtml(d.phone || '-')}</strong></p>
                        <p>Assigned: <strong>${escapeHtml(d.bus_number ? `Bus ${d.bus_number}` : 'Unassigned')}</strong></p>
                        <p>Route: <strong>${escapeHtml(d.route_name || '-')}</strong></p>
                        ${(d.complaints_count || 0) > 0 ? `
                            <p class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-warn/10 border border-warn/20 text-warn font-bold text-[11px] mt-1">
                                <svg class="w-4 h-4 shrink-0 text-warn inline mr-1" aria-hidden="true"><use href="icons.svg#icon-alert"/></svg> ${d.complaints_count} ${d.complaints_count === 1 ? 'Complaint' : 'Complaints'}
                            </p>
                        ` : ''}
                    </div>
                </div>

                <div class="pt-3.5 mt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span class="text-slate-400 text-[11px]">License: ${escapeHtml(d.license_number || 'N/A')}</span>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="event.stopPropagation(); window.KambusAdmin.openEditDriverModal(${d.driver_id})" class="text-slate-400 hover:text-brand p-1 transition" title="Edit Driver">
                            <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-pen"/></svg>
                        </button>
                        <button type="button" onclick="event.stopPropagation(); window.KambusAdmin.deleteDriver(${d.driver_id}, ${jsArg(d.name || d.driver_code)})" class="text-slate-300 hover:text-danger p-1 transition" title="Delete Driver">
                            <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-trash"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join("");
    }

    async function openDriverModal(driverId) {
        try {
            const driver = await apiRequest(`/admin/drivers/${driverId}`);

            document.getElementById("modalDriverName").textContent = driver.name || "Driver Profile";
            document.getElementById("modalDriverCode").textContent = `Code: ${driver.driver_code}`;
            document.getElementById("modalDriverPhone").textContent = driver.phone || "No phone";
            document.getElementById("modalDriverBus").textContent = driver.bus_number ? `Assigned to Bus ${driver.bus_number} (${driver.route_name || 'No route'})` : "No Bus Assigned";

            const editBtn = document.getElementById("modalEditDriverBtn");
            if (editBtn) {
                editBtn.onclick = () => {
                    document.getElementById("driverDetailsModal")?.classList.add("hidden");
                    openEditDriverModal(driverId);
                };
            }

            // Trip history
            const tripsContainer = document.getElementById("modalDriverTrips");
            const trips = driver.trip_history || [];
            if (trips.length === 0) {
                tripsContainer.innerHTML = `<div class="p-3 text-center text-slate-400">No recorded trips.</div>`;
            } else {
                tripsContainer.innerHTML = trips.map(t => `
                    <div class="p-2.5 flex items-center justify-between gap-2">
                        <div>
                            <span class="font-bold text-slate-800">Trip #${t.trip_id}</span>
                            <p class="text-[11px] text-slate-400">${formatDateTime(t.started_at)}</p>
                        </div>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'completed' ? 'bg-slate-100 text-slate-700' : 'bg-ok/10 text-ok'}">
                            ${t.status.toUpperCase()}
                        </span>
                    </div>
                `).join("");
            }

            document.getElementById("driverDetailsModal")?.classList.remove("hidden");
        } catch (e) {
            showToast("error", "Error", "Could not load driver details: " + e.message);
        }
    }

    async function openEditDriverModal(driverId) {
        try {
            let driver = cachedDrivers.find(d => d.driver_id === driverId);
            if (!driver || !driver.phone) {
                driver = await apiRequest(`/admin/drivers/${driverId}`);
            }

            document.getElementById("editDriverId").value = driver.driver_id || driverId;
            document.getElementById("editDriverName").value = driver.name || "";
            document.getElementById("editDriverCode").value = driver.driver_code || "";
            document.getElementById("editDriverPhone").value = driver.phone || "";
            document.getElementById("editDriverPassword").value = "";
            document.getElementById("editDriverLicense").value = driver.license_number || "";

            document.getElementById("editDriverModal")?.classList.remove("hidden");
        } catch (e) {
            showToast("error", "Error", "Could not load driver details for editing: " + e.message);
        }
    }

    async function submitEditDriver(event) {
        event.preventDefault();
        const form = event.target;
        const driverId = form.driver_id.value;
        const name = form.name.value.trim();
        const driverCode = form.driver_code.value.trim().toUpperCase();
        const phone = form.phone.value.trim();
        const password = form.password.value;
        const licenseNumber = form.license_number.value.trim();

        const body = {
            name,
            driver_code: driverCode,
            phone,
            license_number: licenseNumber || null
        };
        if (password) {
            body.password = password;
        }

        try {
            await apiRequest(`/admin/drivers/${driverId}`, {
                method: "PATCH",
                body
            });
            showToast("success", "Driver Updated", `Driver ${name} (${driverCode}) updated.`);
            document.getElementById("editDriverModal")?.classList.add("hidden");
            form.reset();
            loadDrivers();
            loadDriversDropdown();
            loadDashboard();
        } catch (error) {
            showToast("error", "Update Failed", error.message);
        }
    }

    async function submitAddDriver(event) {
        event.preventDefault();
        const form = event.target;
        const name = form.name.value.trim();
        const driverCode = form.driver_code.value.trim().toUpperCase();
        const phone = form.phone.value.trim();
        const password = form.password.value;
        const licenseNumber = form.license_number.value.trim();

        try {
            await apiRequest("/admin/drivers", {
                method: "POST",
                body: {
                    name,
                    driver_code: driverCode,
                    phone,
                    password,
                    license_number: licenseNumber
                }
            });
            showToast("success", "Driver Registered", `Driver ${name} (${driverCode}) created.`);
            document.getElementById("addDriverModal")?.classList.add("hidden");
            form.reset();
            loadDrivers();
            loadDashboard();
        } catch (error) {
            showToast("error", "Failed to Add Driver", error.message);
        }
    }

    async function deleteDriver(driverId, name) {
        const confirmed = await confirm(`Are you sure you want to remove driver ${name}?`);
        if (!confirmed) return;
        try {
            await apiRequest(`/admin/drivers/${driverId}`, { method: "DELETE" });
            showToast("info", "Driver Removed", `Driver ${name} deleted.`);
            loadDrivers();
            loadDashboard();
        } catch (error) {
            showToast("error", "Delete Failed", error.message);
        }
    }

    // =========================================================================
    // 4. STUDENT MANAGEMENT
    // =========================================================================

    async function loadStudents() {
        const container = document.getElementById("studentsList");
        if (!container) return;

        if (isPlatformSuperAdmin() && !getSelectedCampusId()) {
            cachedStudents = [];
            container.innerHTML = `<div class="p-8 text-center text-xs text-amber-800 bg-amber-50/60 border border-amber-200/80 rounded-xl font-semibold">No campus selected. Please select a campus from the top navigation to view student records.</div>`;
            return;
        }

        const search = document.getElementById("studentSearchInput")?.value.trim();
        const busId = document.getElementById("studentFilterBus")?.value;
        const travelling = document.getElementById("studentFilterTravelling")?.value;

        let query = "/admin/students?";
        const params = [];
        if (search) params.push(`search=${encodeURIComponent(search)}`);
        if (busId) params.push(`bus_id=${busId}`);
        if (travelling) params.push(`travelling=${travelling}`);
        query += params.join("&");

        try {
            const data = await apiRequest(query);
            const students = data.students || [];
            cachedStudents = students;

            if (students.length === 0) {
                container.innerHTML = `<div class="kx-empty-card text-xs text-slate-400">No students matching criteria.</div>`;
                return;
            }

            container.innerHTML = `
                <div class="kx-table-card">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr>
                                    <th class="p-3.5 w-10 text-center">
                                        <input type="checkbox" id="selectAllStudentsCheckbox" onchange="window.KambusAdmin.toggleSelectAllStudents(this.checked)" class="rounded cursor-pointer" style="border-color: var(--border);" title="Select All Students">
                                    </th>
                                    <th class="p-3.5">Student</th>
                                    <th class="p-3.5">Roll No</th>
                                    <th class="p-3.5">Department</th>
                                    <th class="p-3.5">Gender</th>
                                    <th class="p-3.5">Assigned Bus</th>
                                    <th class="p-3.5">Assigned Stop</th>
                                    <th class="p-3.5">Today Status</th>
                                    <th class="p-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${students.map(s => `
                                    <tr>
                                        <td class="p-3.5 w-10 text-center" onclick="event.stopPropagation()">
                                            <input type="checkbox" class="student-select-chk rounded cursor-pointer" data-student-id="${s.student_id}" ${selectedStudentIds.has(s.student_id) ? 'checked' : ''} onchange="window.KambusAdmin.toggleStudentSelect(${s.student_id}, this.checked)" style="border-color: var(--border);">
                                        </td>
                                        <td class="p-3.5">
                                            <span class="font-bold" style="color: var(--text);">${escapeHtml(s.name)}</span>
                                            <p class="text-[11px] font-mono" style="color: var(--text-muted);">${escapeHtml(s.phone)}</p>
                                        </td>
                                        <td class="p-3.5 font-mono font-bold uppercase" style="color: var(--navy-700);">${escapeHtml(s.roll_number)}</td>
                                        <td class="p-3.5 font-medium" style="color: var(--text);">${escapeHtml(s.department || '-')}</td>
                                        <td class="p-3.5 capitalize font-medium" style="color: var(--text);">${escapeHtml(s.gender || '-')}</td>
                                        <td class="p-3.5">
                                            ${s.bus_number ? `<span class="badge-pill badge-pill-info">Bus ${escapeHtml(s.bus_number)}</span>` : '<span style="color: var(--text-muted); opacity: 0.6;">Unassigned</span>'}
                                        </td>
                                        <td class="p-3.5">
                                            ${s.stop_name ? `<span class="font-medium" style="color: var(--text);">${escapeHtml(s.stop_name)}</span>` : '<span style="color: var(--text-muted); opacity: 0.6;">No Stop</span>'}
                                        </td>
                                        <td class="p-3.5">
                                            <span class="badge-pill ${s.travelling_today ? 'badge-pill-success' : 'badge-pill-danger'}">
                                                ${s.travelling_today ? 'Travelling' : 'Not Travelling'}
                                            </span>
                                        </td>
                                        <td class="p-3.5 text-right space-x-1">
                                            <button type="button" onclick="window.KambusAdmin.openEditStudentModal(${Number(s.student_id)})" class="btn-secondary" style="padding: 4px 10px; font-size: 11px;">
                                                Edit
                                            </button>
                                            <button type="button" onclick="window.KambusAdmin.openAssignStudentModal(${s.student_id}, ${jsArg(s.name)}, ${s.bus_id || 'null'}, ${s.stop_id || 'null'})" class="btn-secondary" style="padding: 4px 10px; font-size: 11px;">
                                                Assign
                                            </button>
                                            <button type="button" onclick="window.KambusAdmin.deleteStudent(${s.student_id}, ${jsArg(s.roll_number)})" class="p-1 hover:text-danger transition inline-flex items-center" title="Delete Student" style="color: var(--text-muted);">
                                                <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-trash"/></svg>
                                            </button>
                                        </td>
                                    </tr>
                                `).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            updateBulkStudentToolbar();
        } catch (error) {
            container.innerHTML = `<div class="p-8 text-center text-xs text-red-500">Failed to load students: ${escapeHtml(error.message)}</div>`;
        }
    }

    function toggleStudentSelect(studentId, isChecked) {
        if (isChecked) {
            selectedStudentIds.add(studentId);
        } else {
            selectedStudentIds.delete(studentId);
        }
        updateBulkStudentToolbar();
    }

    function toggleSelectAllStudents(isChecked) {
        if (isChecked) {
            cachedStudents.forEach(s => selectedStudentIds.add(s.student_id));
        } else {
            selectedStudentIds.clear();
        }
        document.querySelectorAll(".student-select-chk").forEach(chk => {
            chk.checked = isChecked;
        });
        updateBulkStudentToolbar();
    }

    function clearStudentSelection() {
        selectedStudentIds.clear();
        const masterChk = document.getElementById("selectAllStudentsCheckbox");
        if (masterChk) masterChk.checked = false;
        document.querySelectorAll(".student-select-chk").forEach(chk => {
            chk.checked = false;
        });
        updateBulkStudentToolbar();
    }

    function updateBulkStudentToolbar() {
        const toolbar = document.getElementById("bulkStudentToolbar");
        const countEl = document.getElementById("bulkStudentCount");
        const masterChk = document.getElementById("selectAllStudentsCheckbox");
        const count = selectedStudentIds.size;

        if (masterChk && cachedStudents.length > 0) {
            masterChk.checked = count > 0 && count === cachedStudents.length;
            masterChk.indeterminate = count > 0 && count < cachedStudents.length;
        }

        if (toolbar) {
            if (count > 0) {
                toolbar.classList.remove("hidden");
                if (countEl) countEl.textContent = `${count} student${count === 1 ? '' : 's'} selected`;
            } else {
                toolbar.classList.add("hidden");
            }
        }
    }

    async function openBulkAssignBusModal() {
        if (selectedStudentIds.size === 0) {
            showToast("warning", "No Selection", "Please select at least one student to reassign.");
            return;
        }

        const countEl = document.getElementById("bulkAssignStudentCount");
        if (countEl) countEl.textContent = selectedStudentIds.size;

        const subtitleEl = document.getElementById("bulkAssignSubtitle");
        if (subtitleEl) subtitleEl.textContent = `Reassigning ${selectedStudentIds.size} student${selectedStudentIds.size === 1 ? '' : 's'} to a target bus`;

        const alertEl = document.getElementById("bulkAssignResultAlert");
        if (alertEl) {
            alertEl.className = "hidden p-3 rounded-lg border text-xs";
            alertEl.innerHTML = "";
        }

        const busSelect = document.getElementById("bulkAssignBusSelect");
        if (busSelect) {
            busSelect.innerHTML = `<option value="">Loading buses...</option>`;
            try {
                if (cachedBuses.length === 0) {
                    const data = await apiRequest("/admin/buses");
                    cachedBuses = data.buses || [];
                }
                const activeBuses = cachedBuses.filter(b => b.is_active !== false && b.status !== "inactive");
                if (activeBuses.length === 0) {
                    busSelect.innerHTML = `<option value="">No active buses available</option>`;
                } else {
                    busSelect.innerHTML = `<option value="">-- Choose Target Bus --</option>` + activeBuses.map(b => {
                        let restrLabel = "Mixed / Unrestricted";
                        if (b.gender_restriction === "girls_only") restrLabel = "Girls Only";
                        else if (b.gender_restriction === "boys_only") restrLabel = "Boys Only";
                        return `<option value="${b.bus_id}">Bus ${escapeHtml(b.bus_number)} (${escapeHtml(b.route_name || 'No Route')}) — [${restrLabel}]</option>`;
                    }).join("");
                }
            } catch (err) {
                busSelect.innerHTML = `<option value="">Error loading buses</option>`;
            }
        }

        const previewContainer = document.getElementById("bulkAssignStudentsPreview");
        if (previewContainer) {
            const selectedStudents = cachedStudents.filter(s => selectedStudentIds.has(s.student_id));
            previewContainer.innerHTML = selectedStudents.map(s => `
                <div class="py-1.5 flex items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <span class="font-bold text-slate-900 truncate">${escapeHtml(s.name)}</span>
                        <span class="font-mono text-[10px] text-brand uppercase font-bold shrink-0">${escapeHtml(s.roll_number)}</span>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${s.gender === 'female' ? 'bg-pink-50 text-pink-700' : s.gender === 'male' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}">${escapeHtml(s.gender || 'unspecified')}</span>
                        <span class="text-slate-400 text-[10px]">${s.bus_number ? `Bus ${escapeHtml(s.bus_number)}` : 'Unassigned'}</span>
                    </div>
                </div>
            `).join("");
        }

        document.getElementById("bulkAssignBusModal")?.classList.remove("hidden");
    }

    async function submitBulkAssignBus(event) {
        event.preventDefault();
        const busSelect = document.getElementById("bulkAssignBusSelect");
        const busId = busSelect?.value;
        const submitBtn = document.getElementById("btnSubmitBulkAssign");
        const alertEl = document.getElementById("bulkAssignResultAlert");

        if (!busId) {
            showToast("warning", "Select Bus", "Please choose a target bus.");
            return;
        }

        if (selectedStudentIds.size === 0) {
            showToast("warning", "No Selection", "No students selected.");
            return;
        }

        const studentIds = Array.from(selectedStudentIds);
        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Reassigning...";
            }
            if (alertEl) {
                alertEl.classList.add("hidden");
                alertEl.innerHTML = "";
            }

            const res = await apiRequest("/admin/students/bulk-reassign-bus", {
                method: "POST",
                body: {
                    student_ids: studentIds,
                    bus_id: parseInt(busId)
                }
            });

            if (res.failure_count === 0) {
                showToast("success", "Bulk Reassignment Complete", `${res.success_count} student${res.success_count === 1 ? '' : 's'} assigned to Bus ${res.target_bus_number}.`);
                document.getElementById("bulkAssignBusModal")?.classList.add("hidden");
                clearStudentSelection();
                loadStudents();
            } else {
                const failDetails = res.failed.map(f => `<li><strong>${escapeHtml(f.name)} (${escapeHtml(f.roll_number)})</strong>: ${escapeHtml(f.reason)}</li>`).join("");
                if (alertEl) {
                    alertEl.className = "p-3 rounded-lg border text-xs bg-amber-50 text-amber-900 border-amber-200 block space-y-1.5";
                    alertEl.innerHTML = `
                        <div class="font-bold flex items-center gap-1.5">
                            <span class="text-amber-600">⚠</span>
                            <span>${res.success_count} succeeded, ${res.failure_count} skipped due to restrictions:</span>
                        </div>
                        <ul class="list-disc pl-4 space-y-1 text-[11px] text-amber-800">
                            ${failDetails}
                        </ul>
                    `;
                }
                showToast("warning", "Partial Reassignment", `${res.success_count} student(s) reassigned, ${res.failure_count} skipped.`);
                clearStudentSelection();
                loadStudents();
            }
        } catch (e) {
            if (alertEl) {
                alertEl.className = "p-3 rounded-lg border text-xs bg-danger/10 text-danger border-danger/20 block";
                alertEl.textContent = e.message || "Failed to reassign students";
            }
            showToast("error", "Reassignment Failed", e.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Apply Reassignment";
            }
        }
    }

    async function openAssignStudentModal(studentId, name, currentBusId, currentStopId) {
        document.getElementById("assignStudentId").value = studentId;
        document.getElementById("assignStudentName").textContent = `Assigning for: ${name}`;

        await Promise.all([loadBusesDropdown(), loadStopsDropdown()]);

        const busSelect = document.getElementById("assignStudentBusSelect");
        const stopSelect = document.getElementById("assignStudentStopSelect");

        if (busSelect && currentBusId) busSelect.value = currentBusId;
        if (stopSelect && currentStopId) stopSelect.value = currentStopId;

        document.getElementById("assignStudentModal")?.classList.remove("hidden");
    }

    async function submitAssignStudent(event) {
        event.preventDefault();
        const studentId = document.getElementById("assignStudentId").value;
        const busId = document.getElementById("assignStudentBusSelect").value;
        const stopId = document.getElementById("assignStudentStopSelect").value;

        try {
            await apiRequest(`/admin/students/${studentId}/bus`, {
                method: "PATCH",
                body: { bus_id: busId ? parseInt(busId) : null }
            });

            if (stopId) {
                await apiRequest(`/admin/students/${studentId}/stop`, {
                    method: "PATCH",
                    body: { stop_id: parseInt(stopId) }
                });
            }

            showToast("success", "Assigned", "Student bus and stop assignments updated.");
            document.getElementById("assignStudentModal")?.classList.add("hidden");
            loadStudents();
        } catch (e) {
            showToast("error", "Assignment Failed", e.message);
        }
    }

    function openEditStudentModal(studentId) {
        const student = cachedStudents.find(s => s.student_id === studentId);
        if (!student) {
            showToast("error", "Error", "Student not found. Refresh the list and try again.");
            return;
        }

        document.getElementById("editStudentId").value = student.student_id;
        document.getElementById("editStudentName").value = student.name || "";
        document.getElementById("editStudentRoll").value = student.roll_number || "";
        document.getElementById("editStudentDepartment").value = student.department || "";
        document.getElementById("editStudentPhone").value = student.phone || "";
        document.getElementById("editStudentPassword").value = "";
        const genderEl = document.getElementById("editStudentGender");
        if (genderEl) genderEl.value = student.gender || "";

        document.getElementById("editStudentModal")?.classList.remove("hidden");
    }

    async function submitEditStudent(event) {
        event.preventDefault();
        const form = event.target;
        const studentId = form.elements.student_id.value;
        const name = form.elements.name.value.trim();
        const rollNumber = form.elements.roll_number.value.trim().toUpperCase();
        const department = form.elements.department.value.trim();
        const phone = form.elements.phone.value.trim();
        const password = form.elements.password.value;
        const gender = form.elements.gender ? form.elements.gender.value : null;

        const body = { name, roll_number: rollNumber, department, phone, gender: gender || null };
        if (password) {
            body.password = password;
        }

        try {
            await apiRequest(`/admin/students/${studentId}`, {
                method: "PATCH",
                body
            });
            showToast("success", "Student Updated", `Student ${rollNumber} updated.`);
            document.getElementById("editStudentModal")?.classList.add("hidden");
            form.reset();
            loadStudents();
        } catch (e) {
            showToast("error", "Update Failed", e.message);
        }
    }

    async function submitAddStudent(event) {
        event.preventDefault();
        const form = event.target;
        const name = form.name.value.trim();
        const rollNumber = form.roll_number.value.trim().toUpperCase();
        const gender = form.gender ? form.gender.value : null;
        const department = form.department.value.trim();
        const phone = form.phone.value.trim();
        const password = form.password.value;
        const busId = form.bus_id.value ? parseInt(form.bus_id.value) : null;
        const stopId = form.stop_id.value ? parseInt(form.stop_id.value) : null;

        try {
            await apiRequest("/admin/students", {
                method: "POST",
                body: {
                    name,
                    roll_number: rollNumber,
                    gender,
                    department,
                    phone,
                    password,
                    bus_id: busId,
                    stop_id: stopId
                }
            });
            showToast("success", "Student Created", `Student ${rollNumber} created.`);
            document.getElementById("addStudentModal")?.classList.add("hidden");
            form.reset();
            loadStudents();
            loadDashboard();
        } catch (e) {
            showToast("error", "Failed to Add Student", e.message);
        }
    }

    async function deleteStudent(studentId, rollNumber) {
        const confirmed = await confirm(`Are you sure you want to delete student ${rollNumber}?`);
        if (!confirmed) return;
        try {
            await apiRequest(`/admin/students/${studentId}`, { method: "DELETE" });
            showToast("info", "Deleted", `Student ${rollNumber} removed.`);
            loadStudents();
            loadDashboard();
        } catch (e) {
            showToast("error", "Delete Failed", e.message);
        }
    }

    // =========================================================================
    // 4B. PARENT MANAGEMENT
    // =========================================================================

    let cachedParents = [];
    let selectedLinkParentId = null;
    let selectedLinkStudentId = null;
    let linkStudentSearchDebounceTimer = null;
    const expandedParentIds = new Set();

    async function loadParents() {
        const container = document.getElementById("parentsList");
        if (!container) return;

        const activeCampusId = isPlatformSuperAdmin() ? getSelectedCampusId() : (currentUser?.campus_id || 1);
        const activeCampus = (cachedCampuses || []).find(c => c.id === activeCampusId);
        if (activeCampus && (activeCampus.campus_type === 'college' || activeCampus.type === 'college')) {
            container.innerHTML = `
                <div class="p-8 text-center bg-white border border-slate-200/90 rounded-lg shadow-2xs">
                    <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-2xl">
                        🎓
                    </div>
                    <h3 class="text-sm font-bold text-navy mb-1.5">Parent Portal Not Applicable for Colleges</h3>
                    <p class="text-xs text-ink-muted max-w-md mx-auto leading-relaxed">
                        <strong>${escapeHtml(activeCampus.name)}</strong> is registered as a <strong>College / University</strong>.
                        College students manage their own bus passes and live tracking directly.
                        Parent accounts and parent-student links are only supported for <strong>School</strong> campuses.
                    </p>
                </div>
            `;
            const addParentBtn = document.querySelector("button[onclick*='openAddParentModal']");
            if (addParentBtn) addParentBtn.disabled = true;
            return;
        } else {
            const addParentBtn = document.querySelector("button[onclick*='openAddParentModal']");
            if (addParentBtn) addParentBtn.disabled = false;
        }

        const search = document.getElementById("parentSearchInput")?.value.trim();
        let query = "/admin/parents";
        if (search) {
            query += `?q=${encodeURIComponent(search)}`;
        }

        try {
            const data = await apiRequest(query);
            const parents = data.parents || [];
            cachedParents = parents;

            if (parents.length === 0) {
                container.innerHTML = `<div class="kx-empty-card text-xs text-slate-400">No parents matching criteria.</div>`;
                return;
            }

            container.innerHTML = `
                <div class="bg-white border border-slate-200/90 rounded overflow-hidden shadow-xs">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead class="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                <tr>
                                    <th class="p-3.5">Parent</th>
                                    <th class="p-3.5">Phone</th>
                                    <th class="p-3.5">Email</th>
                                    <th class="p-3.5">Linked Children</th>
                                    <th class="p-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${parents.map(p => {
                                    const isExpanded = expandedParentIds.has(p.id);
                                    return `
                                    <tr class="hover:bg-slate-50/80 transition" id="parent-row-${p.id}">
                                        <td class="p-3.5">
                                            <span class="font-bold text-slate-900">${escapeHtml(p.name)}</span>
                                            <p class="text-[11px] text-slate-400 font-mono">${escapeHtml(p.login_id || '-')}</p>
                                        </td>
                                        <td class="p-3.5 font-mono font-semibold text-slate-700">${escapeHtml(p.phone)}</td>
                                        <td class="p-3.5 text-slate-600">${escapeHtml(p.email || '-')}</td>
                                        <td class="p-3.5">
                                            <span id="parent-child-count-badge-${p.id}" class="px-2 py-0.5 rounded-full text-[10px] font-black ${p.linked_children_count > 0 ? 'bg-ok/10 text-ok' : 'bg-slate-100 text-slate-500'}">
                                                ${p.linked_children_count} child${p.linked_children_count === 1 ? '' : 'ren'}
                                            </span>
                                        </td>
                                        <td class="p-3.5 text-right space-x-1">
                                            <button type="button" onclick="window.KambusAdmin.openEditParentModal(${p.id})" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[11px] font-bold text-slate-700 transition" title="Edit Parent Profile">
                                                Edit
                                            </button>
                                            <button type="button" onclick="window.KambusAdmin.toggleParentChildren(${p.id}, ${jsArg(p.name)})" class="px-2.5 py-1 bg-slate-100 hover:bg-navy hover:text-white rounded text-[11px] font-bold text-slate-700 transition">
                                                ${isExpanded ? 'Hide Children' : 'Children'}
                                            </button>
                                            <button type="button" onclick="window.KambusAdmin.openLinkChildModal(${p.id}, ${jsArg(p.name)})" class="px-2.5 py-1 bg-brand hover:bg-brandDark text-white rounded text-[11px] font-bold transition">
                                                Link Child
                                            </button>
                                        </td>
                                    </tr>
                                    <tr id="parent-children-row-${p.id}" class="${isExpanded ? '' : 'hidden'} bg-slate-50/70 border-b border-slate-200">
                                        <td colspan="5" class="p-3 sm:px-6">
                                            <div id="parent-children-container-${p.id}" class="space-y-2">
                                                ${isExpanded ? '<div class="text-slate-400 text-xs py-2">Loading children...</div>' : ''}
                                            </div>
                                        </td>
                                    </tr>
                                    `;
                                }).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            for (const pid of expandedParentIds) {
                const parent = parents.find(p => p.id === pid);
                if (parent) {
                    loadParentChildrenList(parent.id, parent.name);
                }
            }
        } catch (error) {
            container.innerHTML = `<div class="p-8 text-center text-xs text-red-500">Failed to load parents: ${escapeHtml(error.message)}</div>`;
        }
    }

    async function toggleParentChildren(parentId, parentName) {
        const row = document.getElementById(`parent-children-row-${parentId}`);
        if (!row) return;

        if (expandedParentIds.has(parentId)) {
            expandedParentIds.delete(parentId);
            row.classList.add("hidden");
            const btn = document.querySelector(`#parent-row-${parentId} button:first-child`);
            if (btn) btn.textContent = "Children";
        } else {
            expandedParentIds.add(parentId);
            row.classList.remove("hidden");
            const btn = document.querySelector(`#parent-row-${parentId} button:first-child`);
            if (btn) btn.textContent = "Hide Children";
            await loadParentChildrenList(parentId, parentName);
        }
    }

    async function loadParentChildrenList(parentId, parentName) {
        const container = document.getElementById(`parent-children-container-${parentId}`);
        if (!container) return;

        container.innerHTML = `<div class="text-slate-400 text-xs py-2">Loading linked children...</div>`;

        try {
            const data = await apiRequest(`/admin/parents/${parentId}/children`);
            const children = data.children || [];

            const countBadge = document.getElementById(`parent-child-count-badge-${parentId}`);
            if (countBadge) {
                countBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-black ${children.length > 0 ? 'bg-ok/10 text-ok' : 'bg-slate-100 text-slate-500'}`;
                countBadge.textContent = `${children.length} child${children.length === 1 ? '' : 'ren'}`;
            }

            if (children.length === 0) {
                container.innerHTML = `
                    <div class="flex items-center justify-between p-3 bg-white border border-slate-200 rounded text-xs">
                        <span class="text-slate-400">No children linked to this parent yet.</span>
                        <button type="button" onclick="window.KambusAdmin.openLinkChildModal(${parentId}, ${jsArg(parentName)})" class="text-brand font-semibold hover:underline">
                            + Link a Student
                        </button>
                    </div>
                `;
                return;
            }

            container.innerHTML = `
                <div class="bg-white border border-slate-200 rounded overflow-hidden">
                    <div class="px-3 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                        <span class="text-[11px] font-black text-slate-600 uppercase tracking-wider">Linked Children (${children.length})</span>
                        <button type="button" onclick="window.KambusAdmin.openLinkChildModal(${parentId}, ${jsArg(parentName)})" class="text-[11px] text-brand font-bold hover:underline">
                            + Link Another Child
                        </button>
                    </div>
                    <div class="divide-y divide-slate-100">
                        ${children.map(c => `
                            <div class="p-3 flex items-center justify-between gap-3 text-xs">
                                <div>
                                    <span class="font-bold text-slate-900">${escapeHtml(c.name || 'Unnamed Student')}</span>
                                    <span class="ml-2 font-mono font-bold text-brand uppercase text-[11px]">${escapeHtml(c.roll_number)}</span>
                                    <span class="ml-2 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold">${escapeHtml(c.relationship_type || 'Child')}</span>
                                </div>
                                <button type="button" onclick="window.KambusAdmin.unlinkChild(${parentId}, ${c.student_id}, ${jsArg(c.name || c.roll_number)}, ${jsArg(parentName)})" class="px-2 py-1 text-danger hover:bg-danger/10 rounded font-semibold text-[11px] transition">
                                    Unlink
                                </button>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        } catch (error) {
            container.innerHTML = `<div class="p-3 text-xs text-red-500">Failed to load linked children: ${escapeHtml(error.message)}</div>`;
        }
    }

    function openAddParentModal() {
        const errorEl = document.getElementById("addParentError");
        if (errorEl) {
            errorEl.classList.add("hidden");
            errorEl.textContent = "";
        }
        const nameEl = document.getElementById("addParentName");
        const phoneEl = document.getElementById("addParentPhone");
        const passwordEl = document.getElementById("addParentPassword");
        const emailEl = document.getElementById("addParentEmail");
        const loginIdEl = document.getElementById("addParentLoginId");
        if (nameEl) nameEl.value = "";
        if (phoneEl) phoneEl.value = "";
        if (passwordEl) passwordEl.value = "";
        if (emailEl) emailEl.value = "";
        if (loginIdEl) loginIdEl.value = "";

        const campusRow = document.getElementById("addParentCampusRow");
        const campusSelect = document.getElementById("addParentCampusSelect");
        if (isPlatformSuperAdmin()) {
            if (campusRow) campusRow.classList.remove("hidden");
            if (campusSelect) {
                campusSelect.innerHTML = `<option value="">-- Select Campus --</option>` +
                    (cachedCampuses || []).filter(c => c.is_active !== false).map(c =>
                        `<option value="${c.id}">${escapeHtml(c.name)} (ID: ${c.id})</option>`
                    ).join("");
                const activeId = getSelectedCampusId();
                if (activeId) campusSelect.value = String(activeId);
            }
        } else {
            if (campusRow) campusRow.classList.add("hidden");
        }

        document.getElementById("addParentModal")?.classList.remove("hidden");
    }

    async function submitAddParent(event) {
        event.preventDefault();
        const form = event.target;
        const errorEl = document.getElementById("addParentError");
        const submitBtn = document.getElementById("btnSubmitAddParent");

        if (errorEl) {
            errorEl.classList.add("hidden");
            errorEl.textContent = "";
        }

        const name = form.name.value.trim();
        const phone = form.phone.value.trim();
        const password = form.password.value;
        const email = form.email.value.trim();
        const loginId = form.login_id.value.trim();

        if (!name || !phone || !password) {
            if (errorEl) {
                errorEl.textContent = "Name, phone, and password are required.";
                errorEl.classList.remove("hidden");
            }
            return;
        }

        let campusId = null;
        if (isPlatformSuperAdmin()) {
            const campusSelect = document.getElementById("addParentCampusSelect");
            if (campusSelect && campusSelect.value) {
                campusId = parseInt(campusSelect.value, 10);
            } else {
                campusId = getSelectedCampusId();
            }
            if (!campusId) {
                if (errorEl) {
                    errorEl.textContent = "Please select a campus for the parent account.";
                    errorEl.classList.remove("hidden");
                }
                return;
            }
        }

        if (submitBtn) submitBtn.disabled = true;

        try {
            const body = {
                name,
                phone,
                password,
                email: email || null,
                login_id: loginId || null,
            };
            if (campusId) {
                body.campus_id = campusId;
            }

            const created = await apiRequest("/parent/create", {
                method: "POST",
                body,
            });

            document.getElementById("addParentModal")?.classList.add("hidden");
            showToast("success", "Parent Created", `Parent ${created.name} (${created.login_id}) successfully created.`);
            loadParents();
        } catch (error) {
            if (errorEl) {
                errorEl.textContent = error.message || "Failed to create parent account.";
                errorEl.classList.remove("hidden");
            } else {
                showToast("error", "Failed to Add Parent", error.message);
            }
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    function openEditParentModal(parentId) {
        const parent = cachedParents.find(p => p.id === parentId);
        if (!parent) return;

        const errorEl = document.getElementById("editParentError");
        if (errorEl) {
            errorEl.classList.add("hidden");
            errorEl.textContent = "";
        }

        document.getElementById("editParentId").value = parent.id;
        document.getElementById("editParentLoginId").textContent = `ID: ${parent.login_id || '-'}`;
        document.getElementById("editParentName").value = parent.name || "";
        document.getElementById("editParentPhone").value = parent.phone || "";
        document.getElementById("editParentEmail").value = parent.email || "";
        document.getElementById("editParentPassword").value = "";

        document.getElementById("editParentModal")?.classList.remove("hidden");
    }

    async function submitEditParent(event) {
        event.preventDefault();
        const form = event.target;
        const parentId = form.parent_id.value;
        const name = form.name.value.trim();
        const phone = form.phone.value.trim();
        const email = form.email.value.trim();
        const password = form.password.value;
        const errorEl = document.getElementById("editParentError");
        const submitBtn = document.getElementById("btnSubmitEditParent");

        if (!name || !phone) {
            if (errorEl) {
                errorEl.textContent = "Name and phone number are required.";
                errorEl.classList.remove("hidden");
            }
            return;
        }

        const body = {
            name,
            phone,
            email: email || null
        };
        if (password) {
            body.password = password;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Saving...";
            }
            if (errorEl) errorEl.classList.add("hidden");

            await apiRequest(`/admin/parents/${parentId}`, {
                method: "PATCH",
                body
            });

            showToast("success", "Parent Updated", `Parent ${name} profile updated successfully.`);
            document.getElementById("editParentModal")?.classList.add("hidden");
            loadParents();
        } catch (error) {
            if (errorEl) {
                errorEl.textContent = error.message || "Failed to update parent profile";
                errorEl.classList.remove("hidden");
            } else {
                showToast("error", "Update Failed", error.message);
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Save Changes";
            }
        }
    }

    function openLinkChildModal(parentId, parentName) {
        selectedLinkParentId = parentId;
        selectedLinkStudentId = null;

        const parentIdInput = document.getElementById("linkParentId");
        if (parentIdInput) parentIdInput.value = parentId;

        const studentIdInput = document.getElementById("linkSelectedStudentId");
        if (studentIdInput) studentIdInput.value = "";

        const parentInfo = document.getElementById("linkChildParentInfo");
        if (parentInfo) parentInfo.textContent = `Linking student for parent: ${parentName}`;

        const searchInput = document.getElementById("linkStudentSearchInput");
        if (searchInput) searchInput.value = "";

        const errorEl = document.getElementById("linkChildError");
        if (errorEl) {
            errorEl.classList.add("hidden");
            errorEl.textContent = "";
        }

        clearSelectedLinkStudent();
        document.getElementById("linkChildModal")?.classList.remove("hidden");
        searchStudentsForPicker("");
    }

    function onSearchLinkStudents(event) {
        const query = event.target.value.trim();
        clearTimeout(linkStudentSearchDebounceTimer);
        linkStudentSearchDebounceTimer = setTimeout(() => {
            searchStudentsForPicker(query);
        }, 300);
    }

    async function searchStudentsForPicker(query) {
        const container = document.getElementById("linkStudentResultsContainer");
        if (!container) return;

        container.innerHTML = `<div class="p-3 text-center text-xs text-slate-400">Searching students...</div>`;

        try {
            const baseEndpoint = "/admin/students?campus_type=school";
            const endpoint = query ? `${baseEndpoint}&search=${encodeURIComponent(query)}` : baseEndpoint;
            const data = await apiRequest(endpoint);
            const rawStudents = data.students || [];
            const students = rawStudents.filter(s => !s.campus_type || s.campus_type === "school");

            if (students.length === 0) {
                container.innerHTML = `<div class="p-3 text-center text-xs text-slate-400">No school students found matching "${escapeHtml(query)}".</div>`;
                return;
            }

            container.innerHTML = students.slice(0, 20).map(s => `
                <div class="p-2.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer transition" onclick="window.KambusAdmin.selectLinkStudent(${s.student_id}, ${jsArg(s.name)}, ${jsArg(s.roll_number)})">
                    <div>
                        <span class="font-bold text-navy text-xs">${escapeHtml(s.name)}</span>
                        <span class="ml-2 font-mono font-bold text-brand uppercase text-[11px]">${escapeHtml(s.roll_number)}</span>
                        <span class="ml-2 text-slate-400 text-[11px]">${escapeHtml(s.department || '')}</span>
                    </div>
                    <button type="button" class="px-2 py-0.5 bg-brand/10 hover:bg-brand hover:text-white text-brand rounded text-[11px] font-bold transition">
                        Select
                    </button>
                </div>
            `).join("");
        } catch (error) {
            container.innerHTML = `<div class="p-3 text-center text-xs text-red-500">Search error: ${escapeHtml(error.message)}</div>`;
        }
    }

    function selectLinkStudent(studentId, name, rollNumber) {
        selectedLinkStudentId = studentId;
        const studentIdInput = document.getElementById("linkSelectedStudentId");
        if (studentIdInput) studentIdInput.value = studentId;

        const preview = document.getElementById("selectedStudentPreview");
        const nameEl = document.getElementById("selectedStudentName");
        const rollEl = document.getElementById("selectedStudentRoll");

        if (nameEl) nameEl.textContent = name;
        if (rollEl) rollEl.textContent = rollNumber;
        if (preview) preview.classList.remove("hidden");

        const errorEl = document.getElementById("linkChildError");
        if (errorEl) errorEl.classList.add("hidden");
    }

    function clearSelectedLinkStudent() {
        selectedLinkStudentId = null;
        const studentIdInput = document.getElementById("linkSelectedStudentId");
        if (studentIdInput) studentIdInput.value = "";
        const preview = document.getElementById("selectedStudentPreview");
        if (preview) preview.classList.add("hidden");
    }

    async function submitLinkChild(event) {
        event.preventDefault();
        const errorEl = document.getElementById("linkChildError");
        const submitBtn = document.getElementById("btnSubmitLinkChild");

        if (errorEl) {
            errorEl.classList.add("hidden");
            errorEl.textContent = "";
        }

        if (!selectedLinkParentId) {
            if (errorEl) {
                errorEl.textContent = "No parent selected.";
                errorEl.classList.remove("hidden");
            }
            return;
        }

        if (!selectedLinkStudentId) {
            if (errorEl) {
                errorEl.textContent = "Please search and select a student to link.";
                errorEl.classList.remove("hidden");
            }
            return;
        }

        const relationshipType = document.getElementById("linkRelationshipType")?.value || "Child";

        if (submitBtn) submitBtn.disabled = true;

        try {
            await apiRequest("/parent/link-child", {
                method: "POST",
                body: {
                    parent_id: parseInt(selectedLinkParentId),
                    student_id: parseInt(selectedLinkStudentId),
                    relationship_type: relationshipType,
                },
            });

            document.getElementById("linkChildModal")?.classList.add("hidden");
            showToast("success", "Child Linked", "Student linked to parent successfully.");

            loadParents();
        } catch (error) {
            if (errorEl) {
                errorEl.textContent = error.message || "Failed to link child.";
                errorEl.classList.remove("hidden");
            } else {
                showToast("error", "Link Failed", error.message);
            }
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async function unlinkChild(parentId, studentId, childName, parentName) {
        const confirmed = window.confirm(`Are you sure you want to unlink "${childName}" from parent "${parentName}"?`);
        if (!confirmed) return;

        try {
            await apiRequest(`/parent/unlink-child?parent_id=${parentId}&student_id=${studentId}`, {
                method: "DELETE",
            });

            showToast("info", "Unlinked", `Child "${childName}" was unlinked.`);
            await loadParentChildrenList(parentId, parentName);
            loadParents();
        } catch (error) {
            showToast("error", "Unlink Failed", error.message);
        }
    }

    // =========================================================================
    // 5. STOP MANAGEMENT (WITH INTERACTIVE LEAFLET PICKER & RESIZE BUG-010)
    // =========================================================================

    async function loadStops() {
        const container = document.getElementById("stopsList");
        if (!container) return;

        if (isPlatformSuperAdmin() && !getSelectedCampusId()) {
            cachedStops = [];
            container.innerHTML = `<div class="p-8 text-center text-xs text-amber-800 bg-amber-50/60 border border-amber-200/80 rounded-xl font-semibold">No campus selected. Please select a campus from the top navigation to view its stops.</div>`;
            return;
        }

        container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Loading stops...</div>`;

        try {
            const filterRouteSelect = document.getElementById("stopFilterRoute");
            const filterRouteId = filterRouteSelect && filterRouteSelect.value ? filterRouteSelect.value : "";
            const endpoint = filterRouteId ? `/admin/stops?route_id=${filterRouteId}` : "/admin/stops";

            const data = await apiRequest(endpoint);
            const stops = data.stops || [];
            cachedStops = stops;

            if (stops.length === 0) {
                container.innerHTML = `<div class="kx-empty-card text-xs text-slate-400">No stops found. Click "Add Stop" to create one.</div>`;
                return;
            }

            container.innerHTML = stops.map(s => `
                <div class="kx-card p-4 flex items-center justify-between gap-3 text-xs">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded bg-brand/10 text-brand font-black flex items-center justify-center text-xs shrink-0">
                            #${s.stop_order}
                        </span>
                        <div>
                            <h4 class="font-black text-slate-900 text-sm">${escapeHtml(s.name)}</h4>
                            <p class="text-slate-500 font-semibold">Route: <strong>${escapeHtml(s.route_name || 'Unassigned')}</strong> &bull; Students: <strong>${s.student_count}</strong> students assigned</p>
                            <p class="text-[10px] font-mono text-slate-400 mt-0.5">Lat: ${Number(s.latitude).toFixed(5)}, Lng: ${Number(s.longitude).toFixed(5)}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="window.KambusAdmin.openEditStopModal(${s.stop_id})" class="text-slate-400 hover:text-brand p-2 transition" title="Edit Stop">
                            <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-pen"/></svg>
                        </button>
                        <button type="button" onclick="window.KambusAdmin.deleteStop(${s.stop_id}, ${jsArg(s.name)})" class="text-slate-300 hover:text-danger p-2 transition" title="Delete Stop">
                            <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-trash"/></svg>
                        </button>
                    </div>
                </div>
            `).join("");
        } catch (e) {
            container.innerHTML = `<div class="p-8 text-center text-xs text-red-500">Failed to load stops: ${escapeHtml(e.message)}</div>`;
        }
    }

    async function openEditStopModal(stopId) {
        try {
            await loadRoutesDropdown();
            let stop = cachedStops.find(s => s.stop_id === stopId);
            if (!stop) {
                stop = await apiRequest(`/admin/stops/${stopId}`);
            }

            document.getElementById("editStopId").value = stop.stop_id || stopId;
            document.getElementById("editStopName").value = stop.name || "";
            document.getElementById("editStopRouteId").value = stop.route_id || "";
            document.getElementById("editStopOrder").value = stop.stop_order || 1;

            const stopLat = Number(stop.latitude);
            const stopLng = Number(stop.longitude);
            const eveningLat = Number(stop.evening_latitude);
            const eveningLng = Number(stop.evening_longitude);
            const hasEveningCoordinates = stop.evening_latitude !== null
                && stop.evening_latitude !== undefined
                && stop.evening_longitude !== null
                && stop.evening_longitude !== undefined
                && Number.isFinite(eveningLat)
                && Number.isFinite(eveningLng);
            document.getElementById("editStopLat").value = stopLat;
            document.getElementById("editStopLng").value = stopLng;
            document.getElementById("editStopEveningLat").value = hasEveningCoordinates ? eveningLat : "";
            document.getElementById("editStopEveningLng").value = hasEveningCoordinates ? eveningLng : "";
            document.getElementById("editStopDropCoordsDisplay").textContent = hasEveningCoordinates
                ? `Drop: ${eveningLat.toFixed(5)}, ${eveningLng.toFixed(5)}`
                : "Drop: not set";
            editStopPickMode = "pickup";
            if (editStopPickerDropMarker && editStopPickerMap) {
                editStopPickerMap.removeLayer(editStopPickerDropMarker);
            }
            editStopPickerDropMarker = null;
            document.getElementById("editStopPickupModeBtn").onclick = () => {
                editStopPickMode = "pickup";
                updateEditStopModeButtons();
            };
            document.getElementById("editStopDropModeBtn").onclick = () => {
                editStopPickMode = "drop";
                updateEditStopModeButtons();
            };
            updateEditStopModeButtons();

            document.getElementById("editStopModal")?.classList.remove("hidden");

            setTimeout(() => {
                initEditStopMapPicker(stopLat, stopLng);
            }, 150);
        } catch (e) {
            showToast("error", "Error", "Could not load stop details for editing: " + e.message);
        }
    }

    function createStopPickerIcon(color) {
        return L.divIcon({
            className: "",
            html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:3px solid #ffffff;box-shadow:0 1px 5px rgba(0,0,0,.35);"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
    }

    function updateAddStopModeButtons() {
        const pickupButton = document.getElementById("addStopPickupModeBtn");
        const dropButton = document.getElementById("addStopDropModeBtn");

        [[pickupButton, addStopPickMode === "pickup"], [dropButton, addStopPickMode === "drop"]].forEach(([button, active]) => {
            if (!button) return;
            button.classList.toggle("bg-brand", active);
            button.classList.toggle("text-white", active);
            button.classList.toggle("border-brand", active);
            button.classList.toggle("bg-bg", !active);
            button.classList.toggle("text-navy", !active);
            button.classList.toggle("border-line", !active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function updateEditStopModeButtons() {
        const pickupButton = document.getElementById("editStopPickupModeBtn");
        const dropButton = document.getElementById("editStopDropModeBtn");

        [[pickupButton, editStopPickMode === "pickup"], [dropButton, editStopPickMode === "drop"]].forEach(([button, active]) => {
            if (!button) return;
            button.classList.toggle("bg-brand", active);
            button.classList.toggle("text-white", active);
            button.classList.toggle("border-brand", active);
            button.classList.toggle("bg-bg", !active);
            button.classList.toggle("text-navy", !active);
            button.classList.toggle("border-line", !active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function initEditStopMapPicker(defaultLat, defaultLng) {
        const container = document.getElementById("editStopPickerMapContainer");
        if (!container) return;

        const lat = Number.isFinite(defaultLat) ? defaultLat : COLLEGE_COORDS[0];
        const lng = Number.isFinite(defaultLng) ? defaultLng : COLLEGE_COORDS[1];

        if (!editStopPickerMap) {
            editStopPickerMap = L.map("editStopPickerMapContainer").setView([lat, lng], 14);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19
            }).addTo(editStopPickerMap);

            editStopPickerMap.on("click", (e) => {
                if (editStopPickMode === "pickup") {
                    setEditStopPickerCoords(e.latlng.lat, e.latlng.lng);
                } else {
                    setEditStopPickerDropCoords(e.latlng.lat, e.latlng.lng);
                }
            });
        } else {
            editStopPickerMap.setView([lat, lng], 14);
        }

        setTimeout(() => {
            if (editStopPickerMap) editStopPickerMap.invalidateSize();
        }, 200);

        setEditStopPickerCoords(lat, lng);
        const eveningLat = Number(document.getElementById("editStopEveningLat")?.value);
        const eveningLng = Number(document.getElementById("editStopEveningLng")?.value);
        if (Number.isFinite(eveningLat) && Number.isFinite(eveningLng)) {
            setEditStopPickerDropCoords(eveningLat, eveningLng);
        }
    }

    function setEditStopPickerCoords(lat, lng) {
        const latInput = document.getElementById("editStopLat");
        const lngInput = document.getElementById("editStopLng");
        const display = document.getElementById("editStopPickupCoordsDisplay");

        if (latInput) latInput.value = lat;
        if (lngInput) lngInput.value = lng;
        if (display) display.textContent = `Pickup: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        if (editStopPickerMarker) {
            editStopPickerMarker.setLatLng([lat, lng]);
            editStopPickerMarker.setIcon(createStopPickerIcon("#16a34a"));
        } else if (editStopPickerMap) {
            editStopPickerMarker = L.marker([lat, lng], { draggable: true, icon: createStopPickerIcon("#16a34a") }).addTo(editStopPickerMap);
            editStopPickerMarker.on("dragend", (e) => {
                const pos = e.target.getLatLng();
                setEditStopPickerCoords(pos.lat, pos.lng);
            });
        }
    }

    function getAnnouncementStyle(templateType) {
        const type = String(templateType || "").toUpperCase();
        if (type === "CUSTOM") {
            return { className: "announcement-card--general", icon: "📢", label: "Custom" };
        }
        if (["TEMPLATE_C", "TEMPLATE_H"].includes(type)) {
            return { className: "announcement-card--urgent", icon: "⚠️", label: "Heads up" };
        }
        if (["TEMPLATE_A", "TEMPLATE_B", "TEMPLATE_D", "TEMPLATE_F"].includes(type)) {
            return { className: "announcement-card--bus", icon: "🚌", label: "Bus update" };
        }
        if (type === "TEMPLATE_G") {
            return { className: "announcement-card--stop", icon: "📍", label: "Stop update" };
        }
        return { className: "announcement-card--general", icon: "✨", label: "Update" };
    }

    function formatAnnouncementTime(value) {
        const timestamp = new Date(value).getTime();
        if (!Number.isFinite(timestamp)) return formatDateTime(value);

        const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
        if (seconds < 60) return "now";
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return formatDateTime(value);
    }

    async function handleAdminLogout(event) {
        if (event) event.preventDefault();

        const confirmed = await confirm("Are you sure you want to log out?");
        if (!confirmed) return;

        localStorage.removeItem("kambus_token");
        localStorage.removeItem("kambus_role");
        localStorage.removeItem("kambus_user_id");
        localStorage.removeItem("kambus_active_campus_id");
        localStorage.removeItem("kambus_ops_dashboard");
        if (window.AndroidSession && typeof window.AndroidSession.clearSession === "function") {
            try { window.AndroidSession.clearSession(); } catch (_) {}
        }
        window.location.href = "index.html";
    }

    function setEditStopPickerDropCoords(lat, lng) {
        const latInput = document.getElementById("editStopEveningLat");
        const lngInput = document.getElementById("editStopEveningLng");
        const display = document.getElementById("editStopDropCoordsDisplay");

        if (latInput) latInput.value = lat;
        if (lngInput) lngInput.value = lng;
        if (display) display.textContent = `Drop: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        if (editStopPickerDropMarker) {
            editStopPickerDropMarker.setLatLng([lat, lng]);
            editStopPickerDropMarker.setIcon(createStopPickerIcon("#dc2626"));
        } else if (editStopPickerMap) {
            editStopPickerDropMarker = L.marker([lat, lng], { draggable: true, icon: createStopPickerIcon("#dc2626") }).addTo(editStopPickerMap);
            editStopPickerDropMarker.on("dragend", (e) => {
                const pos = e.target.getLatLng();
                setEditStopPickerDropCoords(pos.lat, pos.lng);
            });
        }
    }

    async function submitEditStop(event) {
        event.preventDefault();
        const form = event.target;
        const stopId = form.stop_id.value;
        const name = form.name.value.trim();
        const routeId = parseInt(form.route_id.value);
        const stopOrder = parseInt(form.stop_order.value);
        const latitude = parseFloat(form.latitude.value);
        const longitude = parseFloat(form.longitude.value);
        const eveningLat = parseFloat(document.getElementById("editStopEveningLat")?.value);
        const eveningLng = parseFloat(document.getElementById("editStopEveningLng")?.value);

        if (isNaN(latitude) || isNaN(longitude)) {
            showToast("error", "Invalid Coordinates", "Please enter valid numeric latitude and longitude.");
            return;
        }

        try {
            const body = {
                name,
                route_id: routeId,
                stop_order: stopOrder,
                latitude,
                longitude
            };
            if (!isNaN(eveningLat) && !isNaN(eveningLng)) {
                body.evening_latitude = eveningLat;
                body.evening_longitude = eveningLng;
            }
            await apiRequest(`/admin/stops/${stopId}`, {
                method: "PATCH",
                body
            });

            showToast("success", "Stop Updated", `Stop "${name}" has been updated.`);
            document.getElementById("editStopModal")?.classList.add("hidden");
            form.reset();
            loadStops();
            loadStopsDropdown();
            loadRoutesDropdown();
            loadDashboard();
        } catch (error) {
            showToast("error", "Update Failed", error.message);
        }
    }

    function initStopMapPicker(defaultLat, defaultLng) {
        const container = document.getElementById("stopPickerMapContainer");
        if (!container) return;

        const lat = defaultLat || COLLEGE_COORDS[0];
        const lng = defaultLng || COLLEGE_COORDS[1];

        if (!stopPickerMap) {
            stopPickerMap = L.map("stopPickerMapContainer").setView([lat, lng], 13);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19
            }).addTo(stopPickerMap);

            stopPickerMap.on("click", (e) => {
                if (addStopPickMode === "pickup") {
                    setStopPickerCoords(e.latlng.lat, e.latlng.lng);
                } else {
                    setStopPickerDropCoords(e.latlng.lat, e.latlng.lng);
                }
            });
        } else {
            stopPickerMap.setView([lat, lng], 13);
        }

        // Force Leaflet recalculation after modal renders (BUG-010)
        setTimeout(() => {
            if (stopPickerMap) stopPickerMap.invalidateSize();
        }, 200);

        setStopPickerCoords(lat, lng);
    }

    function setStopPickerCoords(lat, lng) {
        const latInput = document.getElementById("addStopLat");
        const lngInput = document.getElementById("addStopLng");
        const display = document.getElementById("addStopPickupCoordsDisplay");

        if (latInput) latInput.value = lat;
        if (lngInput) lngInput.value = lng;
        if (display) display.textContent = `Pickup: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        if (stopPickerMarker) {
            stopPickerMarker.setLatLng([lat, lng]);
            stopPickerMarker.setIcon(createStopPickerIcon("#16a34a"));
        } else if (stopPickerMap) {
            stopPickerMarker = L.marker([lat, lng], { draggable: true, icon: createStopPickerIcon("#16a34a") }).addTo(stopPickerMap);
            stopPickerMarker.on("dragend", (e) => {
                const pos = e.target.getLatLng();
                setStopPickerCoords(pos.lat, pos.lng);
            });
        }
    }

    function setStopPickerDropCoords(lat, lng) {
        const latInput = document.getElementById("addStopEveningLat");
        const lngInput = document.getElementById("addStopEveningLng");
        const display = document.getElementById("addStopDropCoordsDisplay");

        if (latInput) latInput.value = lat;
        if (lngInput) lngInput.value = lng;
        if (display) display.textContent = `Drop: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        if (stopPickerDropMarker) {
            stopPickerDropMarker.setLatLng([lat, lng]);
            stopPickerDropMarker.setIcon(createStopPickerIcon("#dc2626"));
        } else if (stopPickerMap) {
            stopPickerDropMarker = L.marker([lat, lng], { draggable: true, icon: createStopPickerIcon("#dc2626") }).addTo(stopPickerMap);
            stopPickerDropMarker.on("dragend", (e) => {
                const pos = e.target.getLatLng();
                setStopPickerDropCoords(pos.lat, pos.lng);
            });
        }
    }

    async function submitAddStop(event) {
        event.preventDefault();
        const form = event.target;
        const name = form.name.value.trim();
        const routeId = parseInt(form.route_id.value);
        const stopOrder = parseInt(form.stop_order.value);
        const latitude = parseFloat(document.getElementById("addStopLat")?.value);
        const longitude = parseFloat(document.getElementById("addStopLng")?.value);
        const eveningLat = parseFloat(document.getElementById("addStopEveningLat")?.value);
        const eveningLng = parseFloat(document.getElementById("addStopEveningLng")?.value);

        if (isNaN(latitude) || isNaN(longitude)) {
            showToast("error", "Location Required", "Please click on the map to place the stop pin.");
            return;
        }

        try {
            const body = { name, latitude, longitude, stop_order: stopOrder };
            if (!isNaN(eveningLat) && !isNaN(eveningLng)) {
                body.evening_latitude = eveningLat;
                body.evening_longitude = eveningLng;
            }
            await apiRequest(`/admin/routes/${routeId}/stops`, {
                method: "POST",
                body
            });

            showToast("success", "Stop Created", `Stop "${name}" added to route.`);
            document.getElementById("addStopModal")?.classList.add("hidden");
            form.reset();
            loadStops();
            loadStopsDropdown();
            loadRoutesDropdown();
            loadDashboard();
        } catch (e) {
            showToast("error", "Failed to Add Stop", e.message);
        }
    }

    async function deleteStop(stopId, stopName) {
        const confirmed = await confirm(`Are you sure you want to delete stop "${stopName}"?`);
        if (!confirmed) return;
        try {
            const result = await apiRequest(`/admin/stops/${stopId}`, { method: "DELETE" });
            if (result.action === "deactivated") {
                showToast("info", "Stop Deactivated", result.message || `Stop "${stopName}" has historical references and was deactivated instead of deleted.`);
            } else {
                showToast("info", "Stop Deleted", `Stop "${stopName}" removed.`);
            }
            loadStops();
            loadStopsDropdown();
            loadRoutesDropdown();
            loadDashboard();
        } catch (e) {
            showToast("error", "Delete Failed", e.message);
        }
    }

    // =========================================================================
    // 6. ROUTE MANAGEMENT (WITH OSRM ROAD MAP & STOP REORDERING BUG-009)
    // =========================================================================

    async function loadRoutes() {
        const container = document.getElementById("routesList");
        if (!container) return;

        if (isPlatformSuperAdmin() && !getSelectedCampusId()) {
            cachedRoutes = [];
            container.innerHTML = `<div class="p-8 text-center text-xs text-amber-800 bg-amber-50/60 border border-amber-200/80 rounded-xl font-semibold">No campus selected. Please select a campus from the top navigation to view its routes.</div>`;
            return;
        }

        container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Loading routes...</div>`;

        try {
            const data = await apiRequest("/admin/routes");
            cachedRoutes = data.routes || [];

            if (cachedRoutes.length === 0) {
                container.innerHTML = `<div class="kx-empty-card text-xs text-slate-400">No routes configured. Click "Create Route" to start.</div>`;
                return;
            }

            container.innerHTML = cachedRoutes.map(r => `
                <div class="kx-card p-5">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="text-base font-black text-slate-900">${escapeHtml(r.name)}</h3>
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-brand/10 text-brand">${r.stops_count} Stops</span>
                            </div>
                            <p class="text-xs text-slate-500 mt-1">${escapeHtml(r.description || 'No description provided')}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button type="button" onclick="window.KambusAdmin.openEditRouteModal(${r.route_id})" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-xs flex items-center gap-1 transition" title="Edit Route Details">
                                <svg class="w-3.5 h-3.5 shrink-0" aria-hidden="true"><use href="icons.svg#icon-pen"/></svg> Edit
                            </button>
                            <button type="button" onclick="window.KambusAdmin.previewRouteRoadMap(${r.route_id})" class="px-3 py-1.5 bg-brand hover:bg-brandDark text-white font-bold rounded text-xs flex items-center gap-1.5 shadow-2xs">
                                <svg class="w-4 h-4 shrink-0 inline mr-1" aria-hidden="true"><use href="icons.svg#icon-route"/></svg> View Road Map
                            </button>
                            <button type="button" onclick="window.KambusAdmin.deleteRoute(${r.route_id}, ${jsArg(r.name)})" class="text-slate-300 hover:text-danger p-1.5 transition" title="Delete Route">
                                <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-trash"/></svg>
                            </button>
                        </div>
                    </div>

                    <!-- Stops Timeline List with Reorder Controls (BUG-009) -->
                    <div class="mt-4 pt-3 border-t border-slate-100">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-[11px] font-black uppercase text-slate-400">Route Sequence (Transit stops to KITSW)</span>
                        </div>
                        <div class="flex items-center gap-2 overflow-x-auto pb-2">
                            ${(r.stops || []).map((stop, idx, arr) => `
                                <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded px-2.5 py-1.5 shrink-0 text-xs">
                                    <span class="font-black text-brand">#${stop.stop_order}</span>
                                    <span class="font-bold text-slate-800">${escapeHtml(stop.name)}</span>
                                    <div class="flex items-center gap-0.5 ml-1">
                                        ${idx > 0 ? `<button onclick="window.KambusAdmin.reorderRouteStop(${r.route_id}, ${stop.stop_id}, 'up')" class="px-1 text-slate-400 hover:text-brand font-bold" title="Move earlier">&larr;</button>` : ''}
                                        ${idx < arr.length - 1 ? `<button onclick="window.KambusAdmin.reorderRouteStop(${r.route_id}, ${stop.stop_id}, 'down')" class="px-1 text-slate-400 hover:text-brand font-bold" title="Move later">&rarr;</button>` : ''}
                                    </div>
                                </div>
                            `).join("<span class='text-slate-300 font-bold'>&rarr;</span>") || '<span class="text-slate-400 text-xs">No stops created for this route yet.</span>'}
                        </div>
                    </div>
                </div>
            `).join("");
        } catch (e) {
            container.innerHTML = `<div class="p-8 text-center text-xs text-red-500">Failed to load routes: ${escapeHtml(e.message)}</div>`;
        }
    }

    async function reorderRouteStop(routeId, stopId, direction) {
        const route = cachedRoutes.find(r => r.route_id === routeId);
        if (!route || !route.stops) return;

        const stopIds = route.stops.map(s => s.stop_id);
        const idx = stopIds.indexOf(stopId);
        if (idx === -1) return;

        if (direction === "up" && idx > 0) {
            const temp = stopIds[idx - 1];
            stopIds[idx - 1] = stopIds[idx];
            stopIds[idx] = temp;
        } else if (direction === "down" && idx < stopIds.length - 1) {
            const temp = stopIds[idx + 1];
            stopIds[idx + 1] = stopIds[idx];
            stopIds[idx] = temp;
        } else {
            return;
        }

        try {
            await apiRequest(`/admin/routes/${routeId}/reorder-stops`, {
                method: "POST",
                body: { stop_ids: stopIds }
            });
            showToast("success", "Reordered", "Stop sequence updated.");
            loadRoutes();
        } catch (e) {
            showToast("error", "Reorder Failed", e.message);
        }
    }

    async function submitAddRoute(event) {
        event.preventDefault();
        const form = event.target;
        const name = form.name.value.trim();
        const description = form.description.value.trim();

        try {
            await apiRequest("/admin/routes", {
                method: "POST",
                body: { name, description }
            });
            showToast("success", "Route Created", `Route "${name}" created.`);
            document.getElementById("addRouteModal")?.classList.add("hidden");
            form.reset();
            loadRoutes();
            loadDashboard();
        } catch (e) {
            showToast("error", "Failed to Add Route", e.message);
        }
    }

    function openEditRouteModal(routeId) {
        const route = cachedRoutes.find(r => r.route_id === routeId);
        if (!route) return;

        document.getElementById("editRouteId").value = route.route_id;
        document.getElementById("editRouteName").value = route.name || "";
        document.getElementById("editRouteDescription").value = route.description || "";

        document.getElementById("editRouteModal")?.classList.remove("hidden");
    }

    async function submitEditRoute(event) {
        event.preventDefault();
        const form = event.target;
        const routeId = form.route_id.value;
        const name = form.name.value.trim();
        const description = form.description.value.trim();
        const submitBtn = document.getElementById("btnSubmitEditRoute");

        if (!name) {
            showToast("warning", "Validation", "Route name is required.");
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Saving...";
            }

            await apiRequest(`/admin/routes/${routeId}`, {
                method: "PATCH",
                body: {
                    name,
                    description: description || null
                }
            });

            showToast("success", "Route Updated", `Route "${name}" updated successfully.`);
            document.getElementById("editRouteModal")?.classList.add("hidden");
            loadRoutes();
        } catch (e) {
            showToast("error", "Update Failed", e.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Save Route";
            }
        }
    }

    async function deleteRoute(routeId, routeName) {
        const confirmed = await confirm(`Are you sure you want to delete route "${routeName}"? Stops and bus links will be cleared.`);
        if (!confirmed) return;
        try {
            await apiRequest(`/admin/routes/${routeId}`, { method: "DELETE" });
            showToast("info", "Route Deleted", `Route "${routeName}" removed.`);
            loadRoutes();
            loadDashboard();
        } catch (e) {
            showToast("error", "Delete Failed", e.message);
        }
    }

    async function previewRouteRoadMap(routeId) {
        const route = cachedRoutes.find(r => r.route_id === routeId) || await apiRequest(`/admin/routes/${routeId}`);
        if (!route) return;

        document.getElementById("routePreviewTitle").textContent = `${route.name} — Road Route`;
        document.getElementById("routePreviewModal")?.classList.remove("hidden");

        setTimeout(() => {
            const container = document.getElementById("routePreviewMap");
            if (!container) return;

            if (!routeMap) {
                routeMap = L.map("routePreviewMap").setView(COLLEGE_COORDS, 13);
                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 19
                }).addTo(routeMap);
            } else {
                routeMap.invalidateSize();
            }

            // Clear old layers
            routeMapLayers.forEach(l => routeMap.removeLayer(l));
            routeMapLayers = [];

            // Add College Pin
            const collegeIcon = L.divIcon({
                className: "",
                html: `<div style="background:var(--navy);color:#fff;border-radius:4px;padding:4px 8px;font-size:11px;font-weight:700;border:1px solid var(--line);display:flex;align-items:center;gap:4px;"><svg style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;"><use href="icons.svg#icon-kambus"/></svg> KITSW College</div>`,
                iconSize: [110, 24]
            });
            const collegeMarker = L.marker(COLLEGE_COORDS, { icon: collegeIcon }).addTo(routeMap);
            routeMapLayers.push(collegeMarker);

            const stops = route.stops || [];
            const latLngs = [];

            stops.forEach(s => {
                const stopIcon = L.divIcon({
                    className: "",
                    html: `<div style="background:#4F46E5;color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${s.stop_order}</div>`,
                    iconSize: [26, 26]
                });
                const marker = L.marker([s.latitude, s.longitude], { icon: stopIcon })
                    .bindPopup(`<strong>Stop ${s.stop_order}: ${escapeHtml(s.name)}</strong>`)
                    .addTo(routeMap);
                routeMapLayers.push(marker);
                latLngs.push([s.latitude, s.longitude]);
            });

            if (latLngs.length > 0) {
                latLngs.push(COLLEGE_COORDS);
                drawOsrmRoadPolyline(routeMap, latLngs, routeMapLayers);
                routeMap.fitBounds(L.latLngBounds(latLngs).pad(0.15));
            }
        }, 150);
    }

    async function drawOsrmRoadPolyline(mapInstance, coordsList, layerCollector) {
        if (coordsList.length < 2) return;
        try {
            const coordString = coordsList.map(c => `${c[1]},${c[0]}`).join(";");
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
            const res = await fetch(osrmUrl);
            const data = await res.json();

            if (data.routes && data.routes[0]) {
                const geojson = data.routes[0].geometry;
                const roadLine = L.geoJSON(geojson, {
                    style: { color: "#4F46E5", weight: 5, opacity: 0.85 }
                }).addTo(mapInstance);
                layerCollector.push(roadLine);
            } else {
                const line = L.polyline(coordsList, { color: "#4F46E5", weight: 4, dashArray: "4, 6" }).addTo(mapInstance);
                layerCollector.push(line);
            }
        } catch {
            const line = L.polyline(coordsList, { color: "#4F46E5", weight: 4, dashArray: "4, 6" }).addTo(mapInstance);
            layerCollector.push(line);
        }
    }

    // =========================================================================
    // 6c. DRIVER COMPLAINTS CONTROLLER
    // =========================================================================

    function formatComplaintReason(reason) {
        switch (reason) {
            case "rash_driving":
                return "Rash / Reckless Driving";
            case "delay":
                return "Severe Delay";
            case "overspeeding":
                return "Overspeeding";
            case "skipped_stop":
                return "Skipped Scheduled Stop";
            case "rude_behavior":
                return "Rude / Inappropriate Behavior";
            case "harassment":
                return "Harassment";
            case "nuisance":
                return "Nuisance / Misconduct";
            case "other":
                return "Other Concern";
            default:
                return escapeHtml((reason || "Complaint").replace(/_/g, " "));
        }
    }

    async function loadComplaints() {
        const container = document.getElementById("complaintsList");
        if (!container) return;
        container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Loading complaints...</div>`;

        await loadDriversDropdown();

        try {
            const filterDriverSelect = document.getElementById("complaintFilterDriver");
            const filterDriverId = filterDriverSelect && filterDriverSelect.value ? filterDriverSelect.value : "";
            const endpoint = filterDriverId ? `/admin/complaints?driver_id=${filterDriverId}` : "/admin/complaints";

            const data = await apiRequest(endpoint);
            cachedComplaints = data.complaints || [];

            // Update KPI Stats
            const statTotal = document.getElementById("complaintsStatTotal");
            const statCorroborated = document.getElementById("complaintsStatCorroborated");
            const statDriversCount = document.getElementById("complaintsStatDriversCount");

            const total = cachedComplaints.length;
            const corroborated = cachedComplaints.filter(c => c.corroboration && c.corroboration.is_corroborated).length;
            const reportedDrivers = new Set(cachedComplaints.map(c => c.driver_id)).size;

            if (statTotal) statTotal.textContent = total;
            if (statCorroborated) statCorroborated.textContent = corroborated;
            if (statDriversCount) statDriversCount.textContent = reportedDrivers;

            filterComplaintsList();
        } catch (e) {
            container.innerHTML = `<div class="p-8 text-center text-xs text-red-500">Failed to load complaints: ${escapeHtml(e.message)}</div>`;
        }
    }

    function filterComplaintsList() {
        const container = document.getElementById("complaintsList");
        if (!container) return;

        const filterStatus = document.getElementById("complaintFilterCorroborated")?.value || "all";
        let complaints = [...cachedComplaints];

        if (filterStatus === "corroborated") {
            complaints = complaints.filter(c => c.corroboration && c.corroboration.is_corroborated);
        } else if (filterStatus === "pending") {
            complaints = complaints.filter(c => !c.corroboration || !c.corroboration.is_corroborated);
        }

        if (complaints.length === 0) {
            container.innerHTML = `<div class="kx-empty-card text-xs text-slate-400">No complaints found matching the criteria.</div>`;
            return;
        }

        container.innerHTML = complaints.map(c => {
            const isCorroborated = c.corroboration && c.corroboration.is_corroborated;
            const yesVotes = c.corroboration?.yes_count || 0;
            const noVotes = c.corroboration?.no_count || 0;
            const totalVotes = c.corroboration?.total_votes || 0;

            return `
                <div class="kx-card p-5 space-y-3.5 ${isCorroborated ? 'border-danger/30 bg-danger/10' : ''}">
                    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-black text-sm text-slate-900">${formatComplaintReason(c.reason)}</span>
                                ${c.target_student_id ? `
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">Peer Report</span>
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 capitalize">Audience: ${escapeHtml(c.audience || 'both')}</span>
                                ` : ''}
                                ${isCorroborated ? `
                                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-danger/10 text-danger border border-danger/20 flex items-center gap-1">
                                        <svg class="w-3.5 h-3.5 shrink-0 inline mr-1" aria-hidden="true"><use href="icons.svg#icon-alert"/></svg> CORROBORATED
                                    </span>
                                ` : `
                                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                        ${c.status.toUpperCase()}
                                    </span>
                                `}
                            </div>
                            <p class="text-xs text-slate-400 mt-1 font-semibold">
                                Reported on ${formatDateTime(c.created_at)} &bull; By <strong>${escapeHtml(c.student_name)}</strong> (${escapeHtml(c.roll_number || 'Student')})
                            </p>
                        </div>

                        <!-- Target Info Tag -->
                        ${c.target_student_id ? `
                            <div class="bg-purple-50 border border-purple-200 rounded p-2.5 flex items-center gap-3 shrink-0 self-start">
                                <div>
                                    <span class="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-purple-200 text-purple-900 uppercase">Target Student</span>
                                    <p class="text-xs font-black text-slate-900 mt-0.5">${escapeHtml(c.target_student_name || 'Student #' + c.target_student_id)}</p>
                                    <p class="text-[10px] font-mono text-slate-500">${escapeHtml(c.target_student_roll_number || '')}</p>
                                </div>
                            </div>
                        ` : `
                            <div class="bg-slate-50 border border-slate-200 rounded p-2.5 flex items-center gap-3 shrink-0 self-start">
                                <div>
                                    <p class="text-xs font-black text-slate-900">${escapeHtml(c.driver_name || 'Driver')}</p>
                                    <p class="text-[10px] font-mono text-slate-500">${escapeHtml(c.driver_code || '')} &bull; ${c.bus_number ? `Bus ${escapeHtml(c.bus_number)}` : 'Bus Unassigned'}</p>
                                </div>
                                <span class="px-2 py-1 rounded-lg bg-warn/10 text-warn text-[10px] font-black" title="Driver total lifetime complaints">
                                    ${c.driver_total_complaints || 1} Total
                                </span>
                            </div>
                        `}
                    </div>

                    <!-- Description -->
                    ${c.description ? `
                        <div class="p-3 bg-slate-50 rounded border border-slate-100 text-xs text-slate-700 leading-relaxed">
                            <span class="font-bold text-slate-900">Student Comment:</span> ${escapeHtml(c.description)}
                        </div>
                    ` : ''}

                    <!-- Peer Corroboration Box -->
                    <div class="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-slate-500 font-bold">Peer Verification:</span>
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-ok/10 text-ok border border-ok/20">
                                ${yesVotes} Agreed
                            </span>
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                ${noVotes} Disagreed
                            </span>
                            <span class="text-[11px] text-slate-400">(${totalVotes} peer ${totalVotes === 1 ? 'vote' : 'votes'})</span>
                        </div>
                        <div class="flex items-center gap-2">
                            ${isSuperAdmin() ? `
                                <button type="button" onclick="window.KambusAdmin.openComplaintDetailModal(${c.complaint_id})" class="px-2.5 py-1 bg-brand/10 hover:bg-brand/10 border border-purple-200 text-brand font-bold text-[11px] rounded-lg transition flex items-center gap-1.5 shadow-2xs">
                                    <svg class="w-3.5 h-3.5 shrink-0 inline mr-1" aria-hidden="true"><use href="icons.svg#icon-user-shield"/></svg> <span>Super-Admin Detail</span>
                                </button>
                            ` : ''}
                            <span class="text-[11px] text-slate-400">
                                #${c.complaint_id}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    }

    async function openComplaintDetailModal(complaintId) {
        const modal = document.getElementById("complaintDetailModal");
        if (!modal) return;
        modal.classList.remove("hidden");

        const nameEl = document.getElementById("complaintDetailComplainantName");
        const metaEl = document.getElementById("complaintDetailComplainantMeta");
        const badgeEl = document.getElementById("complaintDetailReasonBadge");
        const descEl = document.getElementById("complaintDetailDescriptionBox");
        const yesEl = document.getElementById("complaintDetailYesCount");
        const noEl = document.getElementById("complaintDetailNoCount");
        const totalEl = document.getElementById("complaintDetailTotalCount");
        const votersListEl = document.getElementById("complaintDetailVotersList");

        if (nameEl) nameEl.textContent = "Loading...";
        if (votersListEl) votersListEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">Loading voter records...</div>`;

        try {
            const data = await apiRequest(`/admin/complaints/${complaintId}/detail`);
            if (nameEl) nameEl.textContent = `${data.complainant?.student_name || data.complainant?.name || "Student"} (${data.complainant?.roll_number || "—"})`;
            if (metaEl) metaEl.textContent = `Dept: ${data.complainant?.department || "—"} • Email: ${data.complainant?.email || "—"} • Phone: ${data.complainant?.phone || "—"}`;
            if (badgeEl) badgeEl.textContent = formatComplaintReason(data.reason);
            if (descEl) descEl.textContent = data.description ? `Student Comment: "${data.description}"` : "No description provided.";

            if (yesEl) yesEl.textContent = data.corroboration?.yes_count || 0;
            if (noEl) noEl.textContent = data.corroboration?.no_count || 0;
            if (totalEl) totalEl.textContent = data.corroboration?.total_votes || 0;

            const voters = data.voters || [];
            if (voters.length === 0) {
                if (votersListEl) votersListEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded border border-slate-100">No students have voted on this complaint yet.</div>`;
            } else {
                if (votersListEl) {
                    votersListEl.innerHTML = voters.map(v => `
                        <div class="p-2.5 rounded-xl border ${v.vote === 'yes' ? 'border-ok/30 bg-ok/10' : 'border-slate-200 bg-slate-50'} flex items-center justify-between text-xs">
                            <div>
                                <p class="font-bold text-slate-900">${escapeHtml(v.student_name)} <span class="text-slate-500 font-normal">(${escapeHtml(v.roll_number || '—')})</span></p>
                                <p class="text-[10px] text-slate-400">Dept: ${escapeHtml(v.department || '—')} • Voted ${formatDateTime(v.created_at)}</p>
                            </div>
                            <span class="px-2.5 py-1 rounded-lg font-black text-xs ${v.vote === 'yes' ? 'bg-ok/10 text-ok' : 'bg-slate-200 text-slate-700'}">
                                ${v.vote === 'yes' ? 'Agreed (Yes)' : 'Disagreed (No)'}
                            </span>
                        </div>
                    `).join("");
                }
            }
        } catch (e) {
            if (votersListEl) votersListEl.innerHTML = `<div class="p-4 text-center text-xs text-danger">Failed to load details: ${escapeHtml(e.message)}</div>`;
        }
    }

    // =========================================================================
    // 6d. TEMPORARY STOP AUDIT LOGS
    // =========================================================================

    let cachedTempStopLogs = [];

    async function loadTemporaryStopLogs() {
        const container = document.getElementById("tempStopLogsList");
        if (!container) return;

        container.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-xs text-slate-400">Loading temporary stop logs...</td></tr>`;

        try {
            const data = await apiRequest("/admin/temporary-stop-requests");
            cachedTempStopLogs = Array.isArray(data) ? data : [];
            filterTempStopLogs();
        } catch (e) {
            container.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-xs text-danger">Failed to load temporary stop logs: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    function filterTempStopLogs() {
        const container = document.getElementById("tempStopLogsList");
        if (!container) return;

        const filterStatus = document.getElementById("tempStopFilterStatus")?.value || "all";
        let logs = [...cachedTempStopLogs];

        if (filterStatus !== "all") {
            logs = logs.filter(l => l.status === filterStatus);
        }

        if (logs.length === 0) {
            container.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-xs text-slate-400">No temporary stop change logs found.</td></tr>`;
            return;
        }

        container.innerHTML = logs.map(l => {
            const isPerm = l.request_type === "permanent";
            const typeBadge = isPerm
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700">PERMANENT</span>'
                : '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-100 text-sky-700">TEMPORARY</span>';

            const statusBadge = l.status === "active"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-ok/10 text-ok">ACTIVE</span>'
                : l.status === "scheduled"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-brand/10 text-brand">SCHEDULED</span>'
                : l.status === "approved"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-ok/10 text-ok">APPROVED</span>'
                : l.status === "pending_admin_approval"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700">PENDING APPROVAL</span>'
                : l.status === "rejected"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-danger/10 text-danger">REJECTED</span>'
                : l.status === "cancelled"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">CANCELLED</span>'
                : `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">${escapeHtml(l.status.toUpperCase())}</span>`;

            const matchDetail = l.is_approximate_match
                ? `<span class="text-brand font-semibold text-[11px]">~${l.match_distance_m != null ? Math.round(l.match_distance_m) + 'm off route' : 'Approximate'}</span>`
                : '<span class="text-ok font-semibold text-[11px]">Exact Stop Match</span>';

            const approvalActions = l.status === "pending_admin_approval"
                ? `
                    <button type="button" onclick="window.KambusAdmin.approveTemporaryStopRequest(${Number(l.request_id)})" class="px-2 py-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-600 hover:text-white rounded text-[11px] font-bold mr-1 transition" title="Approve">Approve</button>
                    <button type="button" onclick="window.KambusAdmin.rejectTemporaryStopRequest(${Number(l.request_id)})" class="px-2 py-1 bg-rose-100 text-rose-800 hover:bg-rose-600 hover:text-white rounded text-[11px] font-bold mr-1 transition" title="Reject">Reject</button>
                  `
                : '';

            return `
                <tr class="border-b border-slate-100 hover:bg-slate-50/50">
                    <td class="px-4 py-3 font-bold text-slate-900">${escapeHtml(l.student_name)} <span class="text-slate-400 font-normal">(${escapeHtml(l.student_roll_number || '—')})</span></td>
                    <td class="px-4 py-3">${typeBadge}</td>
                    <td class="px-4 py-3 text-slate-600">${escapeHtml(l.original_stop_name || '—')}</td>
                    <td class="px-4 py-3 font-bold text-navy">${escapeHtml(l.temporary_stop_name || '—')}</td>
                    <td class="px-4 py-3 font-bold text-slate-800">${escapeHtml(l.target_bus_number || 'Bus ' + (l.target_bus_id || '—'))}</td>
                    <td class="px-4 py-3 font-mono text-[11px] text-slate-500">${escapeHtml(l.start_date)} &rarr; ${escapeHtml(l.end_date)}</td>
                    <td class="px-4 py-3">${matchDetail}</td>
                    <td class="px-4 py-3">${statusBadge}</td>
                    <td class="px-4 py-3 text-right">
                        ${approvalActions}
                        <button type="button" onclick="window.KambusAdmin.deleteTemporaryStopChange(${Number(l.request_id)})" class="p-1 text-slate-300 hover:text-danger transition" title="Delete this stop change">
                            <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-trash"/></svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function approveTemporaryStopRequest(requestId) {
        try {
            await apiRequest(`/admin/temporary-stop-requests/${requestId}/approve`, { method: "POST" });
            showToast("success", "Approved", "Stop change request approved.");
            loadTemporaryStopLogs();
        } catch (e) {
            showToast("error", "Approval Failed", e.message);
        }
    }

    async function rejectTemporaryStopRequest(requestId) {
        try {
            await apiRequest(`/admin/temporary-stop-requests/${requestId}/reject`, { method: "POST" });
            showToast("info", "Rejected", "Stop change request rejected.");
            loadTemporaryStopLogs();
        } catch (e) {
            showToast("error", "Rejection Failed", e.message);
        }
    }

    async function deleteTemporaryStopChange(requestId) {
        const change = cachedTempStopLogs.find(l => l.request_id === requestId);
        const who = change
            ? `${change.student_name} (${change.student_roll_number || "no roll number"})`
            : `request #${requestId}`;
        const isLive = change && ["active", "scheduled", "pending_admin_approval"].includes(change.status);
        const question = isLive
            ? `Delete the temporary stop change for ${who}?\n\nIt stops applying now and the student is told they are back on their regular stop and bus. This cannot be undone.`
            : `Delete this temporary stop change for ${who}? This cannot be undone.`;
        const confirmed = await confirm(question);
        if (!confirmed) return;

        try {
            await apiRequest(`/admin/temporary-stop-requests/${requestId}`, { method: "DELETE" });
            showToast("success", "Deleted", "Temporary stop change deleted.");
            loadTemporaryStopLogs();
            if (typeof loadPermanentStopRequests === "function") loadPermanentStopRequests();
        } catch (e) {
            showToast("error", "Delete Failed", e.message);
        }
    }

    // =========================================================================
    // 6e. PERMANENT STOP CHANGE REQUESTS
    // =========================================================================

    let cachedPermanentStopRequests = [];

    async function loadPermanentStopRequests() {
        const container = document.getElementById("permStopRequestsList");
        const badge = document.getElementById("permStopNavBadge");
        if (container) {
            container.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-xs text-slate-400">Loading permanent stop change requests...</td></tr>`;
        }

        try {
            const data = await apiRequest("/admin/permanent-stop-requests");
            cachedPermanentStopRequests = Array.isArray(data) ? data : [];
            const pendingCount = cachedPermanentStopRequests.filter(r => r.status === "pending_admin_approval").length;
            if (badge) {
                if (pendingCount > 0) {
                    badge.textContent = String(pendingCount);
                    badge.classList.remove("hidden");
                } else {
                    badge.classList.add("hidden");
                }
            }
            filterPermanentStopRequests();
        } catch (e) {
            if (container) {
                container.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-xs text-danger">Failed to load permanent stop change requests: ${escapeHtml(e.message)}</td></tr>`;
            }
        }
    }

    function filterPermanentStopRequests() {
        const container = document.getElementById("permStopRequestsList");
        if (!container) return;

        const filterStatus = document.getElementById("permStopFilterStatus")?.value || "all";
        let requests = [...cachedPermanentStopRequests];

        if (filterStatus !== "all") {
            requests = requests.filter(r => r.status === filterStatus);
        }

        if (requests.length === 0) {
            container.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-xs text-slate-400">No permanent stop change requests found.</td></tr>`;
            return;
        }

        container.innerHTML = requests.map(r => {
            const statusBadge = r.status === "approved"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">APPROVED</span>'
                : r.status === "pending_admin_approval"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">PENDING APPROVAL</span>'
                : r.status === "rejected"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">REJECTED</span>'
                : `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">${escapeHtml(r.status.toUpperCase())}</span>`;

            const reasonDisplay = r.admin_notes
                ? `<span class="text-slate-700 font-medium">${escapeHtml(r.reason || '—')}</span><div class="text-[10px] text-rose-600 mt-0.5 font-semibold">Note: ${escapeHtml(r.admin_notes)}</div>`
                : `<span class="text-slate-600">${escapeHtml(r.reason || '—')}</span>`;

            const isPending = r.status === "pending_admin_approval" || r.status === "pending";
            const reqId = Number(r.request_id || r.id);
            const actions = isPending
                ? `
                    <button type="button" onclick="window.KambusAdmin.approvePermanentStopRequest(${reqId})" style="display:inline-flex;align-items:center;justify-content:center;background:#059669;color:#ffffff;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:none;margin-right:6px;box-shadow:0 1px 2px rgba(0,0,0,0.05);" title="Approve Request">Approve</button>
                    <button type="button" onclick="window.KambusAdmin.rejectPermanentStopRequest(${reqId})" style="display:inline-flex;align-items:center;justify-content:center;background:#dc2626;color:#ffffff;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:none;box-shadow:0 1px 2px rgba(0,0,0,0.05);" title="Reject Request">Reject</button>
                  `
                : `
                    <span class="text-[11px] text-slate-400 font-semibold">—</span>
                  `;

            let desiredDisplay = `<span class="font-bold text-navy">${escapeHtml(r.desired_stop_name || '—')}</span>`;
            if (r.morning_stop_name || r.evening_stop_name) {
                const parts = [];
                if (r.morning_stop_name) {
                    parts.push(`<div class="text-[11px]"><span class="text-emerald-700 font-bold uppercase text-[10px]">Morning:</span> <span class="font-bold text-slate-800">${escapeHtml(r.morning_stop_name)}</span></div>`);
                }
                if (r.evening_stop_name) {
                    parts.push(`<div class="text-[11px]"><span class="text-rose-700 font-bold uppercase text-[10px]">Evening:</span> <span class="font-bold text-slate-800">${escapeHtml(r.evening_stop_name)}</span></div>`);
                }
                desiredDisplay = parts.join("");
            }
            if (r.selected_latitude && r.selected_longitude) {
                desiredDisplay += `<div class="text-[10px] text-slate-400 font-mono mt-0.5">📍 ${Number(r.selected_latitude).toFixed(5)}, ${Number(r.selected_longitude).toFixed(5)}</div>`;
            }

            return `
                <tr class="border-b border-slate-100 hover:bg-slate-50/50">
                    <td class="px-4 py-3 font-bold text-slate-900">
                        ${escapeHtml(r.student_name)}
                        <span class="text-slate-400 font-normal">(${escapeHtml(r.student_roll_number || '—')})</span>
                    </td>
                    <td class="px-4 py-3 text-slate-600">${escapeHtml(r.original_stop_name || '—')}</td>
                    <td class="px-4 py-3">${desiredDisplay}</td>
                    <td class="px-4 py-3 font-bold text-slate-800">${escapeHtml(r.target_bus_number ? 'Bus ' + r.target_bus_number : '—')}</td>
                    <td class="px-4 py-3 font-mono text-[11px] text-slate-500">${escapeHtml(r.effective_date || '—')}</td>
                    <td class="px-4 py-3 text-xs max-w-xs">${reasonDisplay}</td>
                    <td class="px-4 py-3">${statusBadge}</td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">${actions}</td>
                </tr>
            `;
        }).join("");
    }

    async function approvePermanentStopRequest(requestId) {
        try {
            await apiRequest(`/admin/permanent-stop-requests/${requestId}/approve`, { method: "POST" });
            showToast("success", "Approved", "Permanent stop change approved. Student regular stop updated.");
            loadPermanentStopRequests();
            if (typeof loadTemporaryStopLogs === "function") loadTemporaryStopLogs();
        } catch (e) {
            showToast("error", "Approval Failed", e.message);
        }
    }

    async function rejectPermanentStopRequest(requestId) {
        try {
            const reason = prompt("Enter reason for rejection (optional):");
            if (reason === null) return;
            await apiRequest(`/admin/permanent-stop-requests/${requestId}/reject`, {
                method: "POST",
                body: JSON.stringify({ reason: reason.trim() || undefined })
            });
            showToast("info", "Rejected", "Permanent stop change request rejected.");
            loadPermanentStopRequests();
            if (typeof loadTemporaryStopLogs === "function") loadTemporaryStopLogs();
        } catch (e) {
            showToast("error", "Rejection Failed", e.message);
        }
    }

    // =========================================================================
    // 6c. GEOFENCE ENTRY LOG
    // =========================================================================

    async function loadGeofenceLogs() {
        const container = document.getElementById("geofenceLogsList");
        if (!container) return;

        container.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-xs text-slate-400">Loading geofence entry logs...</td></tr>`;

        try {
            const data = await apiRequest("/admin/geofence-logs");
            const logs = data.logs || [];

            if (logs.length === 0) {
                container.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-xs text-slate-400">No geofence entry logs found.</td></tr>`;
                return;
            }

            container.innerHTML = logs.map(log => {
                const latitude = Number(log.latitude);
                const longitude = Number(log.longitude);
                const location = Number.isFinite(latitude) && Number.isFinite(longitude)
                    ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
                    : "Location unavailable";

                return `
                    <tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                        <td class="px-4 py-3 font-black text-slate-900">${escapeHtml(log.bus_number ? `Bus ${log.bus_number}` : `Bus #${log.bus_id}`)}</td>
                        <td class="px-4 py-3 text-slate-700 font-semibold">${escapeHtml(log.driver_name || "Unassigned")}</td>
                        <td class="px-4 py-3 text-slate-500">${formatDateTime(log.entry_time)}</td>
                        <td class="px-4 py-3 font-mono text-[11px] text-slate-500">${escapeHtml(location)}</td>
                    </tr>
                `;
            }).join("");
        } catch (e) {
            container.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-xs text-red-500">Failed to load geofence entry logs: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    // =========================================================================
    // 7. LIVE FLEET MONITORING MAP
    // =========================================================================

    function initLiveMap() {
        const container = document.getElementById("adminLiveMap");
        if (!container) return;

        if (!liveMap) {
            liveMap = L.map("adminLiveMap").setView(COLLEGE_COORDS, 13);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19
            }).addTo(liveMap);

            const collegeIcon = L.divIcon({
                className: "",
                html: `<div style="background:var(--navy);color:#fff;border-radius:4px;padding:4px 8px;font-size:11px;font-weight:700;border:1px solid var(--line);display:flex;align-items:center;gap:4px;"><svg style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;"><use href="icons.svg#icon-kambus"/></svg> KITSW College</div>`,
                iconSize: [110, 24]
            });
            L.marker(COLLEGE_COORDS, { icon: collegeIcon }).addTo(liveMap);
        } else {
            liveMap.invalidateSize();
        }

        if (!liveTrackingInterval) {
            loadLiveTracking();
            liveTrackingInterval = setInterval(loadLiveTracking, 6000);
        }
    }

    async function loadLiveTracking() {
        if (!liveMap) return;
        try {
            const data = await apiRequest("/admin/live-tracking");
            const buses = data.buses || [];

            // Track which bus IDs are still active this poll cycle
            const activeBusIds = new Set();

            buses.forEach(bus => {
                const isActive = bus.trip_status === "active" &&
                    bus.latest_location &&
                    bus.latest_location.latitude &&
                    bus.latest_location.longitude;

                if (isActive) {
                    activeBusIds.add(bus.bus_id);

                    const lat = bus.latest_location.latitude;
                    const lng = bus.latest_location.longitude;

                    const busIcon = L.divIcon({
                        className: "",
                        html: `
                            <div style="
                                background: #10B981;
                                color: #ffffff;
                                border-radius: 12px;
                                padding: 4px 8px;
                                font-size: 11px;
                                font-weight: 900;
                                border: 2px solid #ffffff;
                                display: flex; align-items: center; gap: 4px;
                                box-shadow: 0 3px 8px rgba(0,0,0,0.35);
                            ">
                                <span>Bus ${escapeHtml(bus.bus_number)}</span>
                            </div>
                        `,
                        iconSize: [90, 28]
                    });

                    if (liveBusMarkers[bus.bus_id]) {
                        liveBusMarkers[bus.bus_id].setLatLng([lat, lng]);
                        liveBusMarkers[bus.bus_id].setIcon(busIcon);
                    } else {
                        const marker = L.marker([lat, lng], { icon: busIcon }).addTo(liveMap);
                        marker.on("click", () => openBusModal(bus.bus_id));
                        liveBusMarkers[bus.bus_id] = marker;
                    }
                }
            });

            // Remove markers for buses that are no longer active
            Object.keys(liveBusMarkers).forEach(busId => {
                if (!activeBusIds.has(Number(busId)) && !activeBusIds.has(busId)) {
                    liveMap.removeLayer(liveBusMarkers[busId]);
                    delete liveBusMarkers[busId];
                }
            });
        } catch (error) {
            console.warn("Live tracking update failed:", error);
        }
    }

    // =========================================================================
    // 8. NOTIFICATION & ANNOUNCEMENT CENTER (BUG-001, BUG-002, BUG-003)
    // =========================================================================

    const ANNOUNCEMENT_TEMPLATES = {
        TEMPLATE_A: {
            title: "Bus Departure Schedule",
            template: "🚌 Bus {bus} is fueled up and rolling at {time} for {date_range}. Don't make it wait!"
        },
        TEMPLATE_B: {
            title: "Student Bus Change",
            template: "🔄 Plot twist, Bus {target} fam — you're riding Bus {replacement_bus} today. Same squad, new chariot."
        },
        TEMPLATE_C: {
            title: "Bus Service Unavailable",
            template: "😴 Bus {bus} is calling in sick on {date}. Sort your ride, legend."
        },
        TEMPLATE_D: {
            title: "Bus Replacement Notice",
            template: "🔁 Bus {bus} tagged out, Bus {replacement_bus} tagged in — {date} only. Don't get on the wrong one!"
        },
        TEMPLATE_E: {
            title: "Schedule Timing Change",
            template: "⏰ Plans changed! Bus {bus} now rolls at {new_time} instead of {old_time}. Set that alarm, sleepyhead."
        },
        TEMPLATE_F: {
            title: "Route Modification Notice",
            template: "🛣️ Route {route} said \"new me\" — road conditions forced a reroute. Peep the updated path before you dash out!"
        },
        TEMPLATE_G: {
            title: "Stop Adjustment Notice",
            template: "📍 {old_stop} crew, plot twist — you're now boarding at {new_stop}. Update your GPS and your vibes."
        },
        TEMPLATE_H: {
            title: "College Holiday — No Bus Service",
            template: "🎉 No buses, no problem — campus rides are off on {date}. Sleep in, you earned it."
        }
    };

    async function initAnnouncementComposer() {
        await Promise.all([loadBusesDropdown(), loadRoutesDropdown()]);
        onAnnouncementTargetTypeChanged();
        updateAnnouncementTemplateFields();
        calculateAffectedStudents();
    }

    async function loadAnnouncementStudentsDropdown() {
        const studentSelect = document.getElementById("announcementTargetStudent");
        if (!studentSelect || studentSelect.options.length > 1) return;
        try {
            const data = await apiRequest("/admin/students");
            const students = data.students || [];
            studentSelect.innerHTML = '<option value="">-- Select Student --</option>' +
                students.map(s => `<option value="${s.id || s.student_id}">${escapeHtml(s.name || s.student_name)} (${escapeHtml(s.roll_number)})</option>`).join("");
        } catch (e) {
            console.warn("Failed to load students for announcement target:", e);
        }
    }

    function onAnnouncementTargetTypeChanged() {
        const targetType = document.getElementById("announcementTargetType")?.value || "all";
        const busCol = document.getElementById("targetBusCol");
        const routeCol = document.getElementById("targetRouteCol");
        const studentCol = document.getElementById("targetStudentCol");

        if (busCol) busCol.classList.toggle("hidden", targetType !== "bus");
        if (routeCol) routeCol.classList.toggle("hidden", targetType !== "route");
        if (studentCol) {
            studentCol.classList.toggle("hidden", targetType !== "student");
            if (targetType === "student") {
                loadAnnouncementStudentsDropdown();
            }
        }
        calculateAffectedStudents();
        previewAnnouncementText();
    }

    function updateAnnouncementTemplateFields() {
        const select = document.getElementById("announcementTemplateSelect");
        const templateKey = select?.value || "CUSTOM";
        const container = document.getElementById("templateFieldsContainer");
        if (!container) return;

        let fieldsHtml = "";

        switch (templateKey) {
            case "CUSTOM":
                fieldsHtml = `<p class="text-xs text-ink-muted">Compose your custom announcement headline and message below.</p>`;
                break;
            case "TEMPLATE_A":
                fieldsHtml = `
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Start Time</label>
                            <input type="time" id="annFieldTime" value="08:00" class="w-full p-2.5 border border-slate-300 rounded text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Duration / Date Range</label>
                            <input type="text" id="annFieldDuration" placeholder="e.g. Morning Shift" value="Morning Trip" class="w-full p-2.5 border border-slate-300 rounded text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                    </div>
                `;
                break;
            case "TEMPLATE_B":
            case "TEMPLATE_D":
                fieldsHtml = `
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Source Bus</label>
                            <select id="annFieldSourceBus" class="bus-select-dropdown w-full p-2.5 border border-slate-300 rounded text-xs" onchange="window.KambusAdmin.previewAnnouncementText(); window.KambusAdmin.calculateAffectedStudents()">
                                <option value="">-- Select Source Bus --</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Replacement Bus</label>
                            <select id="annFieldReplacementBusSelect" class="bus-select-dropdown w-full p-2.5 border border-slate-300 rounded text-xs" onchange="window.KambusAdmin.previewAnnouncementText()">
                                <option value="">-- Select Replacement Bus --</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Start Date</label>
                            <input type="date" id="annFieldStartDate" value="${new Date().toISOString().split('T')[0]}" class="w-full p-2.5 border border-slate-300 rounded text-xs" onchange="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">End Date</label>
                            <input type="date" id="annFieldEndDate" value="${new Date().toISOString().split('T')[0]}" class="w-full p-2.5 border border-slate-300 rounded text-xs" onchange="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                    </div>
                    <div class="mt-2.5">
                        <label class="flex items-center gap-2 text-xs text-navy font-semibold cursor-pointer">
                            <input type="checkbox" id="annFieldMarkUnderRepair" class="rounded border-slate-300">
                            <span>Mark source bus as under repair / inactive</span>
                        </label>
                    </div>
                `;
                break;
            case "TEMPLATE_C":
            case "TEMPLATE_H":
                fieldsHtml = `
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Effective Date</label>
                        <input type="date" id="annFieldDate" value="${new Date().toISOString().split('T')[0]}" class="w-full p-2.5 border border-slate-300 rounded text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                    </div>
                `;
                break;
            case "TEMPLATE_E":
                fieldsHtml = `
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">New Time</label>
                            <input type="time" id="annFieldNewTime" value="08:30" class="w-full p-2.5 border border-slate-300 rounded text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Old Time</label>
                            <input type="time" id="annFieldOldTime" value="08:00" class="w-full p-2.5 border border-slate-300 rounded text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                    </div>
                `;
                break;
            default:
                fieldsHtml = ``;
                break;
        }

        container.innerHTML = fieldsHtml;
        if (templateKey === "TEMPLATE_B" || templateKey === "TEMPLATE_D") {
            loadBusesDropdown().then(previewAnnouncementText);
        }
        previewAnnouncementText();
    }

    function previewAnnouncementText() {
        const select = document.getElementById("announcementTemplateSelect");
        const templateKey = select?.value || "CUSTOM";
        if (templateKey === "CUSTOM") {
            return;
        }
        const config = ANNOUNCEMENT_TEMPLATES[templateKey] || ANNOUNCEMENT_TEMPLATES.TEMPLATE_A;

        let msg = config.template;

        const targetSelect = document.getElementById("announcementTargetType");
        const targetType = targetSelect?.value || "all";

        const busSelect = document.getElementById("announcementTargetBus");
        const busNum = busSelect?.options[busSelect.selectedIndex]?.text.split(" ")[1] || "4";

        const routeSelect = document.getElementById("announcementTargetRoute");
        const routeName = routeSelect?.options[routeSelect.selectedIndex]?.text || "Assigned Route";

        msg = msg.replace("{bus}", busNum);
        msg = msg.replace("{target}", targetType === "all" ? "All Routes" : (targetType === "route" ? routeName : `Bus ${busNum}`));
        msg = msg.replace("{time}", document.getElementById("annFieldTime")?.value || "08:00 AM");
        msg = msg.replace("{date_range}", document.getElementById("annFieldDuration")?.value || "Today");
        const sourceBusSelect = document.getElementById("annFieldSourceBus");
        const replacementBusSelect = document.getElementById("annFieldReplacementBusSelect");
        const replacementBusInput = document.getElementById("annFieldReplacementBus");
        const sourceBusNumber = sourceBusSelect?.options[sourceBusSelect.selectedIndex]?.text.match(/Bus\s+([^\s(]+)/)?.[1] || "Source Bus";
        const replacementBusNumber = replacementBusSelect?.options[replacementBusSelect.selectedIndex]?.text.match(/Bus\s+([^\s(]+)/)?.[1] || replacementBusInput?.value || "Replacement Bus";
        const startDate = document.getElementById("annFieldStartDate")?.value || document.getElementById("annFieldDate")?.value || "today";
        const endDate = document.getElementById("annFieldEndDate")?.value || startDate;

        if (templateKey === "TEMPLATE_B") {
            msg = `🔄 Plot twist, Bus ${sourceBusNumber} fam — you're riding Bus ${replacementBusNumber} from ${startDate} to ${endDate}. Same squad, new chariot.`;
        } else if (templateKey === "TEMPLATE_D") {
            msg = `🔁 Bus ${sourceBusNumber} tagged out, Bus ${replacementBusNumber} tagged in — ${startDate} to ${endDate}. Don't get on the wrong one!`;
        }

        msg = msg.replace("{replacement_bus}", replacementBusNumber);
        msg = msg.replace("{date}", document.getElementById("annFieldDate")?.value || "today");
        msg = msg.replace("{new_time}", document.getElementById("annFieldNewTime")?.value || "08:30 AM");
        msg = msg.replace("{old_time}", document.getElementById("annFieldOldTime")?.value || "08:00 AM");
        msg = msg.replace("{route}", routeName);
        msg = msg.replace("{old_stop}", "Hanamkonda");
        msg = msg.replace("{new_stop}", "Subedari");

        const previewTitle = document.getElementById("announcementTitle");
        const previewMsg = document.getElementById("announcementMessage");

        if (previewTitle) previewTitle.value = config.title;
        if (previewMsg) previewMsg.value = msg;
    }

    async function calculateAffectedStudents() {
        const templateKey = document.getElementById("announcementTemplateSelect")?.value || "CUSTOM";
        let targetType = document.getElementById("announcementTargetType")?.value || "all";
        let targetId = null;

        if (templateKey === "TEMPLATE_B") {
            targetType = "bus";
            targetId = parseInt(document.getElementById("annFieldSourceBus")?.value) || null;
        } else if (targetType === "bus") {
            targetId = document.getElementById("announcementTargetBus")?.value || null;
            if (targetId) targetId = parseInt(targetId);
        } else if (targetType === "route") {
            targetId = document.getElementById("announcementTargetRoute")?.value || null;
            if (targetId) targetId = parseInt(targetId);
        } else if (targetType === "student") {
            targetId = document.getElementById("announcementTargetStudent")?.value || null;
            if (targetId) targetId = parseInt(targetId);
        }

        try {
            const data = await apiRequest("/admin/notifications/calculate-recipients", {
                method: "POST",
                body: { target_type: targetType, target_id: targetId }
            });

            const count = data.recipient_count || 0;
            const countDisplay = document.getElementById("announcementRecipientCount");
            const btn = document.getElementById("btnBroadcastAnnouncement");

            const label = targetType.includes("parent") ? "parent" : "student";
            if (countDisplay) {
                countDisplay.textContent = `Reach: ${count} ${label}${count === 1 ? "" : "s"}`;
            }
            if (btn) {
                btn.innerHTML = `<svg class="w-4 h-4 shrink-0 inline mr-1.5" aria-hidden="true"><use href="icons.svg#icon-paper-plane"/></svg> Send update to ${count}`;
                btn.disabled = count === 0;
            }
        } catch (error) {
            console.warn("Recipient count calculation failed:", error);
        }
    }

    async function submitBroadcastAnnouncement(event) {
        event.preventDefault();
        const templateKey = document.getElementById("announcementTemplateSelect")?.value || "CUSTOM";
        const title = document.getElementById("announcementTitle")?.value.trim();
        const message = document.getElementById("announcementMessage")?.value.trim();
        const targetType = document.getElementById("announcementTargetType")?.value || "all";
        let targetId = null;

        if (targetType === "bus") targetId = parseInt(document.getElementById("announcementTargetBus")?.value) || null;
        if (targetType === "route") targetId = parseInt(document.getElementById("announcementTargetRoute")?.value) || null;
        if (targetType === "student") targetId = parseInt(document.getElementById("announcementTargetStudent")?.value) || null;

        if (!title || !message) {
            showToast("error", "Validation", "Title and message are required.");
            return;
        }

        try {
            let res;
            if (templateKey === "TEMPLATE_B" || templateKey === "TEMPLATE_D") {
                const sourceBusId = parseInt(document.getElementById("annFieldSourceBus")?.value) || null;
                const targetBusId = parseInt(document.getElementById("annFieldReplacementBusSelect")?.value) || null;
                const startDate = document.getElementById("annFieldStartDate")?.value;
                const endDate = document.getElementById("annFieldEndDate")?.value;
                const markUnderRepair = Boolean(document.getElementById("annFieldMarkUnderRepair")?.checked);

                if (!sourceBusId || !targetBusId || !startDate || !endDate) {
                    showToast("error", "Validation", "Source bus, replacement bus, start date, and end date are required.");
                    return;
                }

                res = await apiRequest("/admin/bus-changes", {
                    method: "POST",
                    body: {
                        source_bus_id: sourceBusId,
                        target_bus_id: targetBusId,
                        start_date: startDate,
                        end_date: endDate,
                        title,
                        message,
                        template_type: templateKey,
                        mark_source_under_repair: markUnderRepair
                    }
                });
            } else if (templateKey === "CUSTOM") {
                res = await apiRequest("/admin/notifications/custom", {
                    method: "POST",
                    body: {
                        title: title,
                        body: message,
                        message: message,
                        target_type: targetType,
                        target_id: targetId
                    }
                });
            } else {
                res = await apiRequest("/admin/notifications/broadcast", {
                    method: "POST",
                    body: {
                        template_type: templateKey,
                        title: title,
                        message: message,
                        target_type: targetType,
                        target_id: targetId
                    }
                });
            }

            if (res.failure_count && res.failure_count > 0) {
                showToast("warning", "Partial Reassignment", res.message);
            } else if (res.delivered === false) {
                showToast("warning", "Saved, but not delivered", res.warning || res.message);
            } else {
                showToast("success", "Sent! 🎉", res.message);
            }
            loadAnnouncementHistory();
            if (templateKey === "TEMPLATE_B" || templateKey === "TEMPLATE_D") loadAdminBusChanges();
        } catch (error) {
            showToast("error", "Couldn’t send", error.message);
        }
    }

    async function loadAnnouncementHistory() {
        const container = document.getElementById("announcementHistoryList");
        if (!container) return;

        try {
            const data = await apiRequest("/admin/notifications/history");
            const list = data.announcements || [];

            if (list.length === 0) {
                container.innerHTML = `
                    <div class="announcement-empty">
                        <svg class="w-8 h-8 mx-auto text-ink-muted/50 mb-2" aria-hidden="true"><use href="icons.svg#icon-bullhorn"/></svg>
                        <p class="text-xs font-semibold text-navy">Nothing sent yet</p>
                        <p class="text-[11px] mt-1">Your next update will show up here.</p>
                    </div>`;
                return;
            }

            container.innerHTML = list.map(a => {
                const style = getAnnouncementStyle(a.template_type);
                return `
                <article class="announcement-card ${style.className}">
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2 min-w-0">
                            <span aria-hidden="true">${style.icon}</span>
                            <span class="text-xs font-black text-navy truncate">${escapeHtml(a.title)}</span>
                        </div>
                        <span class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/75 text-brand border border-brand/10">${a.recipient_count} reached</span>
                    </div>
                    <p class="text-xs text-ink-muted mt-2 leading-relaxed">${escapeHtml(a.message)}</p>
                    <div class="flex items-center justify-between text-[10px] text-ink-muted mt-3">
                        <span>${style.label} · ${escapeHtml(a.sender_name)}</span>
                        <span>${formatAnnouncementTime(a.created_at)}</span>
                    </div>
                </article>`;
            }).join("");
        } catch (e) {
            console.warn("History load failed:", e);
        }
    }

    async function loadAdminBusChanges() {
        const container = document.getElementById("adminBusChangesList");
        if (!container) return;

        try {
            const data = await apiRequest("/admin/bus-changes");
            const changes = data.bus_changes || [];

            if (changes.length === 0) {
                container.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">No bus changes logged.</div>`;
                return;
            }

            container.innerHTML = changes.map(change => `
                <div class="p-3.5 kx-card-sub">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-black text-slate-900">Bus ${escapeHtml(change.source_bus_number || "-")} → Bus ${escapeHtml(change.target_bus_number || "-")}</span>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${change.status === "active" ? "bg-ok/10 text-ok" : "bg-slate-200 text-slate-600"}">${escapeHtml(change.status)}</span>
                    </div>
                    <p class="text-xs text-slate-600 mt-1">${escapeHtml(change.start_date)} to ${escapeHtml(change.end_date)}</p>
                    <div class="flex items-center justify-between text-[10px] text-slate-400 mt-2">
                        <span>${formatDateTime(change.created_at)}</span>
                        ${change.status === "active" ? `<button type="button" onclick="window.KambusAdmin.cancelAdminBusChange(${Number(change.id)})" class="px-2.5 py-1 bg-white text-danger border border-danger/20 hover:bg-danger/10 rounded text-[10px] font-bold">Cancel</button>` : ""}
                    </div>
                </div>
            `).join("");
        } catch (error) {
            container.innerHTML = `<div class="p-4 text-xs text-red-500">Failed to load bus changes: ${escapeHtml(error.message)}</div>`;
        }
    }

    async function cancelAdminBusChange(changeId) {
        const confirmed = await confirm("Cancel this bus change and revert it immediately?");
        if (!confirmed) return;

        try {
            const res = await apiRequest(`/admin/bus-changes/${changeId}/cancel`, { method: "POST" });
            showToast("success", "Bus Change Cancelled", res.message);
            loadAdminBusChanges();
        } catch (error) {
            showToast("error", "Cancellation Failed", error.message);
        }
    }

    // =========================================================================
    // 9. ALERT CENTER
    // =========================================================================

    async function loadAlerts() {
        const container = document.getElementById("alertsList");
        if (!container) return;
        container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Loading alerts...</div>`;

        try {
            const data = await apiRequest("/admin/alerts");
            const alerts = data.alerts || [];

            if (alerts.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">No operational alerts logged.</div>`;
                return;
            }

            container.innerHTML = alerts.map(a => `
                <div class="kx-card p-4 ${a.type === 'emergency_sos' ? 'bg-danger/10 border-danger/30' : (a.type === 'detour_alert' ? 'bg-warn/10 border-warn/30' : '')} shadow-xs flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="flex items-center justify-center w-5 h-5">${a.type === "emergency_sos" ? '<svg class="w-4 h-4 text-danger shrink-0" aria-hidden="true"><use href="icons.svg#icon-alert"/></svg>' : (a.type === "detour_alert" ? '<svg class="w-4 h-4 text-warn shrink-0" aria-hidden="true"><use href="icons.svg#icon-route"/></svg>' : '<svg class="w-4 h-4 text-navy shrink-0" aria-hidden="true"><use href="icons.svg#icon-bell"/></svg>')}</span>
                            <h4 class="text-xs font-black ${a.type === 'emergency_sos' ? 'text-danger' : 'text-slate-900'}">${escapeHtml(a.title)}</h4>
                        </div>
                        <p class="text-xs text-slate-700 mt-1">${escapeHtml(a.message)}</p>
                        <div class="flex items-center gap-3 text-[11px] text-slate-500 mt-2">
                            ${a.bus_number ? `<span>Bus: <strong>${escapeHtml(a.bus_number)}</strong></span>` : ''}
                            ${a.driver_name ? `<span>Driver: <strong>${escapeHtml(a.driver_name)}</strong></span>` : ''}
                            <span>Time: ${formatDateTime(a.created_at)}</span>
                        </div>
                    </div>
                    ${!a.is_read ? `
                        <button onclick="window.KambusAdmin.acknowledgeAlert(${a.id})" class="px-3 py-1.5 bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 rounded text-xs font-bold shadow-2xs shrink-0">
                            Acknowledge
                        </button>
                    ` : '<span class="text-[11px] font-bold text-slate-400 shrink-0">Acknowledged</span>'}
                </div>
            `).join("");
        } catch (error) {
            container.innerHTML = `<div class="p-4 text-xs text-red-500">Failed to load alerts: ${escapeHtml(error.message)}</div>`;
        }
    }

    async function acknowledgeAlert(alertId) {
        try {
            await apiRequest(`/admin/alerts/${alertId}/acknowledge`, { method: "POST" });
            showToast("info", "Alert Acknowledged", "Marked as resolved.");
            loadAlerts();
            loadDashboard();
        } catch (error) {
            showToast("error", "Failed", error.message);
        }
    }

    // =========================================================================
    // 10. TODAY'S OPERATIONS
    // =========================================================================

    async function loadTodayOperations() {
        const container = document.getElementById("todayOpsContainer");
        if (!container) return;

        try {
            const data = await apiRequest("/admin/today-operations");

            document.getElementById("opsBusesActive").textContent = data.buses_summary.active_now || 0;
            document.getElementById("opsBusesNotStarted").textContent = data.buses_summary.not_started || 0;
            document.getElementById("opsBusesOffline").textContent = data.buses_summary.offline || 0;

            document.getElementById("opsStudentsExpected").textContent = data.students_summary.total_registered || 0;
            document.getElementById("opsStudentsTravelling").textContent = data.students_summary.travelling_today || 0;
            document.getElementById("opsStudentsNotTravelling").textContent = data.students_summary.not_travelling_today || 0;

            document.getElementById("opsTripsActive").textContent = data.trips_summary.active_now || 0;
            document.getElementById("opsTripsCompleted").textContent = data.trips_summary.completed_today || 0;
        } catch (error) {
            console.error("Failed to load today's operations:", error);
        }
    }

    // =========================================================================
    // 11. GLOBAL SEARCH (CLICKABLE RESULTS FIX BUG-007)
    // =========================================================================

    async function executeGlobalSearch() {
        const input = document.getElementById("globalSearchInput");
        const query = input?.value.trim();
        const resultsContainer = document.getElementById("globalSearchResults");
        if (!query || !resultsContainer) return;

        resultsContainer.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">Searching...</div>`;

        try {
            const data = await apiRequest(`/admin/search?q=${encodeURIComponent(query)}`);

            let html = "";

            if (data.buses && data.buses.length > 0) {
                html += `<div class="mb-3"><h5 class="text-[11px] font-black text-slate-400 uppercase">Buses</h5>` +
                    data.buses.map(b => `<div onclick="window.KambusAdmin.openBusModal(${b.bus_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900 flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-bus"/></svg><span>Bus ${escapeHtml(b.bus_number)} (${escapeHtml(b.driver_name || 'No driver')}) &rarr;</span></div>`).join("") + `</div>`;
            }

            if (data.drivers && data.drivers.length > 0) {
                html += `<div class="mb-3"><h5 class="text-[11px] font-black text-slate-400 uppercase">Drivers</h5>` +
                    data.drivers.map(d => `<div onclick="window.KambusAdmin.openDriverModal(${d.driver_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900 flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-user-tie"/></svg><span>${escapeHtml(d.name)} (${escapeHtml(d.driver_code)}) &rarr;</span></div>`).join("") + `</div>`;
            }

            if (data.students && data.students.length > 0) {
                html += `<div class="mb-3"><h5 class="text-[11px] font-black text-slate-400 uppercase">Students</h5>` +
                    data.students.map(s => `<div onclick="window.KambusAdmin.openAssignStudentModal(${s.student_id}, ${jsArg(s.name)}, ${s.bus_id || 'null'}, ${s.stop_id || 'null'})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900 flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-user-graduate"/></svg><span>${escapeHtml(s.name)} - ${escapeHtml(s.roll_number)} (${escapeHtml(s.bus_number ? 'Bus ' + s.bus_number : 'No bus')}) &rarr;</span></div>`).join("") + `</div>`;
            }

            if (data.routes && data.routes.length > 0) {
                html += `<div class="mb-3"><h5 class="text-[11px] font-black text-slate-400 uppercase">Routes</h5>` +
                    data.routes.map(r => `<div onclick="window.KambusAdmin.previewRouteRoadMap(${r.route_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900 flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-route"/></svg><span>${escapeHtml(r.name)} (${r.stops_count} stops) &rarr;</span></div>`).join("") + `</div>`;
            }

            if (data.stops && data.stops.length > 0) {
                html += `<div class="mb-3"><h5 class="text-[11px] font-black text-slate-400 uppercase">Stops</h5>` +
                    data.stops.map(st => `<div onclick="window.KambusAdmin.showSection('stops')" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900 flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-map-pin"/></svg><span>${escapeHtml(st.name)} (Route: ${escapeHtml(st.route_name || '-')}) &rarr;</span></div>`).join("") + `</div>`;
            }

            resultsContainer.innerHTML = html || `<div class="p-4 text-center text-xs text-slate-400">No records found matching "${escapeHtml(query)}"</div>`;
        } catch (e) {
            resultsContainer.innerHTML = `<div class="p-4 text-xs text-red-500">${escapeHtml(e.message)}</div>`;
        }
    }

    // =========================================================================
    // 12. ADMIN ACTIVITY LOGS
    // =========================================================================

    async function loadActivityLogs() {
        const container = document.getElementById("activityLogsList");
        if (!container) return;

        try {
            const data = await apiRequest("/admin/activity-logs");
            const logs = data.logs || [];

            if (logs.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">No activity logged.</div>`;
                return;
            }

            container.innerHTML = logs.map(l => `
                <div class="p-3.5 kx-card-sub flex items-center justify-between text-xs">
                    <div>
                        <span class="font-black text-slate-900">${escapeHtml(l.action)}</span>
                        <p class="text-slate-600 mt-0.5">${escapeHtml(l.details || "")}</p>
                    </div>
                    <div class="text-right text-[11px] text-slate-400 shrink-0">
                        <span>by ${escapeHtml(l.admin_name)}</span><br>
                        <span>${formatDateTime(l.created_at)}</span>
                    </div>
                </div>
            `).join("");
        } catch (e) {
            console.warn("Activity logs load failed:", e);
        }
    }

    // =========================================================================
    // WEBSOCKET REAL-TIME DISPATCH FOR ADMIN
    // =========================================================================

    function initAdminWebSocket() {
        const token = getToken();
        if (!token) return;

        if (adminSocket && (adminSocket.readyState === WebSocket.OPEN || adminSocket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        try {
            adminSocket = new WebSocket(`${WS_BASE}/ws/notifications?token=${encodeURIComponent(token)}`);

            adminSocket.onmessage = event => {
                try {
                    if (event.data === "pong") return;
                    const data = JSON.parse(event.data);

                    if (data.type === "entitlements_updated") {
                        loadAdminCampusEntitlements();
                        return;
                    }

                    if (data.type === "emergency_sos") {
                        showToast("error", data.title || "URGENT EMERGENCY SOS", data.message);
                        loadDashboard();
                        loadAlerts();
                    } else if (data.type === "detour_alert") {
                        showToast("warning", data.title || "Route Detour Reported", data.message);
                        loadDashboard();
                        loadAlerts();
                    } else if (data.title || data.message) {
                        showToast("info", data.title || "KAMBUS Update", data.message);
                        loadDashboard();
                    }
                } catch (e) {}
            };

            adminSocket.onclose = () => {
                adminSocket = null;
                if (!adminWsTimer) {
                    adminWsTimer = setTimeout(initAdminWebSocket, 4000);
                }
            };
        } catch (e) {}
    }

    // =========================================================================
    // 9. SUPER ADMIN & CAMPUS MANAGEMENT / ADMIN ACCOUNTS
    // =========================================================================

    function setupSuperAdminNav() {
        const navGroup = document.getElementById("superAdminNavGroup");
        if (isSuperAdmin()) {
            if (navGroup) navGroup.classList.remove("hidden");
        } else {
            if (navGroup) navGroup.classList.add("hidden");
        }
    }

    function updateCampusHeaderDisplay(campusId) {
        const badge = document.getElementById("superAdminActiveCampusBadge");
        const banner = document.getElementById("dashboardCampusContextBanner");

        if (!isPlatformSuperAdmin()) {
            if (badge) badge.classList.add("hidden");
            if (banner) banner.classList.add("hidden");
            return;
        }

        if (!campusId) {
            if (badge) {
                badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs";
                badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>No Campus Selected`;
                badge.classList.remove("hidden");
            }
            if (banner) {
                banner.className = "p-3 rounded-lg border border-amber-200 bg-amber-50/80 text-amber-900 text-xs flex items-center justify-between";
                banner.innerHTML = `<span><strong>Notice:</strong> No campus currently selected. Select a campus from the top navigation to view operational data.</span>`;
                banner.classList.remove("hidden");
            }
            return;
        }

        const campus = (cachedCampuses || []).find(c => c.id === campusId);
        const campusName = campus ? campus.name : `Campus ${campusId}`;
        const isSchool = campus ? (campus.campus_type === 'school' || campus.type === 'school') : false;
        const typeBadge = isSchool ? '🏫 School' : '🎓 College';

        if (badge) {
            badge.className = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${isSchool ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-blue-100 text-blue-900 border border-blue-300'} shadow-2xs`;
            badge.innerHTML = `<span class="w-2 h-2 rounded-full ${isSchool ? 'bg-amber-600' : 'bg-blue-600'}"></span>${escapeHtml(campusName)} &bull; ${typeBadge}`;
            badge.classList.remove("hidden");
        }
        if (banner) {
            banner.className = `p-3 rounded-lg border ${isSchool ? 'border-amber-200 bg-amber-50/70 text-amber-900' : 'border-blue-200 bg-blue-50/70 text-blue-900'} text-xs flex items-center justify-between`;
            banner.innerHTML = `<span>Active Context: <strong>${escapeHtml(campusName)} (ID: ${campusId})</strong> &bull; <span class="font-bold">${typeBadge}</span>. Showing scoped fleet, routes, and ${isSchool ? 'student & parent' : 'student'} data.</span>`;
            banner.classList.remove("hidden");
        }

        const navBtnParents = document.getElementById("navBtnParents");
        if (navBtnParents) {
            if (isSchool || !campusId) {
                navBtnParents.classList.remove("hidden");
            } else {
                navBtnParents.classList.add("hidden");
                if (activeSection === "parents") {
                    showSection("dashboard");
                }
            }
        }
    }

    async function initSuperAdminCampusSelector() {
        if (!isPlatformSuperAdmin()) return;

        const container = document.getElementById("superAdminCampusSelectorContainer");
        const mobileBar = document.getElementById("superAdminMobileCampusBar");
        if (container) {
            container.classList.remove("hidden");
            container.classList.add("lg:flex");
        }
        if (mobileBar) {
            mobileBar.classList.remove("hidden");
            mobileBar.classList.add("flex");
        }

        const savedCampusId = getSelectedCampusId();
        updateCampusHeaderDisplay(savedCampusId);

        try {
            if (!cachedCampuses || cachedCampuses.length === 0) {
                const data = await apiRequest("/super-admin/campuses");
                cachedCampuses = Array.isArray(data) ? data : [];
            }
            updateCampusDropdowns(cachedCampuses);
        } catch (e) {
            console.warn("Could not load campuses for context switcher:", e);
        }
    }

    async function handleCampusContextChange(newCampusId) {
        if (!isPlatformSuperAdmin()) return;

        const parsedId = newCampusId ? parseInt(newCampusId, 10) : null;
        setSelectedCampusId(parsedId);
        updateCampusHeaderDisplay(parsedId);

        // Synchronize desktop & mobile dropdowns
        const superAdminSelect = document.getElementById("superAdminCampusSelect");
        if (superAdminSelect && superAdminSelect.value !== String(newCampusId || "")) {
            superAdminSelect.value = newCampusId || "";
        }
        const mobileSelect = document.getElementById("superAdminMobileCampusSelect");
        if (mobileSelect && mobileSelect.value !== String(newCampusId || "")) {
            mobileSelect.value = newCampusId || "";
        }

        // Reset operational caches so no stale data from previous campus lingers
        cachedBuses = [];
        cachedRoutes = [];
        cachedStops = [];
        cachedStudents = [];
        cachedParents = [];

        // Refresh dropdowns if campus is selected
        if (parsedId) {
            loadBusesDropdown();
            loadRoutesDropdown();
            loadStopsDropdown();
        } else {
            document.querySelectorAll(".bus-select-dropdown").forEach(s => { s.innerHTML = `<option value="">-- Select Campus First --</option>`; });
            document.querySelectorAll(".route-select-dropdown").forEach(s => { s.innerHTML = `<option value="">-- Select Campus First --</option>`; });
            document.querySelectorAll(".stop-select-dropdown").forEach(s => { s.innerHTML = `<option value="">-- Select Campus First --</option>`; });
        }

        // Refresh campus entitlements for newly selected campus context
        await loadAdminCampusEntitlements(parsedId);

        // Refresh whichever section is currently active
        switch (activeSection) {
            case "dashboard":
                loadDashboard();
                break;
            case "buses":
                loadBuses();
                break;
            case "routes":
                loadRoutes();
                break;
            case "stops":
                loadStops();
                break;
            case "students":
                loadStudents();
                break;
            case "parents":
                loadParents();
                break;
            default:
                showSection(activeSection);
                break;
        }
    }

    function updateCampusDropdowns(campuses) {
        if (!Array.isArray(campuses)) return;

        const currentSelected = getSelectedCampusId();
        const activeCampusOptions = `<option value="">-- Select Campus --</option>` +
            campuses.filter(c => c.is_active !== false).map(c => {
                const typeLabel = (c.campus_type === 'school' || c.type === 'school') ? '🏫 School' : '🎓 College';
                return `<option value="${c.id}">${escapeHtml(c.name)} (${typeLabel})</option>`;
            }).join("");

        // Dropdown in Top Header (Super-Admin Campus Context Switcher)
        const superAdminSelect = document.getElementById("superAdminCampusSelect");
        if (superAdminSelect && isPlatformSuperAdmin()) {
            superAdminSelect.innerHTML = activeCampusOptions;
            if (currentSelected && campuses.some(c => c.id === currentSelected && c.is_active !== false)) {
                superAdminSelect.value = String(currentSelected);
            } else {
                superAdminSelect.value = "";
            }
        }

        // Dropdown in Mobile Bar (< lg Context Switcher)
        const mobileSelect = document.getElementById("superAdminMobileCampusSelect");
        if (mobileSelect && isPlatformSuperAdmin()) {
            mobileSelect.innerHTML = activeCampusOptions;
            if (currentSelected && campuses.some(c => c.id === currentSelected && c.is_active !== false)) {
                mobileSelect.value = String(currentSelected);
            } else {
                mobileSelect.value = "";
            }
        }

        if (isPlatformSuperAdmin()) {
            if (currentSelected && campuses.some(c => c.id === currentSelected && c.is_active !== false)) {
                updateCampusHeaderDisplay(currentSelected);
            } else {
                setSelectedCampusId(null);
                updateCampusHeaderDisplay(null);
            }
        }

        // Dropdown in Add Parent Modal (Super-Admin: only School campuses)
        const addParentSelect = document.getElementById("addParentCampusSelect");
        if (addParentSelect) {
            const currentVal = addParentSelect.value || currentSelected;
            const schoolCampuses = campuses.filter(c => c.is_active !== false && (c.campus_type === 'school' || c.type === 'school'));
            addParentSelect.innerHTML = `<option value="">-- Select School Campus --</option>` +
                schoolCampuses.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (School ID: ${c.id})</option>`).join("");
            if (currentVal && schoolCampuses.some(c => String(c.id) === String(currentVal))) {
                addParentSelect.value = String(currentVal);
            }
        }

        // Dropdown in Add Admin Modal
        const addAdminSelect = document.getElementById("addAdminCampusSelect");
        if (addAdminSelect) {
            const currentVal = addAdminSelect.value;
            addAdminSelect.innerHTML = campuses.map(c =>
                `<option value="${c.id}">${escapeHtml(c.name)} (ID: ${c.id})${!c.is_active ? ' - Inactive' : ''}</option>`
            ).join("");
            if (currentVal && campuses.some(c => String(c.id) === String(currentVal))) {
                addAdminSelect.value = currentVal;
            }
        }

        // Dropdown in Allot Admin Modal
        const allotSelect = document.getElementById("allotCampusSelect");
        if (allotSelect) {
            const currentVal = allotSelect.value;
            allotSelect.innerHTML = `
                <option value="">-- Choose Target Campus --</option>
                ${campuses.map(c => `
                    <option value="${c.id}">${escapeHtml(c.name)} (ID: ${c.id})${!c.is_active ? ' - Inactive' : ''}</option>
                `).join("")}
            `;
            if (currentVal && campuses.some(c => String(c.id) === String(currentVal))) {
                allotSelect.value = currentVal;
            }
        }
    }

    async function loadCampuses() {
        const container = document.getElementById("campusesList");
        if (!container) return;

        try {
            const data = await apiRequest("/super-admin/campuses");
            cachedCampuses = Array.isArray(data) ? data : [];
            updateCampusDropdowns(cachedCampuses);

            if (cachedCampuses.length === 0) {
                container.innerHTML = `<div class="kx-empty-card text-xs text-slate-400">No campuses provisioned yet. Use Create Campus to add one.</div>`;
                return;
            }

            container.innerHTML = `
                <div class="bg-white border border-slate-200/90 rounded overflow-hidden shadow-xs">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead class="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                <tr>
                                    <th class="p-3.5">Campus</th>
                                    <th class="p-3.5">Code / Slug</th>
                                    <th class="p-3.5">Type & Plan</th>
                                    <th class="p-3.5">Status</th>
                                    <th class="p-3.5">Created</th>
                                    <th class="p-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${cachedCampuses.map(c => `
                                    <tr class="hover:bg-slate-50/80 transition">
                                        <td class="p-3.5">
                                            <div class="flex items-center gap-2.5">
                                                <div class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-black text-xs">
                                                    ${escapeHtml(c.id)}
                                                </div>
                                                <div>
                                                    <span class="font-bold text-slate-900">${escapeHtml(c.name)}</span>
                                                    <p class="text-[10px] text-slate-400 font-mono">ID: ${escapeHtml(c.id)}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="p-3.5">
                                            <span class="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">${escapeHtml(c.slug)}</span>
                                        </td>
                                        <td class="p-3.5 space-x-1">
                                            ${(c.campus_type === 'school' || c.type === 'school')
                                                ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">🏫 School</span>'
                                                : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">🎓 College</span>'
                                            }
                                            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200">${escapeHtml(c.plan_tier || 'basic')}</span>
                                        </td>
                                        <td class="p-3.5">
                                            <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${c.is_active ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}">${c.is_active ? "ACTIVE" : "INACTIVE"}</span>
                                        </td>
                                        <td class="p-3.5 text-slate-500">${formatDateTime(c.created_at)}</td>
                                        <td class="p-3.5 text-right space-x-1">
                                            <button type="button" onclick="window.KambusAdmin.openEditCampusModal(${Number(c.id)})" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold text-slate-700 transition" title="Edit Campus Settings">Edit</button>
                                            <button type="button" onclick="window.KambusAdmin.openAddAdminForCampus(${Number(c.id)})" class="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg text-[11px] font-bold border border-emerald-200 transition" title="Add Admin for this campus">+ Admin</button>
                                            <button type="button" onclick="window.KambusAdmin.toggleCampusStatus(${Number(c.id)}, ${Boolean(c.is_active)})" class="px-2.5 py-1 bg-slate-100 hover:bg-danger hover:text-white rounded-lg text-[11px] font-bold text-slate-700 transition">${c.is_active ? "Deactivate" : "Activate"}</button>
                                        </td>
                                    </tr>
                                `).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="p-8 text-center text-xs text-red-500">Failed to load campuses: ${escapeHtml(e.message)}</div>`;
        }
    }

    function handleNewCampusTypeChange(type) {
        const help = document.getElementById("newCampusTypeHelp");
        if (!help) return;
        if (type === "school") {
            help.textContent = "School mode: parent-linked tracking, parental travel notifications, driver scan notifications, and admin/parent-managed student profiles. Students do not self-register.";
        } else {
            help.textContent = "College mode: student-driven passes, student self-signup, attendance logs, and individual travel notifications. Parent portal is disabled.";
        }
    }

    function openCreateCampusModal() {
        const modal = document.getElementById("createCampusModal");
        const errDiv = document.getElementById("createCampusError");
        if (errDiv) {
            errDiv.classList.add("hidden");
            errDiv.textContent = "";
        }
        const nameInput = document.getElementById("newCampusName");
        const slugInput = document.getElementById("newCampusSlug");
        const typeSelect = document.getElementById("newCampusType");
        if (nameInput) nameInput.value = "";
        if (slugInput) {
            slugInput.value = "";
            delete slugInput.dataset.manuallyEdited;
        }
        if (typeSelect) {
            typeSelect.value = "college";
            handleNewCampusTypeChange("college");
        }
        modal?.classList.remove("hidden");
    }

    async function submitCreateCampus(event) {
        event.preventDefault();
        const form = event.target;
        const errDiv = document.getElementById("createCampusError");
        const submitBtn = document.getElementById("btnSubmitCreateCampus");
        if (errDiv) {
            errDiv.classList.add("hidden");
            errDiv.textContent = "";
        }

        const name = form.elements.name.value.trim();
        const slug = form.elements.slug.value.trim().toLowerCase();
        const campus_type = form.elements.campus_type.value;
        const plan_tier = form.elements.plan_tier.value;

        if (!name || !slug) {
            if (errDiv) {
                errDiv.textContent = "Please fill in all required fields.";
                errDiv.classList.remove("hidden");
            }
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Creating...";
            }

            const created = await apiRequest("/super-admin/campuses", {
                method: "POST",
                body: {
                    name,
                    slug,
                    campus_type,
                    type: campus_type,
                    plan_tier
                }
            });

            showToast("success", "Campus Created", `Campus "${created.name}" (ID ${created.campus_id || created.id}) provisioned successfully.`);
            document.getElementById("createCampusModal")?.classList.add("hidden");
            form.reset();
            await loadCampuses();
        } catch (e) {
            if (errDiv) {
                errDiv.textContent = e.message || "Failed to create campus.";
                errDiv.classList.remove("hidden");
            }
            showToast("error", "Campus Creation Failed", e.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Create Campus";
            }
        }
    }

    function openEditCampusModal(campusId) {
        const campus = cachedCampuses.find(c => c.id === campusId);
        if (!campus) return;

        const errDiv = document.getElementById("editCampusError");
        if (errDiv) {
            errDiv.classList.add("hidden");
            errDiv.textContent = "";
        }

        document.getElementById("editCampusId").value = campus.id;
        document.getElementById("editCampusSlug").textContent = `Code: ${campus.slug} (ID: ${campus.id})`;
        document.getElementById("editCampusName").value = campus.name || "";
        document.getElementById("editCampusPlanTier").value = (campus.plan_tier || "basic").toLowerCase();
        document.getElementById("editCampusType").value = (campus.campus_type || campus.type || "college").toLowerCase();
        document.getElementById("editCampusLogo").value = campus.logo_url || "";

        document.getElementById("editCampusModal")?.classList.remove("hidden");
    }

    async function submitEditCampus(event) {
        event.preventDefault();
        const form = event.target;
        const campusId = form.campus_id.value;
        const name = form.name.value.trim();
        const plan_tier = form.plan_tier.value;
        const campus_type = form.campus_type.value;
        const logo_url = form.logo_url.value.trim() || null;
        const errDiv = document.getElementById("editCampusError");
        const submitBtn = document.getElementById("btnSubmitEditCampus");

        if (!name) {
            if (errDiv) {
                errDiv.textContent = "Campus name cannot be empty.";
                errDiv.classList.remove("hidden");
            }
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Saving...";
            }
            if (errDiv) errDiv.classList.add("hidden");

            await apiRequest(`/super-admin/campuses/${campusId}`, {
                method: "PATCH",
                body: {
                    name,
                    plan_tier,
                    campus_type,
                    type: campus_type,
                    logo_url
                }
            });

            showToast("success", "Campus Updated", `Campus "${name}" properties updated successfully.`);
            document.getElementById("editCampusModal")?.classList.add("hidden");
            await loadCampuses();
            if (getSelectedCampusId() === parseInt(campusId, 10)) {
                await loadAdminCampusEntitlements(parseInt(campusId, 10));
            }
        } catch (e) {
            if (errDiv) {
                errDiv.textContent = e.message || "Failed to update campus.";
                errDiv.classList.remove("hidden");
            }
            showToast("error", "Update Failed", e.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Save Changes";
            }
        }
    }

    async function toggleCampusStatus(campusId, isCurrentlyActive) {
        const target = cachedCampuses.find(c => c.id === campusId);
        const name = target ? target.name : `Campus ${campusId}`;
        const action = isCurrentlyActive ? "deactivate" : "activate";
        const question = isCurrentlyActive
            ? `Deactivate ${name}? Users belonging to this campus will not be able to access the system.`
            : `Activate ${name}?`;
        const confirmed = await confirm(question);
        if (!confirmed) return;

        try {
            await apiRequest(`/super-admin/campuses/${campusId}/${action}`, {
                method: "POST"
            });
            showToast("success", isCurrentlyActive ? "Campus Deactivated" : "Campus Activated", `${name} is now ${isCurrentlyActive ? "inactive" : "active"}.`);
            await loadCampuses();
        } catch (e) {
            showToast("error", "Update Failed", e.message);
        }
    }

    function openAddAdminForCampus(campusId) {
        openAddAdminModal();
        const sel = document.getElementById("addAdminCampusSelect");
        if (sel) {
            sel.value = String(campusId);
        }
    }

    async function loadAdmins() {
        const container = document.getElementById("adminsList");
        if (!container) return;

        try {
            if (cachedCampuses.length === 0) {
                try {
                    const cData = await apiRequest("/super-admin/campuses");
                    cachedCampuses = Array.isArray(cData) ? cData : [];
                    updateCampusDropdowns(cachedCampuses);
                } catch (_) {}
            }

            const data = await apiRequest("/admin/admins");
            cachedAdmins = Array.isArray(data) ? data : [];

            if (cachedAdmins.length === 0) {
                container.innerHTML = `<div class="kx-empty-card text-xs text-slate-400">No admins yet. Use Add Admin to create one.</div>`;
                return;
            }

            container.innerHTML = `
                <div class="bg-white border border-slate-200/90 rounded overflow-hidden shadow-xs">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead class="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                <tr>
                                    <th class="p-3.5">Admin</th>
                                    <th class="p-3.5">Campus</th>
                                    <th class="p-3.5">Admin ID (for sign-in)</th>
                                    <th class="p-3.5">Status</th>
                                    <th class="p-3.5">Created</th>
                                    <th class="p-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${cachedAdmins.map(a => {
                                    const campusObj = cachedCampuses.find(c => c.id === a.campus_id);
                                    const campusLabel = campusObj ? campusObj.name : `Campus ${a.campus_id || '1'}`;
                                    return `
                                    <tr class="hover:bg-slate-50/80 transition">
                                        <td class="p-3.5">
                                             <span class="font-bold text-slate-900">${escapeHtml(a.name)}</span>
                                             <p class="text-[11px] text-slate-400 font-mono">${escapeHtml(a.phone)}</p>
                                        </td>
                                        <td class="p-3.5">
                                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200" title="Campus ID: ${escapeHtml(a.campus_id || '1')}">${escapeHtml(campusLabel)}</span>
                                        </td>
                                        <td class="p-3.5 font-mono font-bold text-brand">${escapeHtml(a.admin_id)}</td>
                                        <td class="p-3.5">
                                            <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${a.status === "active" ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"}">${a.status === "active" ? "ACTIVE" : "DISABLED"}</span>
                                        </td>
                                        <td class="p-3.5 text-slate-500">${formatDateTime(a.created_at)}</td>
                                        <td class="p-3.5 text-right space-x-1">
                                            <button type="button" onclick="window.KambusAdmin.openAllotAdminModal(${Number(a.admin_id)})" class="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-lg text-[11px] font-bold border border-blue-200 transition" title="Allot or reassign to a campus">Allot Campus</button>
                                            <button type="button" onclick="window.KambusAdmin.openResetAdminPasswordModal(${Number(a.admin_id)})" class="px-2.5 py-1 bg-slate-100 hover:bg-brand hover:text-white rounded-lg text-[11px] font-bold text-slate-700 transition">Reset password</button>
                                            <button type="button" onclick="window.KambusAdmin.toggleAdminStatus(${Number(a.admin_id)})" class="px-2.5 py-1 bg-slate-100 hover:bg-danger hover:text-white rounded-lg text-[11px] font-bold text-slate-700 transition">${a.status === "active" ? "Disable" : "Enable"}</button>
                                        </td>
                                    </tr>
                                    `;
                                }).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="p-8 text-center text-xs text-red-500">Failed to load admins: ${escapeHtml(e.message)}</div>`;
        }
    }

    function openAddAdminModal() {
        if (cachedCampuses.length > 0) {
            updateCampusDropdowns(cachedCampuses);
        }
        document.getElementById("addAdminModal")?.classList.remove("hidden");
    }

    async function submitAddAdmin(event) {
        event.preventDefault();
        const form = event.target;
        const name = form.elements.name.value.trim();
        const phone = form.elements.phone.value.trim();
        const password = form.elements.password.value;
        const campusIdVal = form.elements.campus_id ? form.elements.campus_id.value : null;
        const campus_id = campusIdVal ? parseInt(campusIdVal, 10) : 1;

        try {
            const created = await apiRequest("/admin/create", {
                method: "POST",
                body: { name, phone, password, campus_id }
            });
            showToast("success", "Admin Created", `${created.name} can sign in on the Admin tab with Admin ID ${created.admin_id} (Campus ${created.campus_id}).`);
            document.getElementById("addAdminModal")?.classList.add("hidden");
            form.reset();
            loadAdmins();
        } catch (e) {
            showToast("error", "Failed to Add Admin", e.message);
        }
    }

    async function openAllotAdminModal(adminId) {
        const admin = cachedAdmins.find(a => a.admin_id === adminId);
        if (!admin) return;

        const modal = document.getElementById("allotAdminCampusModal");
        const errDiv = document.getElementById("allotAdminError");
        if (errDiv) {
            errDiv.classList.add("hidden");
            errDiv.textContent = "";
        }

        document.getElementById("allotTargetAdminId").value = admin.admin_id;
        document.getElementById("allotAdminNameDisplay").textContent = admin.name;
        document.getElementById("allotAdminPhoneDisplay").textContent = `Phone: ${admin.phone || '-'}`;

        const currentCampus = cachedCampuses.find(c => c.id === admin.campus_id);
        const currentCampusText = currentCampus ? `${currentCampus.name} (ID: ${currentCampus.id})` : `Campus ID ${admin.campus_id || '1'}`;
        document.getElementById("allotAdminCurrentCampusDisplay").textContent = `Current: ${currentCampusText}`;

        if (cachedCampuses.length === 0) {
            try {
                const camps = await apiRequest("/super-admin/campuses");
                cachedCampuses = Array.isArray(camps) ? camps : [];
                updateCampusDropdowns(cachedCampuses);
            } catch (e) {
                console.warn("Could not load campuses for allotment modal:", e);
            }
        } else {
            updateCampusDropdowns(cachedCampuses);
        }

        const sel = document.getElementById("allotCampusSelect");
        if (sel && admin.campus_id) {
            sel.value = String(admin.campus_id);
        }

        modal?.classList.remove("hidden");
    }

    async function submitAllotAdminCampus(event) {
        event.preventDefault();
        const errDiv = document.getElementById("allotAdminError");
        const submitBtn = document.getElementById("btnSubmitAllotAdmin");
        if (errDiv) {
            errDiv.classList.add("hidden");
            errDiv.textContent = "";
        }

        const adminId = document.getElementById("allotTargetAdminId")?.value;
        const campusIdVal = document.getElementById("allotCampusSelect")?.value;

        if (!adminId || !campusIdVal) {
            if (errDiv) {
                errDiv.textContent = "Please select a target campus.";
                errDiv.classList.remove("hidden");
            }
            return;
        }

        const campus_id = parseInt(campusIdVal, 10);
        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Allotting...";
            }

            const res = await apiRequest(`/super-admin/admins/${adminId}/allot-campus`, {
                method: "POST",
                body: { campus_id }
            });

            showToast("success", "Admin Allotted", res.message || `Admin successfully allotted to campus ${campus_id}.`);
            document.getElementById("allotAdminCampusModal")?.classList.add("hidden");
            await loadAdmins();
        } catch (e) {
            if (errDiv) {
                errDiv.textContent = e.message || "Failed to allot admin.";
                errDiv.classList.remove("hidden");
            }
            showToast("error", "Allotment Failed", e.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Save Allotment";
            }
        }
    }

    async function toggleAdminStatus(adminId) {
        const admin = cachedAdmins.find(a => a.admin_id === adminId);
        if (!admin) return;
        const disabling = admin.status === "active";
        const question = disabling
            ? `Disable ${admin.name}? They will not be able to sign in. An admin who is signed in now keeps access for up to an hour.`
            : `Enable ${admin.name}? They will be able to sign in again.`;
        const confirmed = await confirm(question);
        if (!confirmed) return;

        try {
            await apiRequest(`/admin/admins/${adminId}/${disabling ? "disable" : "enable"}`, { method: "POST" });
            showToast("success", disabling ? "Admin Disabled" : "Admin Enabled", `${admin.name} is now ${disabling ? "disabled" : "active"}.`);
            loadAdmins();
        } catch (e) {
            showToast("error", "Update Failed", e.message);
        }
    }

    function openResetAdminPasswordModal(adminId) {
        const admin = cachedAdmins.find(a => a.admin_id === adminId);
        if (!admin) return;
        document.getElementById("resetAdminId").value = admin.admin_id;
        document.getElementById("resetAdminName").textContent = `Admin: ${admin.name} (ID ${admin.admin_id})`;
        const passwordInput = document.querySelector("#resetAdminPasswordModal input[name='password']");
        if (passwordInput) passwordInput.value = "";
        document.getElementById("resetAdminPasswordModal")?.classList.remove("hidden");
    }

    async function submitResetAdminPassword(event) {
        event.preventDefault();
        const form = event.target;
        const adminId = form.elements.admin_id.value;
        const password = form.elements.password.value;

        try {
            await apiRequest(`/admin/admins/${adminId}/reset-password`, {
                method: "POST",
                body: { password }
            });
            showToast("success", "Password Reset", "The admin can sign in with the new password.");
            document.getElementById("resetAdminPasswordModal")?.classList.add("hidden");
            form.reset();
        } catch (e) {
            showToast("error", "Reset Failed", e.message);
        }
    }

    // =========================================================================
    // ACTIVE SESSIONS & FORCE LOGOUT
    // =========================================================================

    async function loadSessions() {
        const container = document.getElementById("sessionsListContainer");
        if (!container) return;

        try {
            container.innerHTML = `<div class="p-8 text-center text-xs text-ink-muted">Loading active sessions...</div>`;
            const sessions = await apiRequest("/admin/sessions");
            if (!Array.isArray(sessions) || sessions.length === 0) {
                container.innerHTML = `<div class="kx-empty-card text-xs text-slate-400">No active sessions found.</div>`;
                return;
            }

            container.innerHTML = `
                <div class="bg-white border border-slate-200/90 rounded overflow-hidden shadow-xs">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead class="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                <tr>
                                    <th class="p-3.5">User</th>
                                    <th class="p-3.5">Role</th>
                                    <th class="p-3.5">Campus</th>
                                    <th class="p-3.5">Session ID</th>
                                    <th class="p-3.5">Last Login</th>
                                    <th class="p-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${sessions.map(s => {
                                    const roleBadge = s.role === 'driver'
                                        ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">Driver (${escapeHtml(s.driver_code || '')})</span>`
                                        : (s.role === 'super_admin'
                                            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200">Super Admin</span>`
                                            : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">Admin</span>`);
                                    const campusLabel = s.campus_name || (s.campus_id ? `Campus ${s.campus_id}` : 'Platform');
                                    const formattedTime = s.last_login_at ? new Date(s.last_login_at).toLocaleString() : 'Recent';
                                    const sessionDisplay = s.session_id ? (s.session_id.substring(0, 8) + '...') : '-';

                                    return `
                                    <tr class="hover:bg-slate-50/80 transition" id="session-row-${escapeHtml(String(s.user_id))}">
                                        <td class="p-3.5">
                                            <span class="font-bold text-slate-900">${escapeHtml(s.name)}</span>
                                            <p class="text-[11px] text-slate-400 font-mono">ID: ${escapeHtml(String(s.user_id))}</p>
                                        </td>
                                        <td class="p-3.5">${roleBadge}</td>
                                        <td class="p-3.5">
                                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(campusLabel)}</span>
                                        </td>
                                        <td class="p-3.5 font-mono text-[11px] text-slate-600" title="${escapeHtml(s.session_id || '')}">
                                            <code>${escapeHtml(sessionDisplay)}</code>
                                        </td>
                                        <td class="p-3.5 text-slate-600">${escapeHtml(formattedTime)}</td>
                                        <td class="p-3.5 text-right">
                                            <button type="button" onclick="window.KambusAdmin.forceLogoutSession('${escapeHtml(s.role)}', ${Number(s.user_id)})"
                                                class="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-[11px] rounded border border-red-200 transition flex items-center gap-1 ml-auto">
                                                <svg class="w-3.5 h-3.5" aria-hidden="true"><use href="icons.svg#icon-logout"/></svg>
                                                <span>Force Logout</span>
                                            </button>
                                        </td>
                                    </tr>
                                    `;
                                }).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (e) {
            container.innerHTML = `<div class="p-4 text-xs text-red-500">${escapeHtml(e.message)}</div>`;
        }
    }

    async function forceLogoutSession(role, userId) {
        if (!confirm(`Are you sure you want to force logout this ${role}? Their active session will be invalidated immediately.`)) {
            return;
        }

        try {
            await apiRequest(`/admin/sessions/${encodeURIComponent(role)}/${encodeURIComponent(userId)}/force-logout`, {
                method: "POST"
            });
            showToast("success", "Session Terminated", `Successfully forced logout for ${role}.`);
            await loadSessions();
        } catch (e) {
            showToast("error", "Logout Failed", e.message);
        }
    }

    // =========================================================================
    // INITIALIZATION ON DOM READY
    // =========================================================================

    document.addEventListener("DOMContentLoaded", () => {
        if (!checkAuth()) return;

        setupSuperAdminNav();
        loadAdminCampusEntitlements();
        initSuperAdminCampusSelector();
        initAdminWebSocket();
        showSection("dashboard");

        // Live Entitlements auto-refresh on foreground / interval (mitigation for tier upgrades)
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                loadAdminCampusEntitlements();
            }
        });
        window.addEventListener("focus", () => {
            loadAdminCampusEntitlements();
        });
        setInterval(() => {
            loadAdminCampusEntitlements();
        }, 60000);

        // Preload super admin campuses & wire slug listener
        if (isSuperAdmin()) {
            loadCampuses();
        } else {
            apiRequest("/admin/campuses").then(campuses => {
                if (Array.isArray(campuses)) {
                    cachedCampuses = campuses;
                    const payload = getJwtPayload();
                    const adminCampusId = payload ? payload.campus_id : 1;
                    const myCampus = campuses.find(c => c.id === adminCampusId);
                    const isSchool = myCampus ? (myCampus.campus_type === 'school' || myCampus.type === 'school') : false;
                    const navBtnParents = document.getElementById("navBtnParents");
                    if (navBtnParents) {
                        if (isSchool) {
                            navBtnParents.classList.remove("hidden");
                        } else {
                            navBtnParents.classList.add("hidden");
                        }
                    }
                }
            }).catch(() => {});
        }

        const campusNameInput = document.getElementById("newCampusName");
        const campusSlugInput = document.getElementById("newCampusSlug");
        if (campusNameInput && campusSlugInput) {
            campusNameInput.addEventListener("input", (e) => {
                if (!campusSlugInput.dataset.manuallyEdited) {
                    campusSlugInput.value = e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                }
            });
            campusSlugInput.addEventListener("input", () => {
                campusSlugInput.dataset.manuallyEdited = "true";
            });
        }

        // Initial pre-load of dropdowns in background
        loadBusesDropdown();
        loadDriversDropdown();
        loadRoutesDropdown();
        loadStopsDropdown();

        setInterval(() => {
            if (activeSection === "dashboard") loadDashboard();
            if (activeSection === "alerts") loadAlerts();
            if (activeSection === "today-operations") loadTodayOperations();
        }, 10000);
    });

    let cachedMessages = [];

    async function loadMessages() {
        const container = document.getElementById("messagesList");
        if (!container) return;
        container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Loading messages...</div>`;

        try {
            const catFilter = document.getElementById("messageFilterCategory")?.value || "";
            const statusFilter = document.getElementById("messageFilterStatus")?.value || "";

            let queryParams = [];
            if (catFilter) queryParams.push(`category=${encodeURIComponent(catFilter)}`);
            if (statusFilter) queryParams.push(`status=${encodeURIComponent(statusFilter)}`);
            const qs = queryParams.length ? `?${queryParams.join("&")}` : "";

            const data = await apiRequest(`/admin/messages${qs}`);
            cachedMessages = data.messages || [];

            const statTotal = document.getElementById("messagesStatTotal");
            const statUnread = document.getElementById("messagesStatUnread");
            const statBusRelated = document.getElementById("messagesStatBusRelated");

            if (statTotal) statTotal.textContent = cachedMessages.length;
            if (statUnread) statUnread.textContent = cachedMessages.filter(m => m.status === "unread").length;
            if (statBusRelated) statBusRelated.textContent = cachedMessages.filter(m => m.category === "bus-related").length;

            if (cachedMessages.length === 0) {
                container.innerHTML = `<div class="kx-empty-card text-xs text-slate-400">No student messages found.</div>`;
                return;
            }

            container.innerHTML = cachedMessages.map(m => {
                const isUnread = m.status === "unread";
                const isReplied = m.status === "replied" || !!m.reply;
                const catBadge = m.category === "bus-related"
                    ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">Bus-Related</span>`
                    : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">General</span>`;
                const statusBadge = isReplied
                    ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">Replied</span>`
                    : (isUnread
                        ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Unread</span>`
                        : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Read</span>`);

                const dateStr = m.created_at ? new Date(m.created_at).toLocaleString() : "-";
                const replyDateStr = m.replied_at ? new Date(m.replied_at).toLocaleString() : "";

                return `
                    <div class="kx-card p-4 flex flex-col gap-3 ${isUnread ? 'border-amber-300' : ''}">
                        <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div class="space-y-1.5 flex-1 min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="text-xs font-bold text-navy">${escapeHtml(m.student_name)}</span>
                                    <span class="text-[11px] text-ink-muted">(${escapeHtml(m.student_roll_number || 'No roll')})</span>
                                    ${catBadge}
                                    ${statusBadge}
                                    <span class="text-[10px] text-ink-muted ml-auto sm:ml-0">${escapeHtml(dateStr)}</span>
                                </div>
                                <p class="text-xs text-slate-800 whitespace-pre-wrap break-words leading-relaxed">${escapeHtml(m.message)}</p>
                            </div>
                            <div class="flex items-center gap-2 shrink-0 self-start sm:self-center">
                                ${isUnread ? `
                                    <button type="button" onclick="window.KambusAdmin.markMessageRead(${m.id})" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded transition">
                                        Mark Read
                                    </button>
                                ` : ''}
                                <button type="button" onclick="window.KambusAdmin.toggleReplyForm(${m.id})" class="px-3 py-1.5 bg-brand hover:bg-brand/90 text-white text-xs font-semibold rounded transition">
                                    ${m.reply ? 'Edit Reply' : 'Reply'}
                                </button>
                            </div>
                        </div>

                        ${m.reply ? `
                            <div class="mt-1 p-3 rounded-lg bg-teal-50/70 border border-teal-200/60 text-xs">
                                <div class="flex items-center gap-1.5 font-bold text-teal-900 mb-1">
                                    <span class="inline-block w-2 h-2 rounded-full bg-teal-500"></span>
                                    <span>${escapeHtml(m.admin_name || 'Admin')} Reply</span>
                                    ${replyDateStr ? `<span class="text-[10px] font-normal text-slate-500 ml-auto">${escapeHtml(replyDateStr)}</span>` : ''}
                                </div>
                                <p class="text-slate-800 whitespace-pre-wrap break-words leading-relaxed">${escapeHtml(m.reply)}</p>
                            </div>
                        ` : ''}

                        <div id="replyForm-${m.id}" class="hidden mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                            <label for="replyInput-${m.id}" class="block text-xs font-semibold text-slate-700">Write reply to student:</label>
                            <textarea id="replyInput-${m.id}" rows="3" class="w-full p-2 text-xs border border-slate-300 rounded focus:border-brand focus:outline-none" placeholder="Type your response...">${escapeHtml(m.reply || '')}</textarea>
                            <div class="flex items-center justify-end gap-2">
                                <button type="button" onclick="window.KambusAdmin.toggleReplyForm(${m.id})" class="px-3 py-1 text-xs text-slate-600 hover:text-slate-800">Cancel</button>
                                <button type="button" onclick="window.KambusAdmin.submitMessageReply(${m.id})" class="px-3 py-1 bg-brand text-white text-xs font-semibold rounded hover:bg-brand/90">Send Reply</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join("");
        } catch (e) {
            container.innerHTML = `<div class="p-8 text-center text-xs text-red-500">Failed to load messages: ${escapeHtml(e.message)}</div>`;
        }
    }

    async function markMessageRead(messageId) {
        try {
            await apiRequest(`/admin/messages/${messageId}/read`, { method: "PATCH" });
            loadMessages();
        } catch (e) {
            alert(`Failed to update message: ${e.message}`);
        }
    }

    function toggleReplyForm(messageId) {
        const form = document.getElementById(`replyForm-${messageId}`);
        if (!form) return;
        form.classList.toggle("hidden");
        if (!form.classList.contains("hidden")) {
            const input = document.getElementById(`replyInput-${messageId}`);
            if (input) input.focus();
        }
    }

    async function submitMessageReply(messageId) {
        const input = document.getElementById(`replyInput-${messageId}`);
        const reply = input ? input.value.trim() : "";
        if (!reply) {
            alert("Please type a reply before sending.");
            return;
        }
        try {
            await apiRequest(`/admin/messages/${messageId}/reply`, {
                method: "POST",
                body: JSON.stringify({ reply })
            });
            loadMessages();
        } catch (e) {
            alert(`Failed to send reply: ${e.message}`);
        }
    }

    // =========================================================================
    // GLOBAL MODAL & DRAWER DISMISS LISTENERS (FIX-2)
    // =========================================================================
    const activeModalStack = [];

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" || e.key === "Esc") {
            const visibleFromStack = activeModalStack.filter(m => !m.classList.contains("hidden") && document.body.contains(m));
            const openModals = visibleFromStack.length > 0 ? visibleFromStack : Array.from(document.querySelectorAll('[data-modal="true"]:not(.hidden)'));
            if (openModals.length > 0) {
                // Close only the topmost open modal (last opened)
                const topmost = openModals[openModals.length - 1];
                const hasCloseBtn = topmost.querySelector('button, [onclick*="hidden"], .close, [aria-label*="Close"]');
                if (hasCloseBtn) {
                    topmost.classList.add("hidden");
                    const idx = activeModalStack.indexOf(topmost);
                    if (idx !== -1) activeModalStack.splice(idx, 1);
                    unlockScroll();
                }
            } else if (document.getElementById("adminSidebar")?.classList.contains("open")) {
                closeMobileSidebar();
            }
        }
    });

    document.addEventListener("click", (e) => {
        // Backdrop click on genuine modal overlay with close button
        if (e.target && e.target.matches && e.target.matches('[data-modal="true"]')) {
            const hasCloseBtn = e.target.querySelector('button, [onclick*="hidden"], .close, [aria-label*="Close"]');
            if (hasCloseBtn) {
                e.target.classList.add("hidden");
                const idx = activeModalStack.indexOf(e.target);
                if (idx !== -1) activeModalStack.splice(idx, 1);
                unlockScroll();
            }
        }
        // Sync scroll lock with active modals on any button/interactive click
        setTimeout(() => {
            document.querySelectorAll('[data-modal="true"]:not(.hidden)').forEach(m => {
                if (!activeModalStack.includes(m)) activeModalStack.push(m);
            });
            for (let i = activeModalStack.length - 1; i >= 0; i--) {
                if (activeModalStack[i].classList.contains("hidden")) {
                    activeModalStack.splice(i, 1);
                }
            }
            const hasOpenModal = document.querySelector('[data-modal="true"]:not(.hidden)');
            const sidebarOpen = document.getElementById("adminSidebar")?.classList.contains("open");
            if (hasOpenModal || sidebarOpen) {
                lockScroll();
            } else {
                unlockScroll();
            }
        }, 15);
    });

    window.KambusAdmin = {
        lockScroll,
        unlockScroll,
        showSection,
        toggleMobileSidebar,
        closeMobileSidebar,
        loadBusesDropdown,
        loadDriversDropdown,
        loadRoutesDropdown,
        loadStopsDropdown,
        handleAdminLogout,
        openAddBusModal,
        openBusModal,
        replaceCurrentBus,
        submitUpdateBusGeneralProps,
        deleteBus,
        submitAddBus,
        openAddDriverModal: () => {
            lockScroll();
            document.getElementById("addDriverModal")?.classList.remove("hidden");
        },
        openDriverModal,
        openEditDriverModal,
        deleteDriver,
        submitAddDriver,
        submitEditDriver,
        loadStudents,
        openAddStudentModal,
        openAssignStudentModal,
        submitAssignStudent,
        openEditStudentModal,
        submitEditStudent,
        deleteStudent,
        submitAddStudent,
        toggleStudentSelect,
        toggleSelectAllStudents,
        clearStudentSelection,
        openBulkAssignBusModal,
        submitBulkAssignBus,
        loadParents,
        openAddParentModal,
        submitAddParent,
        openEditParentModal,
        submitEditParent,
        openLinkChildModal,
        onSearchLinkStudents,
        selectLinkStudent,
        clearSelectedLinkStudent,
        submitLinkChild,
        toggleParentChildren,
        unlinkChild,
        loadStops,
        openAddStopModal,
        openEditStopModal,
        submitAddStop,
        submitEditStop,
        deleteStop,
        loadComplaints,
        filterComplaintsList,
        openComplaintDetailModal,
        loadGeofenceLogs,
        loadTemporaryStopLogs,
        filterTempStopLogs,
        approveTemporaryStopRequest,
        rejectTemporaryStopRequest,
        deleteTemporaryStopChange,
        loadPermanentStopRequests,
        filterPermanentStopRequests,
        approvePermanentStopRequest,
        rejectPermanentStopRequest,
        openAddAdminModal,
        submitAddAdmin,
        toggleAdminStatus,
        openResetAdminPasswordModal,
        submitResetAdminPassword,
        loadCampuses,
        openCreateCampusModal,
        openEditCampusModal,
        submitEditCampus,
        handleNewCampusTypeChange,
        submitCreateCampus,
        toggleCampusStatus,
        openAddAdminForCampus,
        openAllotAdminModal,
        submitAllotAdminCampus,
        submitAddRoute,
        openEditRouteModal,
        submitEditRoute,
        deleteRoute,
        reorderRouteStop,
        previewRouteRoadMap,
        onAnnouncementTargetTypeChanged,
        updateAnnouncementTemplateFields,
        previewAnnouncementText,
        calculateAffectedStudents,
        submitBroadcastAnnouncement,
        cancelAdminBusChange,
        acknowledgeAlert,
        executeGlobalSearch,
        loadMessages,
        markMessageRead,
        toggleReplyForm,
        submitMessageReply,
        handleCampusContextChange,
        initSuperAdminCampusSelector,
        loadSessions,
        forceLogoutSession
    };

})();
