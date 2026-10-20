const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Mock a lightweight browser environment to load driver.js
const mockWindow = {
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    location: { replace() {} },
    addEventListener() {},
};
const mockDocument = {
    getElementById: () => null,
    addEventListener: () => {},
    documentElement: { style: { setProperty() {} }, classList: { add() {} } }
};
const mockLocalStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
};

const driverJsPath = path.join(__dirname, 'app/src/main/assets/driver.js');
const driverJsContent = fs.readFileSync(driverJsPath, 'utf8');

const context = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    navigator: { geolocation: {} },
    console,
    module: { exports: {} },
    exports: {},
    L: {
        map: () => ({ setView() { return this; }, on() { return this; } }),
        tileLayer: () => ({ addTo() { return this; } }),
        geoJSON: () => ({ addTo() { return this; }, clearLayers() { return this; } }),
        layerGroup: () => ({ addTo() { return this; }, clearLayers() { return this; }, addLayer() { return this; } }),
        divIcon: (opts) => opts,
        marker: () => ({ addTo() { return this; }, setLatLng() { return this; }, bindPopup() { return this; } }),
    },
    setTimeout: (fn) => setTimeout(fn, 0),
    setInterval: () => 1,
    clearInterval: () => {},
    Date,
    Math,
    Number,
    Array,
    Set,
    JSON,
});

vm.runInContext(driverJsContent, context);
const driver = context.module.exports;

describe('Navigation Camera - Bearing calculation from 2 GPS points', () => {
    test('computes cardinal forward azimuths correctly', () => {
        // Due North
        const north = driver.calculateBearingFromCoords(18.000, 79.500, 18.010, 79.500);
        assert.ok(Math.abs(north - 0) < 0.1 || Math.abs(north - 360) < 0.1, `Expected ~0°, got ${north}`);

        // Due East
        const east = driver.calculateBearingFromCoords(18.000, 79.500, 18.000, 79.510);
        assert.ok(Math.abs(east - 90) < 0.5, `Expected ~90°, got ${east}`);

        // Due South
        const south = driver.calculateBearingFromCoords(18.010, 79.500, 18.000, 79.500);
        assert.ok(Math.abs(south - 180) < 0.1, `Expected ~180°, got ${south}`);

        // Due West
        const west = driver.calculateBearingFromCoords(18.000, 79.510, 18.000, 79.500);
        assert.ok(Math.abs(west - 270) < 0.5, `Expected ~270°, got ${west}`);
    });

    test('computes intercardinal forward azimuths correctly', () => {
        // North-East (~43.7° given longitude scaling at lat 18°)
        const ne = driver.calculateBearingFromCoords(18.000, 79.500, 18.010, 79.510);
        assert.ok(ne > 40 && ne < 50, `Expected ~45°, got ${ne}`);

        // South-West (~223.7°)
        const sw = driver.calculateBearingFromCoords(18.010, 79.510, 18.000, 79.500);
        assert.ok(sw > 220 && sw < 230, `Expected ~225°, got ${sw}`);
    });

    test('returns null for non-finite coordinates', () => {
        assert.equal(driver.calculateBearingFromCoords(NaN, 79.5, 18.0, 79.5), null);
        assert.equal(driver.calculateBearingFromCoords(18.0, 79.5, 18.0, undefined), null);
    });
});

