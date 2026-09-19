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
    let editStopPickerMap = null;
    let editStopPickerMarker = null;
    let routeMap = null;
    let routeMapLayers = [];
    let adminSocket = null;
    let adminWsTimer = null;
    let cachedBuses = [];
    let cachedDrivers = [];
    let cachedRoutes = [];
    let cachedStops = [];
    let cachedComplaints = [];
    let currentViewingBusId = null;

    // =========================================================================
    // AUTHENTICATION & API REQUEST HELPERS
    // =========================================================================

    function getToken() {
        return localStorage.getItem("kambus_token") || localStorage.getItem("token") || "";
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
        toast.className = `fixed bottom-5 right-5 z-[9999] max-w-sm w-full p-4 rounded-2xl shadow-xl border flex items-start gap-3 transition-all duration-300 transform translate-y-2 opacity-0 ${
            type === "error"
                ? "bg-rose-950 text-rose-100 border-rose-800"
                : type === "warning"
                ? "bg-amber-950 text-amber-100 border-amber-800"
                : type === "success"
                ? "bg-emerald-950 text-emerald-100 border-emerald-800"
                : "bg-slate-900 text-slate-100 border-slate-700"
        }`;

        const icon = type === "error" ? "🚨" : type === "warning" ? "⚠️" : type === "success" ? "✅" : "🔔";

        toast.innerHTML = `
            <span class="text-xl">${icon}</span>
            <div class="flex-1 min-w-0">
                <h4 class="text-xs font-black tracking-wide">${escapeHtml(title)}</h4>
                <p class="text-xs text-slate-300 mt-0.5 leading-relaxed">${escapeHtml(message)}</p>
            </div>
            <button class="text-slate-400 hover:text-white" onclick="this.parentElement.remove()">✕</button>
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
                loadTemporaryStopLogs();
                break;
            case "live-map":
                setTimeout(initLiveMap, 100);
                break;
            case "notifications":
                initAnnouncementComposer();
                loadAnnouncementHistory();
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
            case "search":
                document.getElementById("globalSearchInput")?.focus();
                break;
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
            } else {
                sidebar.classList.add("open");
                overlay.classList.remove("hidden");
            }
        }
    }

    function closeMobileSidebar() {
        const sidebar = document.getElementById("adminSidebar");
        const overlay = document.getElementById("sidebarOverlay");
        if (sidebar) sidebar.classList.remove("open");
        if (overlay) overlay.classList.add("hidden");
    }

    // =========================================================================
    // DROPDOWN LOADERS (BUG-001, BUG-002, BUG-004, BUG-005, BUG-006)
    // =========================================================================

    async function loadBusesDropdown() {
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
        document.getElementById("addStopModal")?.classList.remove("hidden");
        setTimeout(() => initStopMapPicker(17.985, 79.595), 150);
    }

    // =========================================================================
    // 1. DASHBOARD OVERVIEW
    // =========================================================================

    async function loadDashboard() {
        try {
            const data = await apiRequest("/admin/dashboard");

            document.getElementById("statTotalBuses").textContent = data.total_buses || 0;
            document.getElementById("statActiveBuses").textContent = data.active_buses || 0;
            document.getElementById("statOfflineBuses").textContent = data.offline_buses || 0;
            document.getElementById("statTotalDrivers").textContent = data.total_drivers || 0;
            document.getElementById("statTotalStudents").textContent = data.total_students || 0;
            document.getElementById("statTravellingToday").textContent = data.students_travelling_today || 0;
            document.getElementById("statTotalRoutes").textContent = data.total_routes || 0;
            document.getElementById("statTotalStops").textContent = data.total_stops || 0;

            // Render Active Trips
            const activeTripsContainer = document.getElementById("dashboardActiveTrips");
            if (activeTripsContainer) {
                if (!data.active_trips || data.active_trips.length === 0) {
                    activeTripsContainer.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">No active trips currently in transit.</div>`;
                } else {
                    activeTripsContainer.innerHTML = data.active_trips.map(trip => `
                        <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between gap-2">
                            <div>
                                <div class="flex items-center gap-2">
                                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span class="font-black text-slate-900 text-xs">${escapeHtml(trip.bus_number)}</span>
                                    <span class="text-slate-400">&bull;</span>
                                    <span class="text-slate-600 text-xs font-semibold">${escapeHtml(trip.route_name || 'Campus Route')}</span>
                                </div>
                                <p class="text-[11px] text-slate-500 mt-0.5">Driver: <strong>${escapeHtml(trip.driver_name)}</strong> &bull; Started: ${formatDateTime(trip.started_at)}</p>
                            </div>
                            <button onclick="window.KambusAdmin.openBusModal(${trip.bus_id})" class="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 shadow-2xs">
                                View Bus
                            </button>
                        </div>
                    `).join("");
                }
            }

            // Render Recent Alerts
            const recentAlertsContainer = document.getElementById("dashboardRecentAlerts");
            if (recentAlertsContainer) {
                if (!data.recent_alerts || data.recent_alerts.length === 0) {
                    recentAlertsContainer.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">No recent alerts logged.</div>`;
                } else {
                    recentAlertsContainer.innerHTML = data.recent_alerts.slice(0, 4).map(alert => `
                        <div class="py-2.5 flex items-start justify-between gap-3 text-xs">
                            <div class="min-w-0">
                                <div class="flex items-center gap-1.5">
                                    <span class="text-sm">${alert.type === 'emergency_sos' ? '🚨' : '⚠️'}</span>
                                    <span class="font-bold text-slate-900 truncate">${escapeHtml(alert.title)}</span>
                                </div>
                                <p class="text-slate-500 text-[11px] truncate mt-0.5">${escapeHtml(alert.message)}</p>
                            </div>
                            <span class="text-[10px] text-slate-400 shrink-0">${formatDateTime(alert.created_at)}</span>
                        </div>
                    `).join("");
                }
            }
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
            container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400 col-span-full">No buses registered in fleet. Click "Add Bus" to create one.</div>`;
            return;
        }

        container.innerHTML = buses.map(bus => `
            <div class="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-brand/40 transition cursor-pointer flex flex-col justify-between" onclick="window.KambusAdmin.openBusModal(${bus.bus_id})">
                <div>
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <span class="text-base font-black text-slate-900">Bus ${escapeHtml(bus.bus_number)}</span>
                            <p class="text-[11px] font-mono text-slate-400">${escapeHtml(bus.registration_number || 'No reg number')}</p>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black ${bus.trip_status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
                            ${bus.trip_status === 'active' ? '🟢 IN TRANSIT' : 'IDLE'}
                        </span>
                    </div>

                    <div class="mt-3.5 space-y-1.5 text-xs">
                        <div class="flex items-center gap-1.5 text-slate-700">
                            <i class="fa-solid fa-route text-slate-400 w-4 text-center"></i>
                            <span class="truncate font-semibold">${escapeHtml(bus.route_name || 'No Route Assigned')}</span>
                        </div>
                        <div class="flex items-center gap-1.5 text-slate-700">
                            <i class="fa-solid fa-user-tie text-slate-400 w-4 text-center"></i>
                            <span class="truncate">${escapeHtml(bus.driver_name ? `${bus.driver_name} (${bus.driver_code})` : 'No Driver Assigned')}</span>
                        </div>
                    </div>
                </div>

                <div class="pt-3.5 mt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span class="text-slate-500 font-bold">
                        👥 <strong>${bus.student_count}</strong> students (${bus.travelling_today_count} today)
                    </span>
                    <button type="button" onclick="event.stopPropagation(); window.KambusAdmin.deleteBus(${bus.bus_id}, '${escapeHtml(bus.bus_number)}')" class="text-slate-300 hover:text-rose-600 p-1 transition" title="Delete Bus">
                        <i class="fa-solid fa-trash-can text-sm"></i>
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

            const badge = document.getElementById("modalBusStatusBadge");
            if (badge) {
                badge.className = `px-2.5 py-1 rounded-full text-xs font-black ${bus.trip_status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`;
                badge.textContent = bus.trip_status === 'active' ? "🟢 IN TRANSIT" : "IDLE";
            }

            document.getElementById("modalBusStudentCount").textContent = bus.student_count || 0;
            document.getElementById("modalBusTravellingCount").textContent = bus.travelling_today_count || 0;

            document.getElementById("modalBusDriverName").textContent = bus.driver_name || "Unassigned";
            document.getElementById("modalBusDriverPhone").textContent = bus.driver_phone ? `📞 ${bus.driver_phone}` : "";
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
                    status: status
                }
            });
            showToast("success", "Bus Updated", `Bus ${busNumber} properties updated successfully.`);
            openBusModal(busId);
            loadBuses();
        } catch (error) {
            showToast("error", "Update Failed", error.message);
        }
    }

    async function submitAddBus(event) {
        event.preventDefault();
        const form = event.target;
        const busNumber = form.bus_number.value.trim();
        const regNumber = form.registration_number.value.trim();
        const driverId = form.driver_id.value ? parseInt(form.driver_id.value) : null;
        const routeId = form.route_id.value ? parseInt(form.route_id.value) : null;

        try {
            await apiRequest("/admin/buses", {
                method: "POST",
                body: {
                    bus_number: busNumber,
                    registration_number: regNumber,
                    driver_id: driverId,
                    route_id: routeId,
                    status: "active"
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
        if (!confirm(`Are you sure you want to delete Bus ${busNumber}? Students assigned will be unassigned.`)) {
            return;
        }
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
            container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400 col-span-full">No drivers registered. Click "Add Driver" to create one.</div>`;
            return;
        }

        container.innerHTML = drivers.map(d => `
            <div class="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-brand/40 transition flex flex-col justify-between cursor-pointer" onclick="window.KambusAdmin.openDriverModal(${d.driver_id})">
                <div>
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <span class="text-base font-black text-slate-900">${escapeHtml(d.name || 'Driver')}</span>
                            <p class="text-[11px] font-mono font-bold text-brand uppercase">${escapeHtml(d.driver_code)}</p>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black ${d.is_online ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
                            ${d.is_online ? '🟢 ONLINE' : 'OFFLINE'}
                        </span>
                    </div>

                    <div class="mt-3.5 space-y-1.5 text-xs text-slate-600">
                        <p>📞 <strong>${escapeHtml(d.phone || '-')}</strong></p>
                        <p>🚌 Assigned: <strong>${escapeHtml(d.bus_number ? `Bus ${d.bus_number}` : 'Unassigned')}</strong></p>
                        <p>🛣️ Route: <strong>${escapeHtml(d.route_name || '-')}</strong></p>
                        ${(d.complaints_count || 0) > 0 ? `
                            <p class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-bold text-[11px] mt-1">
                                <i class="fa-solid fa-triangle-exclamation text-amber-600"></i> ${d.complaints_count} ${d.complaints_count === 1 ? 'Complaint' : 'Complaints'}
                            </p>
                        ` : ''}
                    </div>
                </div>

                <div class="pt-3.5 mt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span class="text-slate-400 text-[11px]">License: ${escapeHtml(d.license_number || 'N/A')}</span>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="event.stopPropagation(); window.KambusAdmin.openEditDriverModal(${d.driver_id})" class="text-slate-400 hover:text-brand p-1 transition" title="Edit Driver">
                            <i class="fa-solid fa-pen-to-square text-sm"></i>
                        </button>
                        <button type="button" onclick="event.stopPropagation(); window.KambusAdmin.deleteDriver(${d.driver_id}, '${escapeHtml(d.name || d.driver_code)}')" class="text-slate-300 hover:text-rose-600 p-1 transition" title="Delete Driver">
                            <i class="fa-solid fa-trash-can text-sm"></i>
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
            document.getElementById("modalDriverPhone").textContent = `📞 ${driver.phone || 'No phone'}`;
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
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'completed' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'}">
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
        if (!confirm(`Are you sure you want to remove driver ${name}?`)) {
            return;
        }
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

            if (students.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400 bg-white border border-slate-200/90 rounded-2xl">No students matching criteria.</div>`;
                return;
            }

            container.innerHTML = `
                <div class="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-xs border-collapse">
                            <thead class="bg-slate-50 border-b border-slate-200/80 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                                <tr>
                                    <th class="p-3.5">Student</th>
                                    <th class="p-3.5">Roll No</th>
                                    <th class="p-3.5">Department</th>
                                    <th class="p-3.5">Assigned Bus</th>
                                    <th class="p-3.5">Assigned Stop</th>
                                    <th class="p-3.5">Today Status</th>
                                    <th class="p-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${students.map(s => `
                                    <tr class="hover:bg-slate-50/80 transition">
                                        <td class="p-3.5">
                                            <span class="font-bold text-slate-900">${escapeHtml(s.name)}</span>
                                            <p class="text-[11px] text-slate-400 font-mono">${escapeHtml(s.phone)}</p>
                                        </td>
                                        <td class="p-3.5 font-mono font-bold text-brand uppercase">${escapeHtml(s.roll_number)}</td>
                                        <td class="p-3.5 text-slate-600 font-semibold">${escapeHtml(s.department || '-')}</td>
                                        <td class="p-3.5">
                                            ${s.bus_number ? `<span class="px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded text-indigo-900 font-bold text-[11px]">Bus ${escapeHtml(s.bus_number)}</span>` : '<span class="text-slate-300">Unassigned</span>'}
                                        </td>
                                        <td class="p-3.5">
                                            ${s.stop_name ? `<span class="font-bold text-slate-700">${escapeHtml(s.stop_name)}</span>` : '<span class="text-slate-300">No Stop</span>'}
                                        </td>
                                        <td class="p-3.5">
                                            <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${s.travelling_today ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                                                ${s.travelling_today ? '✓ Travelling' : '✕ Not Travelling'}
                                            </span>
                                        </td>
                                        <td class="p-3.5 text-right space-x-1">
                                            <button type="button" onclick="window.KambusAdmin.openAssignStudentModal(${s.student_id}, '${escapeHtml(s.name)}', ${s.bus_id || 'null'}, ${s.stop_id || 'null'})" class="px-2.5 py-1 bg-slate-100 hover:bg-brand hover:text-white rounded-lg text-[11px] font-bold text-slate-700 transition">
                                                Assign
                                            </button>
                                            <button type="button" onclick="window.KambusAdmin.deleteStudent(${s.student_id}, '${escapeHtml(s.roll_number)}')" class="p-1 text-slate-300 hover:text-rose-600 transition" title="Delete Student">
                                                <i class="fa-solid fa-trash-can"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (error) {
            container.innerHTML = `<div class="p-8 text-center text-xs text-red-500">Failed to load students: ${escapeHtml(error.message)}</div>`;
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

    async function submitAddStudent(event) {
        event.preventDefault();
        const form = event.target;
        const name = form.name.value.trim();
        const rollNumber = form.roll_number.value.trim().toUpperCase();
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
        if (!confirm(`Are you sure you want to delete student ${rollNumber}?`)) {
            return;
        }
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
    // 5. STOP MANAGEMENT (WITH INTERACTIVE LEAFLET PICKER & RESIZE BUG-010)
    // =========================================================================

    async function loadStops() {
        const container = document.getElementById("stopsList");
        if (!container) return;
        container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Loading stops...</div>`;

        try {
            const filterRouteSelect = document.getElementById("stopFilterRoute");
            const filterRouteId = filterRouteSelect && filterRouteSelect.value ? filterRouteSelect.value : "";
            const endpoint = filterRouteId ? `/admin/stops?route_id=${filterRouteId}` : "/admin/stops";

            const data = await apiRequest(endpoint);
            const stops = data.stops || [];
            cachedStops = stops;

            if (stops.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400 bg-white border border-slate-200/90 rounded-2xl">No stops found. Click "Add Stop" to create one.</div>`;
                return;
            }

            container.innerHTML = stops.map(s => `
                <div class="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3 text-xs">
                    <div class="flex items-center gap-3">
                        <span class="w-8 h-8 rounded-xl bg-brand/10 text-brand font-black flex items-center justify-center text-xs shrink-0">
                            #${s.stop_order}
                        </span>
                        <div>
                            <h4 class="font-black text-slate-900 text-sm">${escapeHtml(s.name)}</h4>
                            <p class="text-slate-500 font-semibold">Route: <strong>${escapeHtml(s.route_name || 'Unassigned')}</strong> &bull; 👥 <strong>${s.student_count}</strong> students assigned</p>
                            <p class="text-[10px] font-mono text-slate-400 mt-0.5">Lat: ${Number(s.latitude).toFixed(5)}, Lng: ${Number(s.longitude).toFixed(5)}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="window.KambusAdmin.openEditStopModal(${s.stop_id})" class="text-slate-400 hover:text-brand p-2 transition" title="Edit Stop">
                            <i class="fa-solid fa-pen-to-square text-sm"></i>
                        </button>
                        <button type="button" onclick="window.KambusAdmin.deleteStop(${s.stop_id}, '${escapeHtml(s.name)}')" class="text-slate-300 hover:text-rose-600 p-2 transition" title="Delete Stop">
                            <i class="fa-solid fa-trash-can text-sm"></i>
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
            document.getElementById("editStopLat").value = stopLat;
            document.getElementById("editStopLng").value = stopLng;

            document.getElementById("editStopModal")?.classList.remove("hidden");

            setTimeout(() => {
                initEditStopMapPicker(stopLat, stopLng);
            }, 150);
        } catch (e) {
            showToast("error", "Error", "Could not load stop details for editing: " + e.message);
        }
    }

    function initEditStopMapPicker(defaultLat, defaultLng) {
        const container = document.getElementById("editStopPickerMapContainer");
        if (!container) return;

        const lat = Number.isFinite(defaultLat) ? defaultLat : COLLEGE_COORDS[0];
        const lng = Number.isFinite(defaultLng) ? defaultLng : COLLEGE_COORDS[1];

        if (!editStopPickerMap) {
            editStopPickerMap = L.map("editStopPickerMapContainer").setView([lat, lng], 14);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap contributors"
            }).addTo(editStopPickerMap);

            editStopPickerMap.on("click", (e) => {
                setEditStopPickerCoords(e.latlng.lat, e.latlng.lng);
            });
        } else {
            editStopPickerMap.setView([lat, lng], 14);
        }

        setTimeout(() => {
            if (editStopPickerMap) editStopPickerMap.invalidateSize();
        }, 200);

        setEditStopPickerCoords(lat, lng);
    }

    function setEditStopPickerCoords(lat, lng) {
        const latInput = document.getElementById("editStopLat");
        const lngInput = document.getElementById("editStopLng");
        const display = document.getElementById("editStopCoordsDisplay");

        if (latInput) latInput.value = lat;
        if (lngInput) lngInput.value = lng;
        if (display) display.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        if (editStopPickerMarker) {
            editStopPickerMarker.setLatLng([lat, lng]);
        } else if (editStopPickerMap) {
            editStopPickerMarker = L.marker([lat, lng], { draggable: true }).addTo(editStopPickerMap);
            editStopPickerMarker.on("dragend", (e) => {
                const pos = e.target.getLatLng();
                setEditStopPickerCoords(pos.lat, pos.lng);
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

        if (isNaN(latitude) || isNaN(longitude)) {
            showToast("error", "Invalid Coordinates", "Please enter valid numeric latitude and longitude.");
            return;
        }

        try {
            await apiRequest(`/admin/stops/${stopId}`, {
                method: "PATCH",
                body: {
                    name,
                    route_id: routeId,
                    stop_order: stopOrder,
                    latitude,
                    longitude
                }
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
                attribution: "&copy; OpenStreetMap contributors"
            }).addTo(stopPickerMap);

            stopPickerMap.on("click", (e) => {
                setStopPickerCoords(e.latlng.lat, e.latlng.lng);
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
        const display = document.getElementById("addStopCoordsDisplay");

        if (latInput) latInput.value = lat;
        if (lngInput) lngInput.value = lng;
        if (display) display.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

        if (stopPickerMarker) {
            stopPickerMarker.setLatLng([lat, lng]);
        } else if (stopPickerMap) {
            stopPickerMarker = L.marker([lat, lng], { draggable: true }).addTo(stopPickerMap);
            stopPickerMarker.on("dragend", (e) => {
                const pos = e.target.getLatLng();
                setStopPickerCoords(pos.lat, pos.lng);
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

        if (isNaN(latitude) || isNaN(longitude)) {
            showToast("error", "Location Required", "Please click on the map to place the stop pin.");
            return;
        }

        try {
            await apiRequest(`/admin/routes/${routeId}/stops`, {
                method: "POST",
                body: {
                    name,
                    latitude,
                    longitude,
                    stop_order: stopOrder
                }
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
        if (!confirm(`Are you sure you want to delete stop "${stopName}"?`)) {
            return;
        }
        try {
            await apiRequest(`/admin/stops/${stopId}`, { method: "DELETE" });
            showToast("info", "Stop Deleted", `Stop "${stopName}" removed.`);
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
        container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Loading routes...</div>`;

        try {
            const data = await apiRequest("/admin/routes");
            cachedRoutes = data.routes || [];

            if (cachedRoutes.length === 0) {
                container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400 bg-white border border-slate-200/90 rounded-2xl">No routes configured. Click "Create Route" to start.</div>`;
                return;
            }

            container.innerHTML = cachedRoutes.map(r => `
                <div class="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="text-base font-black text-slate-900">${escapeHtml(r.name)}</h3>
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">${r.stops_count} Stops</span>
                            </div>
                            <p class="text-xs text-slate-500 mt-1">${escapeHtml(r.description || 'No description provided')}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button type="button" onclick="window.KambusAdmin.previewRouteRoadMap(${r.route_id})" class="px-3 py-1.5 bg-brand hover:bg-brandDark text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs">
                                <i class="fa-solid fa-map-location-dot"></i> View Road Map
                            </button>
                            <button type="button" onclick="window.KambusAdmin.deleteRoute(${r.route_id}, '${escapeHtml(r.name)}')" class="text-slate-300 hover:text-rose-600 p-1.5 transition" title="Delete Route">
                                <i class="fa-solid fa-trash-can text-sm"></i>
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
                                <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1.5 shrink-0 text-xs">
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

    async function deleteRoute(routeId, routeName) {
        if (!confirm(`Are you sure you want to delete route "${routeName}"? Stops and bus links will be cleared.`)) {
            return;
        }
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
                    attribution: "&copy; OpenStreetMap contributors"
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
                html: `<div style="background:#E11D48;color:#fff;border-radius:12px;padding:5px 10px;font-size:11px;font-weight:900;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3)">🏫 KITSW College</div>`,
                iconSize: [110, 28]
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
                return "🏎️ Rash / Reckless Driving";
            case "delay":
                return "⏱️ Severe Delay";
            case "overspeeding":
                return "⚡ Overspeeding";
            case "skipped_stop":
                return "🚫 Skipped Scheduled Stop";
            case "rude_behavior":
                return "🗣️ Rude / Inappropriate Behavior";
            case "other":
                return "📝 Other Concern";
            default:
                return escapeHtml(reason || "Complaint");
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
            container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400 bg-white border border-slate-200/90 rounded-2xl">No complaints found matching the criteria.</div>`;
            return;
        }

        container.innerHTML = complaints.map(c => {
            const isCorroborated = c.corroboration && c.corroboration.is_corroborated;
            const yesVotes = c.corroboration?.yes_count || 0;
            const noVotes = c.corroboration?.no_count || 0;
            const totalVotes = c.corroboration?.total_votes || 0;

            return `
                <div class="bg-white border ${isCorroborated ? 'border-rose-300 bg-rose-50/10' : 'border-slate-200/90'} rounded-2xl p-5 shadow-xs space-y-3.5">
                    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-black text-sm text-slate-900">${formatComplaintReason(c.reason)}</span>
                                ${isCorroborated ? `
                                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1">
                                        <i class="fa-solid fa-triangle-exclamation"></i> CORROBORATED
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

                        <!-- Driver Info Tag -->
                        <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-3 shrink-0 self-start">
                            <div>
                                <p class="text-xs font-black text-slate-900">${escapeHtml(c.driver_name)}</p>
                                <p class="text-[10px] font-mono text-slate-500">${escapeHtml(c.driver_code || '')} &bull; ${c.bus_number ? `Bus ${escapeHtml(c.bus_number)}` : 'Bus Unassigned'}</p>
                            </div>
                            <span class="px-2 py-1 rounded-lg bg-amber-100 text-amber-900 text-[10px] font-black" title="Driver total lifetime complaints">
                                ${c.driver_total_complaints || 1} Total
                            </span>
                        </div>
                    </div>

                    <!-- Description -->
                    ${c.description ? `
                        <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 leading-relaxed">
                            <span class="font-bold text-slate-900">Student Comment:</span> ${escapeHtml(c.description)}
                        </div>
                    ` : ''}

                    <!-- Peer Corroboration Box -->
                    <div class="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-slate-500 font-bold">Peer Verification:</span>
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                👍 ${yesVotes} Agreed
                            </span>
                            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                👎 ${noVotes} Disagreed
                            </span>
                            <span class="text-[11px] text-slate-400">(${totalVotes} peer ${totalVotes === 1 ? 'vote' : 'votes'})</span>
                        </div>
                        <div class="flex items-center gap-2">
                            ${isSuperAdmin() ? `
                                <button type="button" onclick="window.KambusAdmin.openComplaintDetailModal(${c.complaint_id})" class="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-[11px] rounded-lg transition flex items-center gap-1.5 shadow-2xs">
                                    <i class="fa-solid fa-user-shield text-xs"></i> <span>Super-Admin Detail</span>
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
                if (votersListEl) votersListEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-100">No students have voted on this complaint yet.</div>`;
            } else {
                if (votersListEl) {
                    votersListEl.innerHTML = voters.map(v => `
                        <div class="p-2.5 rounded-xl border ${v.vote === 'yes' ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'} flex items-center justify-between text-xs">
                            <div>
                                <p class="font-bold text-slate-900">${escapeHtml(v.student_name)} <span class="text-slate-500 font-normal">(${escapeHtml(v.roll_number || '—')})</span></p>
                                <p class="text-[10px] text-slate-400">Dept: ${escapeHtml(v.department || '—')} • Voted ${formatDateTime(v.created_at)}</p>
                            </div>
                            <span class="px-2.5 py-1 rounded-lg font-black text-xs ${v.vote === 'yes' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">
                                ${v.vote === 'yes' ? '👍 Agreed (Yes)' : '👎 Disagreed (No)'}
                            </span>
                        </div>
                    `).join("");
                }
            }
        } catch (e) {
            if (votersListEl) votersListEl.innerHTML = `<div class="p-4 text-center text-xs text-rose-500">Failed to load details: ${escapeHtml(e.message)}</div>`;
        }
    }

    // =========================================================================
    // 6d. TEMPORARY STOP AUDIT LOGS
    // =========================================================================

    let cachedTempStopLogs = [];

    async function loadTemporaryStopLogs() {
        const container = document.getElementById("tempStopLogsList");
        if (!container) return;

        container.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-xs text-slate-400">Loading temporary stop logs...</td></tr>`;

        try {
            const data = await apiRequest("/admin/temporary-stop-requests");
            cachedTempStopLogs = Array.isArray(data) ? data : [];
            filterTempStopLogs();
        } catch (e) {
            container.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-xs text-rose-500">Failed to load temporary stop logs: ${escapeHtml(e.message)}</td></tr>`;
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
            container.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-xs text-slate-400">No temporary stop change logs found.</td></tr>`;
            return;
        }

        container.innerHTML = logs.map(l => {
            const statusBadge = l.status === "active"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">ACTIVE</span>'
                : l.status === "scheduled"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800">SCHEDULED</span>'
                : l.status === "cancelled"
                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">CANCELLED</span>'
                : `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">${escapeHtml(l.status.toUpperCase())}</span>`;

            const matchDetail = l.is_approximate_match
                ? `<span class="text-indigo-700 font-semibold text-[11px]">~${l.match_distance_m != null ? Math.round(l.match_distance_m) + 'm off route' : 'Approximate'}</span>`
                : '<span class="text-emerald-700 font-semibold text-[11px]">Exact Stop Match</span>';

            return `
                <tr class="border-b border-slate-100 hover:bg-slate-50/50">
                    <td class="px-4 py-3 font-bold text-slate-900">${escapeHtml(l.student_name)} <span class="text-slate-400 font-normal">(${escapeHtml(l.student_roll_number || '—')})</span></td>
                    <td class="px-4 py-3 text-slate-600">${escapeHtml(l.original_stop_name || '—')}</td>
                    <td class="px-4 py-3 font-bold text-indigo-900">${escapeHtml(l.temporary_stop_name || '—')}</td>
                    <td class="px-4 py-3 font-bold text-slate-800">${escapeHtml(l.target_bus_number || 'Bus ' + (l.target_bus_id || '—'))}</td>
                    <td class="px-4 py-3 font-mono text-[11px] text-slate-500">${escapeHtml(l.start_date)} &rarr; ${escapeHtml(l.end_date)}</td>
                    <td class="px-4 py-3">${matchDetail}</td>
                    <td class="px-4 py-3">${statusBadge}</td>
                </tr>
            `;
        }).join("");
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
                attribution: "&copy; OpenStreetMap contributors"
            }).addTo(liveMap);

            const collegeIcon = L.divIcon({
                className: "",
                html: `<div style="background:#E11D48;color:#fff;border-radius:12px;padding:5px 10px;font-size:11px;font-weight:900;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3)">🏫 KITSW College</div>`,
                iconSize: [110, 28]
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
                                <span>🚌 Bus ${escapeHtml(bus.bus_number)}</span>
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
            template: "Bus No. {bus} will start at {time} for {date_range}."
        },
        TEMPLATE_B: {
            title: "Student Bus Change",
            template: "Students of {target} will travel in Bus No. {replacement_bus} today."
        },
        TEMPLATE_C: {
            title: "Bus Service Unavailable",
            template: "Bus No. {bus} will not be available on {date}."
        },
        TEMPLATE_D: {
            title: "Bus Replacement Notice",
            template: "Bus No. {bus} is replaced by Bus No. {replacement_bus} on {date}."
        },
        TEMPLATE_E: {
            title: "Schedule Timing Change",
            template: "Bus No. {bus} will operate at {new_time} instead of {old_time}."
        },
        TEMPLATE_F: {
            title: "Route Modification Notice",
            template: "Route {route} has been modified due to road conditions."
        },
        TEMPLATE_G: {
            title: "Stop Adjustment Notice",
            template: "Students assigned to {old_stop} should use {new_stop} instead."
        },
        TEMPLATE_H: {
            title: "College Holiday — No Bus Service",
            template: "Campus bus services will not operate on {date}."
        }
    };

    async function initAnnouncementComposer() {
        await Promise.all([loadBusesDropdown(), loadRoutesDropdown()]);
        onAnnouncementTargetTypeChanged();
        updateAnnouncementTemplateFields();
        calculateAffectedStudents();
    }

    function onAnnouncementTargetTypeChanged() {
        const targetType = document.getElementById("announcementTargetType")?.value || "all";
        const busCol = document.getElementById("targetBusCol");
        const routeCol = document.getElementById("targetRouteCol");

        if (busCol && routeCol) {
            if (targetType === "bus") {
                busCol.classList.remove("hidden");
                routeCol.classList.add("hidden");
            } else if (targetType === "route") {
                routeCol.classList.remove("hidden");
                busCol.classList.add("hidden");
            } else {
                busCol.classList.add("hidden");
                routeCol.classList.add("hidden");
            }
        }
        calculateAffectedStudents();
        previewAnnouncementText();
    }

    function updateAnnouncementTemplateFields() {
        const select = document.getElementById("announcementTemplateSelect");
        const templateKey = select?.value || "TEMPLATE_A";
        const container = document.getElementById("templateFieldsContainer");
        if (!container) return;

        let fieldsHtml = "";

        switch (templateKey) {
            case "TEMPLATE_A":
                fieldsHtml = `
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Start Time</label>
                            <input type="time" id="annFieldTime" value="08:00" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Duration / Date Range</label>
                            <input type="text" id="annFieldDuration" placeholder="e.g. Morning Shift" value="Morning Trip" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                    </div>
                `;
                break;
            case "TEMPLATE_B":
                fieldsHtml = `
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Replacement Bus Number</label>
                        <input type="text" id="annFieldReplacementBus" placeholder="e.g. 5" value="5" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                    </div>
                `;
                break;
            case "TEMPLATE_C":
            case "TEMPLATE_H":
                fieldsHtml = `
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1">Effective Date</label>
                        <input type="date" id="annFieldDate" value="${new Date().toISOString().split('T')[0]}" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                    </div>
                `;
                break;
            case "TEMPLATE_D":
                fieldsHtml = `
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Replacement Bus</label>
                            <input type="text" id="annFieldReplacementBus" placeholder="e.g. 8" value="8" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Date</label>
                            <input type="date" id="annFieldDate" value="${new Date().toISOString().split('T')[0]}" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                    </div>
                `;
                break;
            case "TEMPLATE_E":
                fieldsHtml = `
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">New Time</label>
                            <input type="time" id="annFieldNewTime" value="08:30" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-700 mb-1">Old Time</label>
                            <input type="time" id="annFieldOldTime" value="08:00" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" oninput="window.KambusAdmin.previewAnnouncementText()">
                        </div>
                    </div>
                `;
                break;
            default:
                fieldsHtml = ``;
                break;
        }

        container.innerHTML = fieldsHtml;
        previewAnnouncementText();
    }

    function previewAnnouncementText() {
        const select = document.getElementById("announcementTemplateSelect");
        const templateKey = select?.value || "TEMPLATE_A";
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
        msg = msg.replace("{replacement_bus}", document.getElementById("annFieldReplacementBus")?.value || "5");
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
        const targetType = document.getElementById("announcementTargetType")?.value || "all";
        let targetId = null;

        if (targetType === "bus") {
            targetId = document.getElementById("announcementTargetBus")?.value || null;
            if (targetId) targetId = parseInt(targetId);
        } else if (targetType === "route") {
            targetId = document.getElementById("announcementTargetRoute")?.value || null;
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

            if (countDisplay) {
                countDisplay.textContent = `🎯 Affected Students: ${count}`;
            }
            if (btn) {
                btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send to ${count} Student${count === 1 ? '' : 's'}`;
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

        if (!title || !message) {
            showToast("error", "Validation", "Title and message are required.");
            return;
        }

        try {
            const res = await apiRequest("/admin/notifications/broadcast", {
                method: "POST",
                body: {
                    template_type: templateKey,
                    title: title,
                    message: message,
                    target_type: targetType,
                    target_id: targetId
                }
            });

            showToast("success", "Announcement Sent", res.message);
            loadAnnouncementHistory();
        } catch (error) {
            showToast("error", "Broadcast Failed", error.message);
        }
    }

    async function loadAnnouncementHistory() {
        const container = document.getElementById("announcementHistoryList");
        if (!container) return;

        try {
            const data = await apiRequest("/admin/notifications/history");
            const list = data.announcements || [];

            if (list.length === 0) {
                container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">No past announcements logged.</div>`;
                return;
            }

            container.innerHTML = list.map(a => `
                <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-black text-slate-900">${escapeHtml(a.title)}</span>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-brand/10 text-brand">${a.recipient_count} recipients</span>
                    </div>
                    <p class="text-xs text-slate-600 mt-1">${escapeHtml(a.message)}</p>
                    <div class="flex items-center justify-between text-[10px] text-slate-400 mt-2">
                        <span>Sent by ${escapeHtml(a.sender_name)}</span>
                        <span>${formatDateTime(a.created_at)}</span>
                    </div>
                </div>
            `).join("");
        } catch (e) {
            console.warn("History load failed:", e);
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
                <div class="p-4 border rounded-2xl ${a.type === 'emergency_sos' ? 'bg-rose-50 border-rose-200' : (a.type === 'detour_alert' ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200')} shadow-sm flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="text-base">${a.type === 'emergency_sos' ? '🚨' : (a.type === 'detour_alert' ? '🚧' : '🔔')}</span>
                            <h4 class="text-xs font-black ${a.type === 'emergency_sos' ? 'text-rose-900' : 'text-slate-900'}">${escapeHtml(a.title)}</h4>
                        </div>
                        <p class="text-xs text-slate-700 mt-1">${escapeHtml(a.message)}</p>
                        <div class="flex items-center gap-3 text-[11px] text-slate-500 mt-2">
                            ${a.bus_number ? `<span>Bus: <strong>${escapeHtml(a.bus_number)}</strong></span>` : ''}
                            ${a.driver_name ? `<span>Driver: <strong>${escapeHtml(a.driver_name)}</strong></span>` : ''}
                            <span>Time: ${formatDateTime(a.created_at)}</span>
                        </div>
                    </div>
                    ${!a.is_read ? `
                        <button onclick="window.KambusAdmin.acknowledgeAlert(${a.id})" class="px-3 py-1.5 bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold shadow-2xs shrink-0">
                            Acknowledge
                        </button>
                    ` : '<span class="text-[11px] font-bold text-slate-400 shrink-0">✓ Acknowledged</span>'}
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
                    data.buses.map(b => `<div onclick="window.KambusAdmin.openBusModal(${b.bus_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900">🚌 Bus ${escapeHtml(b.bus_number)} (${escapeHtml(b.driver_name || 'No driver')}) &rarr;</div>`).join("") + `</div>`;
            }

            if (data.drivers && data.drivers.length > 0) {
                html += `<div class="mb-3"><h5 class="text-[11px] font-black text-slate-400 uppercase">Drivers</h5>` +
                    data.drivers.map(d => `<div onclick="window.KambusAdmin.openDriverModal(${d.driver_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900">👨‍✈️ ${escapeHtml(d.name)} (${escapeHtml(d.driver_code)}) &rarr;</div>`).join("") + `</div>`;
            }

            if (data.students && data.students.length > 0) {
                html += `<div class="mb-3"><h5 class="text-[11px] font-black text-slate-400 uppercase">Students</h5>` +
                    data.students.map(s => `<div onclick="window.KambusAdmin.openAssignStudentModal(${s.student_id}, '${escapeHtml(s.name)}', ${s.bus_id || 'null'}, ${s.stop_id || 'null'})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900">👨‍🎓 ${escapeHtml(s.name)} - ${escapeHtml(s.roll_number)} (${escapeHtml(s.bus_number ? 'Bus ' + s.bus_number : 'No bus')}) &rarr;</div>`).join("") + `</div>`;
            }

            if (data.routes && data.routes.length > 0) {
                html += `<div class="mb-3"><h5 class="text-[11px] font-black text-slate-400 uppercase">Routes</h5>` +
                    data.routes.map(r => `<div onclick="window.KambusAdmin.previewRouteRoadMap(${r.route_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900">🛣️ ${escapeHtml(r.name)} (${r.stops_count} stops) &rarr;</div>`).join("") + `</div>`;
            }

            if (data.stops && data.stops.length > 0) {
                html += `<div class="mb-3"><h5 class="text-[11px] font-black text-slate-400 uppercase">Stops</h5>` +
                    data.stops.map(st => `<div onclick="window.KambusAdmin.showSection('stops')" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900">📍 ${escapeHtml(st.name)} (Route: ${escapeHtml(st.route_name || '-')}) &rarr;</div>`).join("") + `</div>`;
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
                <div class="p-3.5 bg-white border border-slate-200/90 rounded-xl flex items-center justify-between text-xs">
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

                    if (data.type === "emergency_sos") {
                        showToast("error", data.title || "🚨 URGENT EMERGENCY SOS", data.message);
                        loadDashboard();
                        loadAlerts();
                    } else if (data.type === "detour_alert") {
                        showToast("warning", data.title || "⚠️ Route Detour Reported", data.message);
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
    // INITIALIZATION ON DOM READY
    // =========================================================================

    document.addEventListener("DOMContentLoaded", () => {
        if (!checkAuth()) return;

        initAdminWebSocket();
        showSection("dashboard");

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

    window.KambusAdmin = {
        showSection,
        toggleMobileSidebar,
        closeMobileSidebar,
        loadBusesDropdown,
        loadDriversDropdown,
        loadRoutesDropdown,
        loadStopsDropdown,
        openAddBusModal,
        openBusModal,
        submitUpdateBusGeneralProps,
        deleteBus,
        submitAddBus,
        openAddDriverModal: () => document.getElementById("addDriverModal")?.classList.remove("hidden"),
        openDriverModal,
        openEditDriverModal,
        deleteDriver,
        submitAddDriver,
        submitEditDriver,
        loadStudents,
        openAddStudentModal,
        openAssignStudentModal,
        submitAssignStudent,
        deleteStudent,
        submitAddStudent,
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
        submitAddRoute,
        deleteRoute,
        reorderRouteStop,
        previewRouteRoadMap,
        onAnnouncementTargetTypeChanged,
        updateAnnouncementTemplateFields,
        previewAnnouncementText,
        calculateAffectedStudents,
        submitBroadcastAnnouncement,
        acknowledgeAlert,
        executeGlobalSearch
    };

})();
