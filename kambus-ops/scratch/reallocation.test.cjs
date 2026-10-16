const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assets = path.join(__dirname, '../app/src/main/assets');
function loadFunctions(context, file, names) {
    const source = fs.readFileSync(path.join(assets, file), 'utf8');
    for (const name of names) {
        const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
        assert.ok(start >= 0, name);
        const rest = source.slice(start);
        const end = rest.slice(1).search(/\n(?:async )?function |\n\/\/ =|\nwindow\./);
        vm.runInContext(end < 0 ? rest : rest.slice(0, end + 1), context);
    }
}
function setupStudent() {
    const elements = new Map(), requests = [], locations = [];
    const element = id => {
        if (!elements.has(id)) elements.set(id, {classList: {add() {}, remove() {}, toggle() {}}, replaceChildren() {}});
        return elements.get(id);
    };
    const ctx = vm.createContext({console, API_BASE: 'https://test.invalid', studentAssignmentRequest: 0,
        studentAssignmentVersion: 0, assignedBusId: 1, studentAssignment: {bus_id: 1, driver_name: 'Old driver'},
        regularStudentAssignment: null, busTripActive: true, assignedStop: {stop_id: 9}, routeStops: [{stop_id: 9}],
        busData: {}, lastKnownLocation: {}, lastKnownSpeed: 20, lastMovingEtaMinutes: 99, lastEtaMinutes: 99,
        stoppedSince: 1, lastLocationReceivedAt: 1, hasArrivedAtAssignedStop: true,
        stopMarker: null, map: null, routePolylineLayer: {clearLayers() {}},
        getToken: () => 'token', removeBusMarker() {}, updateStopMarker() {}, setEtaBanner() {}, updateMyStopLive() {},
        updateBusOnMap: data => locations.push(data), updateEtaBanner: data => locations.push(data),
        loadRouteStops: async () => {}, loadActiveAlternativeAllotment: async () => null,
        document: {getElementById: element, querySelector: () => null, createElement: () => ({})},
        fetch: (url, options) => new Promise(resolve => requests.push({url, options, resolve}))
    });
    loadFunctions(ctx, 'student.js', ['clearStudentAssignmentTracking', 'loadStudentBus', 'loadMyStop',
        'setMyStopState', 'updateStudentDashboard', 'fetchBusLocation']);
    return {ctx, requests, locations, elements, run: code => vm.runInContext(code, ctx)};
}
const reply = (request, data) => request.resolve({ok: true, json: async () => data});
const flush = () => new Promise(resolve => setImmediate(resolve));

test('replacement assignment updates bus, driver, pickup and location while resetting ETA history', async () => {
    const app = setupStudent();
    const completion = app.run('loadStudentBus()');
    reply(app.requests[0], {bus_id: 2, bus_number: 'B2', driver_name: 'New driver', driver_phone: '123',
        route_name: 'New route', active_trip: true, alternative_bus: true, allotment_id: 5,
        original_bus_id: 1, original_bus_number: 'B1'});
    await flush();
    assert.match(app.requests[1].url, /student\/my-stop$/);
    reply(app.requests[1], {stop_id: 10, stop_name: 'Replacement pickup', latitude: 18, longitude: 79, route_id: 2});
    await flush();
    assert.match(app.requests[2].url, /buses\/2\/location$/);
    reply(app.requests[2], {bus_id: 2, latitude: 18.01, longitude: 79, speed: 30, timestamp: new Date().toISOString()});
    assert.equal(await completion, true);
    assert.equal(app.ctx.assignedBusId, 2);
    assert.equal(app.ctx.lastEtaMinutes, null);
    assert.equal(app.ctx.hasArrivedAtAssignedStop, false);
    assert.equal(app.elements.get('driverName').textContent, 'New driver');
    assert.equal(app.elements.get('myStopName').textContent, 'Replacement pickup');
    assert.equal(app.elements.get('myStopBus').textContent, 'Bus: B2');
    assert.ok(app.locations.every(location => location.bus_id === 2));
});