describe('Navigation Camera - Speed threshold & heading resolution', () => {
    const prevPos = { latitude: 18.0000, longitude: 79.5000 };
    const currPosMovedEast = { latitude: 18.0000, longitude: 79.5010 }; // ~105m east

    test('uses device-reported bearing when moving above 2 km/h threshold', () => {
        const deviceBearing = 45.0;
        const speedKmh = 25.0;
        const resolved = driver.resolveTargetBearing(deviceBearing, speedKmh, currPosMovedEast, prevPos, 0);
        assert.equal(resolved, 45.0, 'Should use device bearing when speed > 2 km/h');
    });

    test('ignores device bearing below 2 km/h threshold and falls back to GPS displacement', () => {
        const noisyDeviceBearing = 310.0;
        const speedKmh = 1.2; // Crawling/stopped speed with noisy compass
        const resolved = driver.resolveTargetBearing(noisyDeviceBearing, speedKmh, currPosMovedEast, prevPos, 0);
        // Fallback between prevPos and currPosMovedEast is due East (~90°)
        assert.ok(Math.abs(resolved - 90) < 0.5, `Expected fallback ~90°, got ${resolved}`);
    });

    test('falls back to 2-point calculation when device bearing is null or undefined', () => {
        const resolved = driver.resolveTargetBearing(null, 30.0, currPosMovedEast, prevPos, 0);
        assert.ok(Math.abs(resolved - 90) < 0.5, `Expected fallback ~90°, got ${resolved}`);
    });

    test('retains last known bearing when stopped with displacement under 3m', () => {
        const stoppedPos1 = { latitude: 18.000000, longitude: 79.500000 };
        const stoppedPos2 = { latitude: 18.000005, longitude: 79.500005 }; // < 1m jitter
        const lastBearing = 135.0;

        const resolved = driver.resolveTargetBearing(
            null,
            0.0,
            stoppedPos2,
            stoppedPos1,
            lastBearing
        );
        assert.equal(resolved, 135.0, 'Should retain last bearing to prevent spinning when stopped');
    });
});

describe('Navigation Camera - Circular angular smoothing', () => {
    test('smooths standard angular transitions with exponential moving average', () => {
        const smoothed = driver.smoothBearing(90.0, 100.0, 0.25);
        assert.equal(smoothed, 92.5);
    });

    test('smooths across 0° / 360° boundary clockwise without flipping', () => {
        // From 350° towards 10° is +20° clockwise across 0°
        // With alpha 0.25: 350 + (0.25 * 20) = 355°
        const smoothed = driver.smoothBearing(350.0, 10.0, 0.25);
        assert.equal(smoothed, 355.0, 'Should wrap through 0° to 355°, not flip to ~180°');
    });

    test('smooths across 0° / 360° boundary counter-clockwise without flipping', () => {
        // From 10° towards 350° is -20° counter-clockwise across 0°
        // With alpha 0.25: 10 + (0.25 * -20) = 5°
        const smoothed = driver.smoothBearing(10.0, 350.0, 0.25);
        assert.equal(smoothed, 5.0, 'Should wrap through 0° to 5°');
    });

    test('initializes with target bearing when current is null', () => {
        assert.equal(driver.smoothBearing(null, 240.0), 240.0);
    });
});

describe('Navigation Camera - Viewport center offset for bottom-third bus placement', () => {
    test('offsets camera ahead of bus in the direction of travel', () => {
        const busLat = 18.0000;
        const busLng = 79.5000;
        const zoom = 17;
        const containerH = 500;

        // When heading North (0°), camera center must be further North than the bus
        const centerNorth = driver.computeNavigationCenter(busLat, busLng, 0, zoom, containerH);
        assert.ok(centerNorth[0] > busLat, 'Center lat should be North of bus');
        assert.equal(centerNorth[1], busLng, 'Center lng should equal bus lng');

        // When heading East (90°), camera center must be further East than the bus
        const centerEast = driver.computeNavigationCenter(busLat, busLng, 90, zoom, containerH);
        assert.ok(Math.abs(centerEast[0] - busLat) < 0.00001, 'Center lat should equal bus lat');
        assert.ok(centerEast[1] > busLng, 'Center lng should be East of bus');

        // When heading South (180°), camera center must be further South than the bus
        const centerSouth = driver.computeNavigationCenter(busLat, busLng, 180, zoom, containerH);
        assert.ok(centerSouth[0] < busLat, 'Center lat should be South of bus');

        // When heading West (270°), camera center must be further West than the bus
        const centerWest = driver.computeNavigationCenter(busLat, busLng, 270, zoom, containerH);
        assert.ok(centerWest[1] < busLng, 'Center lng should be West of bus');
    });
});
