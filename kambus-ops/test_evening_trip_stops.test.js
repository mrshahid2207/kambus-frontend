const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

describe('Driver Live-Trip Stop Progression & Directional Order', () => {
    function createDriverEnvironment() {
        const mockWindow = {
            fetch: async () => ({ ok: true, json: async () => ({}) }),
            location: { replace() {} },
            addEventListener() {},
            __driverRouteStopsLoadedFromLogin: false
        };
        const elements = {};
        const mockDocument = {
            getElementById: (id) => {
                if (!elements[id]) {
                    const classSet = new Set();
                    let _text = '';
                    let _html = '';
                    elements[id] = {
                        get textContent() { return _text; },
                        set textContent(v) { _text = String(v); _html = String(v); },
                        get innerHTML() { return _html; },
                        set innerHTML(v) { _html = String(v); _text = String(v).replace(/<[^>]*>/g, ''); },
                        style: {},
                        classList: {
                            add(...classes) { classes.forEach(c => classSet.add(c)); },
                            remove(...classes) { classes.forEach(c => classSet.delete(c)); },
                            toggle(c) { if (classSet.has(c)) classSet.delete(c); else classSet.add(c); },
                            contains(c) { return classSet.has(c); }
                        }
                    };
                }
                return elements[id];
            },
            addEventListener: () => {},
            documentElement: { style: { setProperty() {} }, classList: { add() {} } }
        };
        const mockLocalStorage = {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
        };

        const addedMarkers = [];
        const mockLeaflet = {
            map: () => ({
                setView() { return this; },
                fitBounds() { return this; },
                on() { return this; }
            }),
            latLngBounds: () => ({}),
            tileLayer: () => ({ addTo() { return this; } }),
            geoJSON: () => ({ addTo() { return this; }, clearLayers() { return this; } }),
            layerGroup: () => ({
                addTo() { return this; },
                clearLayers() { addedMarkers.length = 0; return this; },
                addLayer(m) { addedMarkers.push(m); return this; },
                eachLayer(cb) { addedMarkers.forEach(cb); }
            }),
            divIcon: (opts) => opts,
            marker: (latlng, opts) => {
                const markerObj = {
                    latlng,
                    opts,
                    icon: opts?.icon || null,
                    stopData: null,
                    popupContent: '',
                    bindPopup(html) { this.popupContent = html; return this; },
                    setIcon(icon) { this.icon = icon; return this; },
                    setZIndexOffset(z) { this.zIndexOffset = z; return this; },
                    setLatLng(ll) { this.latlng = ll; return this; }
                };
                return markerObj;
            }
        };

        const driverJsPath = path.join(__dirname, 'app/src/main/assets/driver.js');
        const driverJsContent = fs.readFileSync(driverJsPath, 'utf8');
        const harness = `
;module.exports = {
    ...module.exports,
    applyRouteStopsPayload,
    updateNextStopAndEta,
    renderMapMarkers,
    initOrUpdateRouteMap,
    createStopMarkerIcon,
    updatePreTripOverview,
    renderRouteStopList,
    getDriverRouteStops: () => driverRouteStops,
    setDriverRouteStops: (v) => { driverRouteStops = v; },
    getActiveTripType: () => activeTripType,
    setActiveTripType: (v) => { activeTripType = v; },
    setIsTripActive: (v) => { isTripActive = v; },
    getPassedStopIds: () => passedStopIds
};
`;

        const context = vm.createContext({
            window: mockWindow,
            document: mockDocument,
            localStorage: mockLocalStorage,
            navigator: { geolocation: {} },
            console,
            module: { exports: {} },
            exports: {},
            L: mockLeaflet,
            VoiceAnnouncer: { checkProximityAnnouncement: () => {} },
            setTimeout: (fn) => setTimeout(fn, 0),
            clearTimeout: () => {},
            setInterval: () => 1,
            clearInterval: () => {},
            Date,
            Math,
            Number,
            Array,
            Set,
            String,
            Boolean,
            RegExp
        });

        vm.runInContext(driverJsContent + harness, context);
        return { driver: context.module.exports, elements, addedMarkers };
    }

    const testPayload = {
        stops: [
            { stop_id: 1, name: "Morning Stop 1 (City)", stop_order: 1, latitude: 12.91, longitude: 77.61, evening_latitude: 12.915, evening_longitude: 77.615, student_count: 4 },
            { stop_id: 2, name: "Morning Stop 2 (Crossroads)", stop_order: 2, latitude: 12.92, longitude: 77.62, evening_latitude: 12.925, evening_longitude: 77.625, student_count: 2 },
            { stop_id: 3, name: "Morning Stop 3 (Campus Gate)", stop_order: 3, latitude: 12.93, longitude: 77.63, evening_latitude: 12.935, evening_longitude: 77.635, student_count: 6 }
        ]
    };

    test('Morning trip orders stops 1 -> 3, uses morning coordinates, and College is Final Destination', () => {
        const { driver, addedMarkers } = createDriverEnvironment();
        driver.setActiveTripType('morning');
        driver.setIsTripActive(true);
        driver.initOrUpdateRouteMap();

        const ok = driver.applyRouteStopsPayload(testPayload, 'morning');
        assert.equal(ok, true);

        const stops = driver.getDriverRouteStops();
        assert.equal(stops.length, 3);
        assert.equal(stops[0].stop_id, 1, 'First morning stop should be Morning Stop 1');
        assert.equal(stops[0].latitude, 12.91, 'Morning latitude should be used');
        assert.equal(stops[2].stop_id, 3, 'Last morning stop should be Morning Stop 3');

        // Test renderMapMarkers
        driver.renderMapMarkers();
        // 3 stops + 1 college marker
        assert.equal(addedMarkers.length, 4);
        const collegeMarker = addedMarkers[addedMarkers.length - 1];
        assert.match(collegeMarker.popupContent, /Final Destination/);
    });

    test('Evening trip reverses stop order 3 -> 1, uses evening coordinates, and badges final stop', () => {
        const { driver, addedMarkers } = createDriverEnvironment();
        driver.setActiveTripType('evening');
        driver.setIsTripActive(true);
        driver.initOrUpdateRouteMap();

        const ok = driver.applyRouteStopsPayload(testPayload, 'evening');
        assert.equal(ok, true);

        const stops = driver.getDriverRouteStops();
        assert.equal(stops.length, 3);
        assert.equal(stops[0].stop_id, 3, 'First evening stop should be Stop 3 (Campus Gate)');
        assert.equal(stops[0].latitude, 12.935, 'Evening latitude should be used for Stop 3');
        assert.equal(stops[0].longitude, 77.635, 'Evening longitude should be used for Stop 3');
        assert.equal(stops[2].stop_id, 1, 'Last evening stop should be Stop 1 (City)');
        assert.equal(stops[2].latitude, 12.915, 'Evening latitude should be used for Stop 1');

        // Test renderMapMarkers
        driver.renderMapMarkers();
        assert.equal(addedMarkers.length, 4);

        // First stop marker
        const firstMarker = addedMarkers[0];
        assert.equal(firstMarker.latlng[0], 12.935);
        assert.match(firstMarker.popupContent, /Stop 1/);
        assert.doesNotMatch(firstMarker.popupContent, /Final Stop/);

        // Last stop marker
        const lastStopMarker = addedMarkers[2];
        assert.equal(lastStopMarker.latlng[0], 12.915);
        assert.match(lastStopMarker.popupContent, /Stop 3 \(Final Stop\)/);

        // College marker
        const collegeMarker = addedMarkers[3];
        assert.match(collegeMarker.popupContent, /Trip Starting Point/);
    });

    test('updateNextStopAndEta displays (Final Stop) on last evening stop and Trip Complete when finished', () => {
        const { driver, elements } = createDriverEnvironment();
        driver.setActiveTripType('evening');
        driver.setIsTripActive(true);
        driver.applyRouteStopsPayload(testPayload, 'evening');

        // Simulate driver near last stop (Stop 1 in evening sequence)
        const passedSet = driver.getPassedStopIds();
        passedSet.add(3);
        passedSet.add(2);

        driver.updateNextStopAndEta({ latitude: 12.916, longitude: 77.616 });

        assert.equal(elements['nextStopOrderBadge'].textContent, 'Stop 3 of 3 (Final Stop)');
        assert.equal(elements['nextStopName'].textContent, 'Morning Stop 1 (City)');

        // Simulate passing all stops in evening
        passedSet.add(1);
        driver.updateNextStopAndEta({ latitude: 12.915, longitude: 77.615 });

        assert.equal(elements['nextStopOrderBadge'].textContent, 'Trip Complete');
        assert.equal(elements['nextStopName'].textContent, 'All stops completed');
    });

    test('createStopMarkerIcon differentiates temporary stops with amber theme and TEMP badge', () => {
        const { driver } = createDriverEnvironment();

        // 1. Regular upcoming stop
        const regularIcon = driver.createStopMarkerIcon(1, false, false, false);
        assert.match(regularIcon.html, /#ffffff/);
        assert.doesNotMatch(regularIcon.html, /TEMP/);

        // 2. Custom upcoming stop
        const customUpcoming = driver.createStopMarkerIcon(1, false, false, true);
        assert.match(customUpcoming.html, /#FBF1DC/); // warm amber background
        assert.match(customUpcoming.html, /#8A5F0A/); // warn text
        assert.match(customUpcoming.html, /TEMP/);

        // 3. Custom next stop
        const customNext = driver.createStopMarkerIcon(2, false, true, true);
        assert.match(customNext.html, /#E8B04A/); // warn hero background
        assert.match(customNext.html, /#173541/); // navy text
        assert.match(customNext.html, /TEMP/);

        // 4. Custom passed stop
        const customPassed = driver.createStopMarkerIcon(3, true, false, true);
        assert.match(customPassed.html, /#B59B7C/); // muted amber
        assert.match(customPassed.html, /TEMP/);
    });

    test('Temporary/custom stop displays distinct visual badge in stop list, Next Stop card, map popup, and pre-trip overview', () => {
        const { driver, elements, addedMarkers } = createDriverEnvironment();
        driver.setActiveTripType('morning');
        driver.setIsTripActive(true);
        driver.initOrUpdateRouteMap();

        const customPayload = {
            stops: [
                { stop_id: 101, name: "Normal Stop 1", stop_order: 1, latitude: 12.91, longitude: 77.61, is_custom: false },
                { stop_id: 102, name: "Temporary Stop 2 (Special Pickup)", stop_order: 2, latitude: 12.92, longitude: 77.62, is_custom: true },
                { stop_id: 103, name: "Normal Stop 3", stop_order: 3, latitude: 12.93, longitude: 77.63, is_custom: false }
            ]
        };

        driver.applyRouteStopsPayload(customPayload, 'morning');

        // Check map markers popup content for Temp Stop badge
        driver.renderMapMarkers();
        assert.equal(addedMarkers.length, 4); // 3 stops + 1 college marker
        const normalMarker = addedMarkers[0];
        const tempMarker = addedMarkers[1];
        assert.doesNotMatch(normalMarker.popupContent, /Temp Stop/);
        assert.match(tempMarker.popupContent, /Temp Stop/);
        assert.match(tempMarker.icon.html, /TEMP/);

        // Simulate driver approaching Stop 2 (the custom stop)
        const passedSet = driver.getPassedStopIds();
        passedSet.add(101);

        driver.updateNextStopAndEta({ latitude: 12.919, longitude: 77.619 });

        // Next stop card badge should show Temp styling and badge
        assert.match(elements['nextStopOrderBadge'].innerHTML, /Temp/);
        assert.equal(elements['nextStopOrderBadge'].classList.contains('text-warn'), true);
        assert.equal(elements['nextStopOrderBadge'].classList.contains('bg-warn/10'), true);
        assert.match(elements['progressNextText'].textContent, /\(Temp\)/);

        // Test pre-trip overview when first stop is custom
        const firstCustomPayload = {
            stops: [
                { stop_id: 201, name: "Temporary Stop 1 (Detour)", stop_order: 1, latitude: 12.91, longitude: 77.61, is_custom: true },
                { stop_id: 202, name: "Normal Stop 2", stop_order: 2, latitude: 12.92, longitude: 77.62, is_custom: false }
            ]
        };
        driver.applyRouteStopsPayload(firstCustomPayload, 'morning');
        driver.updatePreTripOverview();
        assert.match(elements['preTripFirstStopName'].innerHTML, /Temp/);
    });

    test('Stops with all students marked not-travelling receive distinct muted pin, "No pickups" badge in stop list & next-stop card, while stops with 1+ active riders or mixed peers remain active', () => {
        const { driver, elements, addedMarkers } = createDriverEnvironment();
        driver.setActiveTripType('morning');
        driver.setIsTripActive(true);
        driver.initOrUpdateRouteMap();

        // 3 stops scenario:
        // Stop 301: ALL students marked not-travelling (0 active riders expected)
        // Stop 302: 1 active rider (student_count: 1)
        // Stop 303: Mixed peers (3 assigned students, 1 marked not-travelling -> student_count: 2)
        const payload = {
            stops: [
                {
                    stop_id: 301,
                    name: "Stop 1 (All Absent)",
                    stop_order: 1,
                    latitude: 12.91,
                    longitude: 77.61,
                    student_count: 0,
                    students: []
                },
                {
                    stop_id: 302,
                    name: "Stop 2 (Single Active)",
                    stop_order: 2,
                    latitude: 12.92,
                    longitude: 77.62,
                    student_count: 1,
                    students: [{ name: "Alice", is_reallocated: false }]
                },
                {
                    stop_id: 303,
                    name: "Stop 3 (Mixed Peers)",
                    stop_order: 3,
                    latitude: 12.93,
                    longitude: 77.63,
                    student_count: 2,
                    students: [
                        { name: "Bob", is_reallocated: false },
                        { name: "Charlie", is_reallocated: false }
                    ]
                }
            ]
        };

        const ok = driver.applyRouteStopsPayload(payload, 'morning');
        assert.equal(ok, true);

        // --- Case 1: Stop 301 (all students marked not-travelling) ---
        // 1. Icon visual treatment: distinct muted/grey dashed outline and '0' tag
        const noPickupsIconUpcoming = driver.createStopMarkerIcon(1, false, false, false, false, true);
        assert.match(noPickupsIconUpcoming.html, /#F1F5F9/, 'Upcoming no-pickups pin must use muted neutral slate-100 bg');
        assert.match(noPickupsIconUpcoming.html, /2px dashed #94A3B8/, 'Upcoming no-pickups pin must use distinct dashed border');
        assert.match(noPickupsIconUpcoming.html, /#64748B/, 'Upcoming no-pickups pin must use muted slate text');
        assert.match(noPickupsIconUpcoming.html, />0</, 'Upcoming no-pickups pin must display "0" tag badge');
        assert.doesNotMatch(noPickupsIconUpcoming.html, /TEMP/, 'Must not use TEMP badge');
        assert.doesNotMatch(noPickupsIconUpcoming.html, /⚡ EXTRA/, 'Must not use EXTRA badge');

        // Next stop state for no-pickups
        const noPickupsIconNext = driver.createStopMarkerIcon(1, false, true, false, false, true);
        assert.match(noPickupsIconNext.html, /#64748B/, 'Approaching next no-pickups stop uses slate header bg');
        assert.match(noPickupsIconNext.html, /3px dashed #334155/, 'Approaching next no-pickups stop uses dashed border');

        // Passed stop state for no-pickups
        const noPickupsIconPassed = driver.createStopMarkerIcon(1, true, false, false, false, true);
        assert.match(noPickupsIconPassed.html, /#E2E8F0/, 'Passed no-pickups stop uses light slate bg');

        // 2. Map marker rendering & popup badge
        driver.renderMapMarkers();
        assert.equal(addedMarkers.length, 4); // 3 stops + 1 college marker
        const marker301 = addedMarkers[0];
        assert.match(marker301.popupContent, /No pickups/, 'Map popup must include "No pickups" badge');
        assert.match(marker301.popupContent, /0 expected \(No pickups\)/, 'Map popup must explicitly clarify 0 expected pickups');

        // 3. Stop list rendering
        driver.renderRouteStopList();
        const stopListContent = elements['driverRouteStopList'].innerHTML;
        assert.match(stopListContent, /Stop 1 \(All Absent\)/);
        assert.match(stopListContent, /No pickups/, 'Stop list item must display "No pickups" badge');
        assert.match(stopListContent, /border-dashed border-slate-200/, 'Stop list row must have muted dashed styling');

        // 4. Pre-trip overview displays "No pickups" badge when first stop has 0 students
        driver.updatePreTripOverview();
        assert.match(elements['preTripFirstStopName'].innerHTML, /No pickups/, 'Pre-trip overview first stop must display "No pickups" badge');

        // 5. Driver approaches Stop 301 as next stop
        driver.updateNextStopAndEta({ latitude: 12.909, longitude: 77.609 });
        assert.match(elements['nextStopOrderBadge'].innerHTML, /No pickups/, 'Next stop card badge must display "No pickups" badge');
        assert.equal(elements['nextStopOrderBadge'].classList.contains('text-slate-600'), true);
        assert.equal(elements['nextStopOrderBadge'].classList.contains('bg-slate-100'), true);
        assert.match(elements['nextStopStudents'].textContent, /No pickups expected \(All not travelling\)/, 'Students container must clarify all students marked not travelling');
        assert.match(elements['progressNextText'].textContent, /\(No pickups\)/, 'Stop progression strip must annotate next stop with (No pickups)');

        // --- Case 2: Stop 302 (1 active rider) ---
        // 1. Icon has normal active white/navy styling without dashed outline or '0' tag
        const singleActiveIcon = driver.createStopMarkerIcon(2, false, false, false, false, false);
        assert.match(singleActiveIcon.html, /#ffffff/, 'Active stop pin must use white background');
        assert.match(singleActiveIcon.html, /3px solid #E3E8E8/, 'Active stop pin must use solid line border');
        assert.doesNotMatch(singleActiveIcon.html, /dashed/, 'Active stop must not use dashed border');
        assert.doesNotMatch(singleActiveIcon.html, />0</, 'Active stop must not display "0" tag');

        // 2. Map popup displays expected rider count and no "No pickups" badge
        const marker302 = addedMarkers[1];
        assert.match(marker302.popupContent, /1 expected/, 'Map popup shows 1 expected student');
        assert.doesNotMatch(marker302.popupContent, /No pickups/, 'Map popup must NOT show "No pickups" badge for active stop');

        // 3. Stop list item displays active badge
        assert.match(stopListContent, /1 exp/, 'Stop list item shows "1 exp" badge');

        // 4. Driver passes Stop 301 and approaches Stop 302
        const passedSet = driver.getPassedStopIds();
        passedSet.add(301);
        driver.updateNextStopAndEta({ latitude: 12.919, longitude: 77.619 });
        assert.doesNotMatch(elements['nextStopOrderBadge'].innerHTML, /No pickups/, 'Next stop card badge must NOT show "No pickups"');
        assert.match(elements['nextStopStudents'].textContent, /1 student expected/);
        assert.doesNotMatch(elements['progressNextText'].textContent, /\(No pickups\)/);

        // --- Case 3: Stop 303 (Mixed peers: travelling + not travelling -> student_count: 2) ---
        // 1. Stop retains active styling and does not get muted
        const mixedIcon = driver.createStopMarkerIcon(3, false, false, false, false, false);
        assert.match(mixedIcon.html, /#ffffff/, 'Stop with mixed peers must retain active styling');
        assert.doesNotMatch(mixedIcon.html, /dashed/, 'Stop with mixed peers must not use dashed border');

        // 2. Map popup shows 2 expected
        const marker303 = addedMarkers[2];
        assert.match(marker303.popupContent, /2 expected/);
        assert.doesNotMatch(marker303.popupContent, /No pickups/);

        // 3. Stop list item displays "2 exp"
        assert.match(stopListContent, /2 exp/, 'Stop list item shows "2 exp" badge');

        // 4. Approaching Stop 303 shows 2 students expected
        passedSet.add(302);
        driver.updateNextStopAndEta({ latitude: 12.929, longitude: 77.629 });
        assert.doesNotMatch(elements['nextStopOrderBadge'].innerHTML, /No pickups/);
        assert.match(elements['nextStopStudents'].textContent, /2 students expected/);
    });
});
