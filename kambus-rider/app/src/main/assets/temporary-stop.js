/**
 * KAMBUS - Shared Temporary Stop & Travel Status Module
 * Reusable by both Student App and Parent Portal
 */

(function (window) {
    "use strict";

    function getApiBase() {
        if (typeof window.API_BASE !== "undefined" && window.API_BASE) {
            return window.API_BASE;
        }
        return window.location.origin.includes(":8000")
            ? window.location.origin
            : (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
                ? `http://${window.location.hostname}:8000`
                : window.location.origin);
    }

    function getAuthToken() {
        if (typeof window.getToken === "function") return window.getToken();
        return localStorage.getItem("kambus_token") || localStorage.getItem("token") || sessionStorage.getItem("token") || "";
    }

    function featureNotify(type, title, message) {
        if (typeof window.KambusNotify !== "undefined") {
            window.KambusNotify.notify({
                type: type === "error" ? "danger" : (type === "warning" ? "warn" : type),
                title: title,
                message: message
            });
        } else {
            console.log(`[${type}] ${title}: ${message}`);
        }
    }

    function formatDateForInput(date) {
        const d = new Date(date);
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${month}-${day}`;
    }

    function escapeTemporaryStopText(value) {
        const element = document.createElement("span");
        element.textContent = value == null ? "" : String(value);
        return element.innerHTML;
    }

    const COLLEGE_LOCATION = window.COLLEGE_LOCATION || { latitude: 18.054145359568437, longitude: 79.53558712768555, name: "College Campus" };
    window.COLLEGE_LOCATION = COLLEGE_LOCATION;

    // Module State
    let currentTemporaryContext = null;
    let tempStopPickerMap = null;
    let pickupMarker = null;
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
    let studentFeatureSubmitting = false;

    let routeStops = [];
    let routeStopsBusId = null;
    let temporaryStopChange = null;

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
        if (temporaryRouteView === "my" || temporaryRouteView === "all") {
            return temporaryMyBusStops || routeStops || window.routeStops || [];
        }
        const bus = temporaryAllBusRoutes?.find(b => Number(b.bus_id) === Number(temporaryRouteView));
        return bus?.map_stops || bus?.stops || [];
    }

    function getTemporaryStopPickerRouteStops(stops = routeStops) {
        const sourceStops = stops || [];
        return [...sourceStops].filter(stop => !stop.directions || stop.directions.includes(temporaryStopDirection))
            .sort((a, b) => Number(a.stop_order || 0) - Number(b.stop_order || 0))
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
        const currentBusId = routeStopsBusId || window.routeStopsBusId;
        const selectedBusId = temporaryRouteView === "my" || temporaryRouteView === "all" ? currentBusId : Number(temporaryRouteView);
        const path = temporaryRenderedPaths.find(p => Number(p.busId) === Number(selectedBusId));
        if (!path || path.travelPoints.length < 2) return;
        const points = path.travelPoints;
        const segment = 0;
        const heading = temporarySegmentBearing(points[segment], points[segment + 1]);
        if (temporaryHeadingUp && typeof tempStopPickerMap.setBearing === "function") {
            tempStopPickerMap.setBearing(-heading);
            tempStopPickerMap.panTo(points[segment], { animate: false });
        }
    }

    function setTemporaryMapHeading(enabled) {
        temporaryHeadingUp = enabled;
        if (enabled) updateTemporaryMapHeading();
        else if (tempStopPickerMap && typeof tempStopPickerMap.setBearing === "function") {
            tempStopPickerMap.setBearing(0);
        }
    }

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
        }
    }

    async function loadRouteStops(targetStudentId = null) {
        const token = getAuthToken();
        if (!token) return;
        try {
            const studentQuery = targetStudentId ? `?student_id=${targetStudentId}` : "";
            const response = await fetch(`${getApiBase()}/student/my-route-stops${studentQuery}`, {
                headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
            });
            if (!response.ok) return;
            const data = await response.json();
            routeStops = data.stops || [];
            routeStopsBusId = data.bus_id || null;
            if (!currentTemporaryContext) {
                window.routeStops = routeStops;
                window.routeStopsBusId = routeStopsBusId;
            }
        } catch (e) {
            console.warn("Failed to load route stops:", e);
        }
    }

    async function loadTemporaryStopExplorerRoutes(targetStudentId = null) {
        const token = getAuthToken();
        if (!token) return [];
        try {
            const studentQuery = targetStudentId ? `?student_id=${targetStudentId}` : "";
            const response = await fetch(`${getApiBase()}/student/all-bus-routes${studentQuery}`, {
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
        const currentBusId = routeStopsBusId || window.routeStopsBusId;
        const selectedBusId = specificBus ? Number(temporaryRouteView) : currentBusId;
        const selectedBus = !specificBus
            ? { bus_id: currentBusId, stops: temporaryMyBusStops || routeStops || window.routeStops || [] }
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
            const markerColor = stop.affected_directions?.includes(temporaryStopDirection) ? "#f97316" : "#2563eb";
            const marker = L.circleMarker([Number(stop.latitude), Number(stop.longitude)], {
                radius: 7, color: markerColor, fillColor: markerColor, fillOpacity: 0.8, weight: 2
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
        const busName = selectedBus?.bus_number || currentTemporaryContext?.busNumber || (window.regularStudentAssignment?.bus_number) || (window.studentAssignment?.bus_number) || "Your bus";
        const sortedStops = getTemporaryStopPickerRouteStops(temporarySelectedBusStops());
        routeBox.textContent = `${busName} normal route: ${sortedStops.map(stop => stop.name).join(" → ") || "No stops configured"}`;
        select.innerHTML = `<option value="">Select a registered stop</option>${sortedStops.map(stop =>
            `<option value="${Number(stop.stop_id)}">${escapeTemporaryStopText(stop.stop_order)}. ${escapeTemporaryStopText(stop.name)}</option>`
        ).join("")}`;
        select.value = temporaryStopDrafts[temporaryStopDirection].stopId || "";
    }

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
        const token = getAuthToken();
        const input = getTemporaryStopRequestInput();
        if (!token) return featureNotify("warning", "Session expired", "Please login again.");
        if (!input) return featureNotify("warning", "Choose a stop", "Select a registered stop or provide valid map coordinates.");

        saveTemporaryStopDraft();
        const direction = temporaryStopDirection;
        const draft = temporaryStopDrafts[direction];
        resetTemporaryStopRouteCheck();
        try {
            const payload = {
                ...input,
                trip_type: direction,
                ...(currentTemporaryContext?.studentId ? { student_id: currentTemporaryContext.studentId } : {})
            };
            const response = await fetch(`${getApiBase()}/student/temporary-stop-change/check-route`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(payload)
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

    function initTempStopPickerMap() {
        const container = document.getElementById("tempStopPickerMap");
        if (!container) return;

        const effectiveAssignedStop = currentTemporaryContext?.assignedStop || window.assignedStop;
        let centre = [18.054145, 79.535587];
        if (effectiveAssignedStop?.latitude && effectiveAssignedStop?.longitude) {
            centre = [effectiveAssignedStop.latitude, effectiveAssignedStop.longitude];
        } else if (routeStops?.length > 0 && routeStops[0].latitude) {
            centre = [routeStops[0].latitude, routeStops[0].longitude];
        }

        if (tempStopPickerMap) {
            tempStopPickerMap.invalidateSize({ animate: false, pan: false });
            renderTemporaryRouteExplorer();
            return;
        }

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
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19
            }).addTo(tempStopPickerMap);

            tempStopPickerExplorerRoutes = L.layerGroup().addTo(tempStopPickerMap);
            temporaryArrowLayer = L.layerGroup().addTo(tempStopPickerMap);
            tempStopPickerMap.on("zoomend", renderTemporaryRouteArrows);

            renderTemporaryRouteExplorer();

            tempStopPickerMap.on("click", (e) => {
                if (temporaryStopInputMode === "pin") placeTempStopMarker(e.latlng.lat, e.latlng.lng);
            });

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
            const stop = getTemporaryStopPickerRouteStops(temporarySelectedBusStops()).find(s => Number(s.stop_id) === id);
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

    async function loadTemporaryStopChange(targetStudentId = null) {
        if (typeof window.hasEntitlement === "function" && !window.hasEntitlement("temporary_stop_change")) {
            temporaryStopChange = null;
            renderTemporaryStopStatus();
            return null;
        }
        const token = getAuthToken();
        if (!token) return null;
        const effectiveStudentId = targetStudentId || currentTemporaryContext?.studentId || null;
        try {
            const studentQuery = effectiveStudentId ? `?student_id=${effectiveStudentId}` : "";
            const response = await fetch(`${getApiBase()}/student/temporary-stop-change${studentQuery}`, {
                method: "GET",
                headers: { "Accept": "application/json", "Authorization": `Bearer ${token}` }
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                temporaryStopChange = null;
                renderTemporaryStopStatus();
                return null;
            }

            temporaryStopChange = data.active || data.scheduled || data.pending_approval ? data : null;
            window.temporaryStopChange = temporaryStopChange;
            renderTemporaryStopStatus();
            return temporaryStopChange;
        } catch (error) {
            console.warn("[WARN] Failed to load temporary stop change:", error);
            temporaryStopChange = null;
            window.temporaryStopChange = null;
            renderTemporaryStopStatus();
            return null;
        }
    }

    function ensureTemporaryStopModalInDOM() {
        if (document.getElementById("temporaryStopModal")) return;
        const modalDiv = document.createElement("div");
        modalDiv.id = "temporaryStopModal";
        modalDiv.className = "kambus-modal-backdrop hidden";
        modalDiv.innerHTML = `
        <div class="kx-sheet kx-sheet--sky kx-sheet--wide">
            <div class="kx-head">
                <div class="kx-head-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
                <div class="kx-head-text">
                    <h3 class="kx-title" id="temporaryStopModalTitle">Change pickup stop</h3>
                    <p class="kx-sub" id="temporaryStopModalSub">Use a different stop for a few days</p>
                </div>
                <button type="button" onclick="window.closeTemporaryStopModal()" class="kx-close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>

            <div class="kx-body">
                <div id="temporaryStopStatus" class="hidden"></div>
                <div id="temporaryCurrentRoute" class="kx-route">Loading normal route...</div>

                <div class="kx-map">
                    <div id="tempStopPickerMap"></div>
                </div>
                <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px" aria-label="Map legend">
                    <span><b style="color:#2563eb">●</b> Normal stop</span>
                    <span><b style="color:#f97316">●</b> Temp/replacement stop</span>
                    <span><b style="color:#16a34a">●</b> Pickup</span>
                    <button type="button" onclick="window.setTemporaryMapHeading(false)">Reset north</button>
                    <button type="button" onclick="window.setTemporaryMapHeading(true)">Follow heading</button>
                </div>
                <p id="temporaryRouteMapStatus" role="status" class="text-xs text-slate-600"></p>

                <div>
                    <label for="temporaryRouteView" class="kx-label">Explore bus routes</label>
                    <select id="temporaryRouteView" onchange="window.setTemporaryRouteView(this.value)" class="kx-input">
                        <option value="my">My bus</option>
                    </select>
                </div>

                <div class="kx-seg" aria-label="Temporary stop direction">
                    <button id="temporaryMorningDirectionBtn" type="button" onclick="window.setTemporaryStopDirection('morning')" class="kx-seg-btn is-active">Morning pickup</button>
                    <button id="temporaryEveningDirectionBtn" type="button" onclick="window.setTemporaryStopDirection('evening')" class="kx-seg-btn">Evening drop-off</button>
                </div>
                <div class="kx-direction-summary">
                    <div><strong>Morning pickup</strong><span id="temporaryMorningSummary">Not selected</span></div>
                    <div><strong>Evening drop-off</strong><span id="temporaryEveningSummary">Not selected</span></div>
                </div>
                <p class="text-xs text-slate-600">Choose morning only, evening only, or both. Check each selected location before submitting.</p>
                <button type="button" onclick="window.clearTemporaryStopDirection()" class="kx-btn kx-btn--soft kx-btn--sm">Clear this direction</button>

                <div class="kx-seg">
                    <button id="temporaryRegisteredModeBtn" type="button" onclick="window.setTemporaryStopInputMode('registered')" class="kx-seg-btn">Registered stop</button>
                    <button id="temporaryPinModeBtn" type="button" onclick="window.setTemporaryStopInputMode('pin')" class="kx-seg-btn is-active">Map pin</button>
                </div>

                <div id="temporaryRegisteredStopFields" class="hidden kx-stack">
                    <div>
                        <label for="temporaryRegisteredStop" class="kx-label">Choose stop</label>
                        <select id="temporaryRegisteredStop" class="kx-input"></select>
                    </div>
                    <button type="button" onclick="window.checkTemporaryStopRoute()" class="kx-btn kx-btn--soft kx-btn--sm">Check this stop</button>
                </div>

                <details id="manualCoordinatesDetails" class="kx-details">
                    <summary>Manual coordinates (optional)</summary>
                    <div id="temporaryPinCoordinates" class="kx-coords">
                        <input id="temporaryPinLatitude" type="number" step="any" placeholder="Latitude" class="kx-input">
                        <input id="temporaryPinLongitude" type="number" step="any" placeholder="Longitude" class="kx-input">
                    </div>
                </details>
                <button id="checkTemporaryPinBtn" type="button" onclick="window.checkTemporaryStopRoute()" class="kx-btn kx-btn--soft kx-btn--sm">Step 1: Check Location</button>

                <div id="temporaryRouteCheckResult" class="hidden"></div>
                <div id="temporaryCandidateBuses" class="kx-stack"></div>

                <div id="tempStopPickerLabel" class="kx-pickup">
                    <div class="kx-pickup-label">Selected pickup point</div>
                    <div id="tempStopPickerAddress" class="kx-pickup-address">Tap map to pick location...</div>
                </div>

                <div class="kx-dates">
                    <div>
                        <label for="temporaryStartDate" class="kx-label">Start date</label>
                        <input id="temporaryStartDate" type="date" class="kx-input">
                    </div>
                    <div>
                        <label for="temporaryEndDate" class="kx-label">End date</label>
                        <input id="temporaryEndDate" type="date" class="kx-input">
                    </div>
                </div>
            </div>

            <div class="kx-foot">
                <button id="confirmTemporaryStopBtn" type="button" onclick="window.submitTemporaryStopChange()" disabled class="kx-btn kx-btn--primary opacity-50 cursor-not-allowed">
                    Step 2: Confirm
                </button>
                <button id="cancelTemporaryStopBtn" type="button" onclick="window.cancelTemporaryStopChange()" class="kx-btn kx-btn--ghost">
                    Remove
                </button>
            </div>
        </div>
        `;
        document.body.appendChild(modalDiv);

        document.getElementById("temporaryRegisteredStop")?.addEventListener("change", () => {
            selectTemporaryPickup();
            saveTemporaryStopDraft();
            resetTemporaryStopRouteCheck();
            renderTemporaryDirectionSummary();
            updateTemporaryStopSubmitState();
        });
        document.getElementById("temporaryPinLatitude")?.addEventListener("input", () => {
            resetTemporaryStopRouteCheck();
            selectTemporaryPickup();
        });
        document.getElementById("temporaryPinLongitude")?.addEventListener("input", () => {
            resetTemporaryStopRouteCheck();
            selectTemporaryPickup();
        });
    }

    async function openTemporaryStopModal(targetContext = null) {
        if (typeof window.hasEntitlement === "function" && !window.hasEntitlement("temporary_stop_change")) {
            if (typeof window.showPlanUpgradePrompt === "function") {
                window.showPlanUpgradePrompt("Temporary Stop Change", "Top", "Allow students to temporarily use an alternate stop along the bus route.");
            }
            return;
        }
        ensureTemporaryStopModalInDOM();
        const modal = document.getElementById("temporaryStopModal");
        if (!modal) return;

        currentTemporaryContext = targetContext;

        let effectiveAssignedStop = targetContext?.assignedStop || window.assignedStop;
        if (!effectiveAssignedStop) {
            try {
                const token = getAuthToken();
                const studentQuery = targetContext?.studentId ? `?student_id=${targetContext.studentId}` : "";
                const stopRes = await fetch(`${getApiBase()}/student/my-stop${studentQuery}`, {
                    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" }
                });
                if (stopRes.ok) {
                    const stopData = await stopRes.json();
                    if (stopData?.stop_id) {
                        effectiveAssignedStop = {
                            stop_id: stopData.stop_id,
                            name: stopData.stop_name,
                            latitude: Number(stopData.latitude),
                            longitude: Number(stopData.longitude)
                        };
                        if (!targetContext) window.assignedStop = effectiveAssignedStop;
                    }
                }
            } catch (e) {
                console.warn("Unable to fetch stop in temporary modal", e);
            }
        }
        if (!effectiveAssignedStop) {
            featureNotify("warning", "Stop unavailable", targetContext ? `${targetContext.studentName || 'Student'} has no stop assigned yet.` : "Your current stop has not loaded yet.");
            return;
        }

        const titleEl = document.getElementById("temporaryStopModalTitle");
        const subEl = document.getElementById("temporaryStopModalSub");
        if (titleEl) titleEl.textContent = "Change pickup stop";
        if (subEl) {
            subEl.textContent = targetContext?.studentName
                ? `For ${targetContext.studentName} · Use a different stop for a few days`
                : "Use a different stop for a few days";
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

        await loadTemporaryStopChange(targetContext?.studentId);
        modal.classList.remove("hidden");

        await Promise.all([
            loadRouteStops(targetContext?.studentId),
            loadTemporaryStopExplorerRoutes(targetContext?.studentId)
        ]);

        renderTemporaryCurrentRoute();
        setTemporaryStopInputMode(temporaryStopInputMode, false);
        renderTemporaryDirectionSummary();
        updateTemporaryStopSubmitState();

        initTempStopPickerMap();
    }

    function closeTemporaryStopModal() {
        document.getElementById("temporaryStopModal")?.classList.add("hidden");
        currentTemporaryContext = null;
    }

    async function submitTemporaryStopChange() {
        if (studentFeatureSubmitting) return;

        const token = getAuthToken();
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
            const payload = {
                ...(morningInput ? { morning_location: morningInput } : {}),
                ...(eveningInput ? { evening_location: eveningInput } : {}),
                ...(uniqueCandidateBusIds.length ? { target_bus_id: uniqueCandidateBusIds[0] } : {}),
                start_date: startDate,
                end_date: endDate,
                ...(currentTemporaryContext?.studentId ? { student_id: currentTemporaryContext.studentId } : {})
            };

            const response = await fetch(`${getApiBase()}/student/temporary-stop-change`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.detail || "Unable to schedule the temporary stop.");

            temporaryStopChange = {
                ...data,
                active: data.status === "active",
                scheduled: data.status === "scheduled",
                pending_approval: data.status === "pending_admin_approval"
            };
            window.temporaryStopChange = temporaryStopChange;
            renderTemporaryStopStatus();

            tempStopPickerLat = null;
            tempStopPickerLng = null;
            tempStopPickerAddress = null;
            ["morning", "evening"].forEach(direction => {
                temporaryStopDrafts[direction] = { mode: "pin", latitude: null, longitude: null, address: null, stopId: null, routeCheck: null, candidateBusId: null };
            });

            const ctx = currentTemporaryContext;
            closeTemporaryStopModal();

            featureNotify(
                "ok",
                data.status === "pending_admin_approval" ? "Requires Admin Confirmation" : (data.status === "active" ? "Temporary stop active" : "Temporary stop scheduled"),
                data.status === "pending_admin_approval" ? "Your selected bus and stop are waiting for admin approval." : `${data.temporary_stop_name || "Temporary stop"} is set for ${data.start_date} → ${data.end_date}.`
            );

            if (ctx?.onSuccess) {
                await ctx.onSuccess();
            } else {
                if (typeof window.loadMyStop === "function") await window.loadMyStop(true);
                if (typeof window.loadTemporaryStopChange === "function") await window.loadTemporaryStopChange();
                if (typeof window.loadStudentBus === "function") await window.loadStudentBus();
            }
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

    async function cancelTemporaryStopChange() {
        if (studentFeatureSubmitting) return;
        if (!temporaryStopChange?.active && !temporaryStopChange?.scheduled && !temporaryStopChange?.pending_approval) return;

        const approved = typeof window.KambusNotify !== "undefined"
            ? await window.KambusNotify.confirm({
                title: "Cancel temporary stop?",
                message: "Your original stop will become effective again.",
                confirmText: "Cancel Change",
                cancelText: "Keep It"
            })
            : confirm("Cancel this temporary stop change?");

        if (!approved) return;

        const token = getAuthToken();
        if (!token) {
            featureNotify("warning", "Session expired", "Please login again.");
            return;
        }

        studentFeatureSubmitting = true;

        try {
            let revertedStopCheck = null;
            if (temporaryStopChange.active) {
                const checkPayload = {
                    stop_id: temporaryStopChange.original_stop_id,
                    ...(currentTemporaryContext?.studentId ? { student_id: currentTemporaryContext.studentId } : {})
                };
                const checkResponse = await fetch(`${getApiBase()}/student/temporary-stop-change/check-route`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify(checkPayload)
                });
                revertedStopCheck = await checkResponse.json().catch(() => ({}));
            }

            const studentQuery = currentTemporaryContext?.studentId ? `?student_id=${currentTemporaryContext.studentId}` : "";
            const response = await fetch(`${getApiBase()}/student/temporary-stop-change${studentQuery}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.detail || "Unable to cancel the temporary stop.");

            temporaryStopChange = null;
            temporaryRouteSelection = null;
            window.temporaryStopChange = null;
            renderTemporaryStopStatus();

            const ctx = currentTemporaryContext;
            closeTemporaryStopModal();

            if (ctx?.onSuccess) {
                await ctx.onSuccess();
            } else {
                if (typeof window.clearStudentAssignmentTracking === "function") window.clearStudentAssignmentTracking();
                if (typeof window.loadStudentBus === "function") await window.loadStudentBus();
            }

            if (revertedStopCheck && !revertedStopCheck.on_route &&
                !(revertedStopCheck.candidate_buses || []).some(candidate => candidate.is_own_bus)) {
                featureNotify("warning", "Temporary stop cancelled", "This bus does not travel through this stop. Your temporary bus allotment has been cleared.");
            } else {
                featureNotify("ok", "Temporary stop cancelled", "Your original stop is active again.");
            }
        } catch (error) {
            console.error("[ERROR] Temporary stop cancellation failed:", error);
            featureNotify("error", "Unable to cancel", error.message || "Please try again.");
        } finally {
            studentFeatureSubmitting = false;
        }
    }

    // Shared Not Travelling Action
    async function markStudentNotTravelling(options = {}) {
        const studentId = options.studentId || null;
        const studentName = options.studentName || null;
        const onSuccess = options.onSuccess || null;
        const token = getAuthToken();
        if (!token) {
            featureNotify("warning", "Session expired", "Please login again.");
            return;
        }

        const message = studentName
            ? `We will notify the driver that ${studentName} will not be boarding the bus today.`
            : "We will notify the driver that you will not be boarding the bus today.";

        const approved = typeof window.KambusNotify !== "undefined"
            ? await window.KambusNotify.confirm({
                title: "Mark Not Travelling?",
                message: message,
                confirmText: "Confirm",
                cancelText: "Cancel",
                danger: true
            })
            : confirm(message);

        if (!approved) return;

        try {
            const payload = { status: "not_travelling" };
            if (studentId) payload.student_id = studentId;

            const response = await fetch(`${getApiBase()}/student/travel-status`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.detail || "Unable to update travel status");

            featureNotify(
                "ok",
                "Status updated",
                studentName ? `Marked ${studentName} as not travelling today.` : "Marked as not travelling today."
            );

            if (typeof onSuccess === "function") {
                await onSuccess(data);
            }
            return data;
        } catch (error) {
            featureNotify("error", "Update failed", error.message || "Unable to connect.");
            throw error;
        }
    }

    // Expose all globals on window for DOM event handlers
    window.openTemporaryStopModal = openTemporaryStopModal;
    window.closeTemporaryStopModal = closeTemporaryStopModal;
    window.loadTemporaryStopChange = loadTemporaryStopChange;
    window.submitTemporaryStopChange = submitTemporaryStopChange;
    window.cancelTemporaryStopChange = cancelTemporaryStopChange;
    window.checkTemporaryStopRoute = checkTemporaryStopRoute;
    window.setTemporaryStopDirection = setTemporaryStopDirection;
    window.clearTemporaryStopDirection = clearTemporaryStopDirection;
    window.setTemporaryStopInputMode = setTemporaryStopInputMode;
    window.setTemporaryRouteView = setTemporaryRouteView;
    window.setTemporaryMapHeading = setTemporaryMapHeading;
    window.initTempStopPickerMap = initTempStopPickerMap;
    window.selectTemporaryPickup = selectTemporaryPickup;
    window.markStudentNotTravelling = markStudentNotTravelling;
    window.ensureTemporaryStopModalInDOM = ensureTemporaryStopModalInDOM;

})(window);
