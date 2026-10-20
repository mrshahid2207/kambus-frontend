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
                    elements[id] = { textContent: '', style: {}, innerHTML: '', classList: { add() {}, remove() {}, toggle() {} } };
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
});