test('old location responses cannot overwrite a new assignment or its ETA', async () => {
    const app = setupStudent();
    const oldLocation = app.run('fetchBusLocation()');
    app.run('clearStudentAssignmentTracking(); assignedBusId = 2');
    reply(app.requests[0], {bus_id: 1, latitude: 1, longitude: 2, speed: 4});
    await oldLocation;
    assert.equal(app.locations.length, 0);
    assert.equal(app.ctx.busData, null);
});

test('out-of-order assignment responses cannot restore the old bus', async () => {
    const app = setupStudent();
    const old = app.run('loadStudentBus()');
    app.run('studentAssignmentRequest += 1; assignedBusId = 2');
    reply(app.requests[0], {bus_id: 1, active_trip: true});
    assert.equal(await old, false);
    assert.equal(app.ctx.assignedBusId, 2);
    assert.equal(app.requests.length, 1);
});

function setupDriver() {
    const requests = [], etaStops = [], elements = new Map();
    const ctx = vm.createContext({console, API_BASE: 'https://test.invalid', BUS_ID: 2, currentBusData: {bus_id: 2},
        driverRouteStops: [{stop_id: 20}], driverRouteVersion: 0, activeTripType: 'morning', selectedTripType: null,
        currentNextStop: {stop_id: 20}, passedStopIds: new Set(), lastPosition: {latitude: 18, longitude: 79},
        isTripActive: true, lastRouteFetchAt: 100, lastRouteFetchPos: {}, lastNextStopId: 20,
        remainingRouteLayer: {clearLayers() {}}, COLLEGE_LOCATION: {}, driverAssignmentRefresh: Promise.resolve(), driverBusRequest: 0, driverStopsRequest: 0,
        getToken: () => 'token', updatePreTripOverview() {}, updateStopProgressionUI() {}, initOrUpdateRouteMap() {},
        updateNextStopAndEta() { etaStops.push(ctx.driverRouteStops.map(stop => stop.stop_id)); },
        triggerRoadRouteFetchIfNeeded() {}, window: {},
        document: {getElementById(id) { if (!elements.has(id)) elements.set(id, {classList: {remove() {}}}); return elements.get(id); }},
        fetch: url => new Promise(resolve => requests.push({url, resolve}))});
    loadFunctions(ctx, 'driver.js', ['loadDriverBus', 'loadDriverRouteStops', 'refreshDriverAssignment']);
    return {ctx, requests, etaStops, elements, run: code => vm.runInContext(code, ctx)};
}

test('driver roster event reloads stops and ETA without switching the driver to the passenger old bus', async () => {
    const app = setupDriver();
    const completion = app.run("refreshDriverAssignment({bus_id: 2, message: 'New pickup at A'})");
    await flush();
    reply(app.requests[0], {bus_id: 2, bus_number: 'B2', driver_name: 'Receiving driver'});
    await flush();
    reply(app.requests[1], {bus_id: 2, trip_type: 'morning', stops: [{stop_id: 20}, {stop_id: 9, name: 'A', student_count: 1}]});
    await completion;
    assert.equal(app.ctx.BUS_ID, 2);
    assert.deepEqual(Array.from(app.etaStops[0]), [20, 9]);
    assert.equal(app.elements.get('headerBusBadge').textContent, 'Bus B2');
    assert.equal(app.elements.get('driverAllotmentBanner').textContent, 'New pickup at A');
    assert.equal(app.ctx.driverRouteVersion, 1);
});

test('driver pickup name appears before the first GPS fix, without stale ETA', async () => {
    const app = setupDriver();
    app.ctx.lastPosition = null;
    const completion = app.run('loadDriverRouteStops()');
    reply(app.requests[0], {bus_id: 2, trip_type: 'morning', stops: [{stop_id: 9, name: 'A', student_count: 1}]});
    await completion;
    assert.equal(app.elements.get('nextStopName').textContent, 'A');
    assert.match(app.elements.get('nextStopEta').textContent, /waiting for GPS/);
});
