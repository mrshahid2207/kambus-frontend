const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/student.js'), 'utf8');
const picker = source.slice(source.indexOf('let tempStopPickerMap ='), source.indexOf('async function openTemporaryStopModal('));
const college = { latitude: 18.054145359568437, longitude: 79.53558731724873, name: 'College' };
const stop = (id, order) => ({ stop_id: id, stop_order: order, name: `Stop ${id}`, latitude: 18 + id / 1000,
    longitude: 79.5 + id / 1000, evening_latitude: 18.02 + id / 1000, evening_longitude: 79.52 + id / 1000 });

function setup() {
    const layers = new Set(), pending = [], notices = [], elements = new Map();
    const map = { removeLayer: layer => layers.delete(layer), invalidateSize() {}, on() {}, setView() { return this; } };
    let mapCreations = 0;
    const layer = (kind, coords, options) => ({ kind, coords, options, on() { return this; }, setLatLng(coords) { this.coords = coords; },
        addTo(target) { if (target.addLayer) target.addLayer(this); else layers.add(this); return this; },
        bindPopup() { return this; } });
    const context = vm.createContext({
        console: { warn() {}, error() {} }, window: {}, COLLEGE_LOCATION: college,
        routeStops: [stop(2, 2), stop(1, 1)], routeStopsBusId: 1, assignedStop: null,
        temporaryStopChange: null, regularStudentAssignment: null, studentAssignment: null,
        featureNotify: (...args) => notices.push(args),
        fetch: (url, options) => new Promise((resolve, reject) => pending.push({ url, options, resolve, reject })),
        API_BASE: 'https://test.invalid', getToken: () => 'test-token', studentFeatureSubmitting: false,
        renderTemporaryStopStatus() {}, closeTemporaryStopModal() {},
        loadMyStop: async () => {}, loadTemporaryStopChange: async () => {}, loadStudentBus: async () => {},
        setTimeout: fn => fn(), requestAnimationFrame: fn => fn(),
        document: { createElement: () => ({ textContent: '', get innerHTML() { return this.textContent; } }),
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, { value: '', classList: { toggle() {}, add() {}, remove() {} } });
                return elements.get(id);
            } },
        L: { map() { mapCreations++; return map; }, tileLayer: () => layer('tile'),
            circleMarker: (coords, options) => layer('marker', coords, options), polyline: (coords, options) => layer('line', coords, options),
            marker: (coords, options) => layer('pin', coords, options), divIcon: options => options,
            layerGroup() { const children = new Set(); return { addTo() { return this; },
                addLayer(item) { children.add(item); layers.add(item); },
                clearLayers() { children.forEach(item => layers.delete(item)); children.clear(); } }; } }
    });
    vm.runInContext(picker, context);
    vm.runInContext(source.slice(source.indexOf('async function submitTemporaryStopChange()'), source.indexOf('window.submitTemporaryStopChange =')), context);
    vm.runInContext(`temporaryAllBusRoutes = ${JSON.stringify([{ bus_id: 1, stops: [stop(1, 1), stop(2, 2)] },
        { bus_id: 2, stops: [stop(3, 1), stop(4, 2), stop(5, 3)] }])}; initTempStopPickerMap();`, context);
    return { pending, notices, elements, mapCreations: () => mapCreations,
        pins: () => [...layers].filter(item => item.kind === 'pin'),
        markers: () => [...layers].filter(item => item.kind === 'marker'),
        lines: () => [...layers].filter(item => item.kind === 'line'),
        run: code => vm.runInContext(code, context) };
}
const respond = request => request.resolve({ ok: true, json: async () => ({ routes: [{ geometry: {
    coordinates: [[79.501, 18.001], [79.511, 18.019], [college.longitude, college.latitude]]
} }] }) });
const flush = () => new Promise(resolve => setImmediate(resolve));
const points = request => request.url.split('/driving/')[1].split('?')[0].split(';');

test('default view has two endpoints and routes through ordered stops to college', async () => {
    const app = setup();
    assert.equal(app.markers().length, 2);
    assert.deepEqual(Array.from(app.markers()[0].coords), [18.001, 79.501]);
    assert.deepEqual(Array.from(app.markers()[1].coords), [college.latitude, college.longitude]);
    assert.equal(points(app.pending[0]).length, 3);
    assert.equal(points(app.pending[0]).at(-1), `${college.longitude},${college.latitude}`);
    respond(app.pending[0]); await flush();
    assert.equal(app.lines().length, 1);
    assert.deepEqual(Array.from(app.lines()[0].coords[1]), [18.019, 79.511]);
});

test('direction toggle replaces layers on the same map and ignores stale responses', async () => {
    const app = setup();
    app.run("setTemporaryStopDirection('evening')");
    assert.equal(app.mapCreations(), 1);
    assert.equal(app.markers().length, 2);
    assert.equal(points(app.pending[1])[0], `${stop(1, 1).evening_longitude},${stop(1, 1).evening_latitude}`);
    respond(app.pending[1]); await flush();
    respond(app.pending[0]); await flush();
    assert.equal(app.lines().length, 1);
    app.run("setTemporaryStopDirection('morning')");
    assert.equal(app.lines().length, 0);
    assert.equal(app.markers().length, 2);
    assert.equal(app.mapCreations(), 1);
    assert.equal(points(app.pending[2])[0], '79.501,18.001');
});

test('specific bus replaces endpoints with all its registered stops', () => {
    const app = setup();
    app.run("setTemporaryRouteView('2')");
    assert.equal(app.markers().length, 3);
    assert.equal(app.markers()[0].coords[0], stop(3, 1).latitude);
    app.run("setTemporaryStopDirection('evening')");
    assert.equal(app.markers().length, 3);
    assert.equal(app.markers()[0].coords[0], stop(3, 1).evening_latitude);
    app.run("setTemporaryRouteView('my')");
    assert.equal(app.markers().length, 2);
    assert.equal(app.mapCreations(), 1);
});

test('all buses use OSRM and stale fleet responses cannot enter a selected view', async () => {
    const app = setup();
    app.run("setTemporaryRouteView('all')");
    assert.equal(app.pending.length, 3);
    assert.equal(app.lines().length, 0);
    respond(app.pending[1]); respond(app.pending[2]); await flush();
    assert.equal(app.lines().length, 2);
    app.run("setTemporaryStopDirection('evening'); setTemporaryRouteView('2')");
    respond(app.pending[3]); respond(app.pending[4]); await flush();
    assert.equal(app.lines().length, 0);
    respond(app.pending[5]); await flush();
    assert.equal(app.lines().length, 1);
});

test('routing failure does not draw a straight fallback', async () => {
    const app = setup();
    app.pending[0].reject(new Error('offline')); await flush();
    assert.equal(app.lines().length, 0);
    assert.equal(app.notices.length, 1);
    assert.equal(app.markers().length, 2);
});

test('college cuts off later waypoints and null coordinates are excluded', () => {
    const app = setup();
    const result = app.run(`getTemporaryRouteWaypoints([${JSON.stringify(stop(1, 1))}, COLLEGE_LOCATION, ${JSON.stringify(stop(2, 3))}])`);
    assert.equal(result.length, 2);
    assert.equal(result.at(-1), college);
    assert.equal(app.run('getTemporaryStopPickerRouteStops([{latitude: null, longitude: null}]).length'), 0);
});

test('morning coordinates survive a payload from an active evening trip', () => {
    const app = setup();
    const result = app.run('getTemporaryStopPickerRouteStops([{latitude: 18.02, longitude: 79.52, morning_latitude: 18.01, morning_longitude: 79.51}])[0]');
    assert.equal(result.latitude, 18.01);
    assert.equal(result.longitude, 79.51);
});

test('pins, stops, and road geometry use green for morning and red for evening', async () => {
    const app = setup();
    respond(app.pending[0]); await flush();
    assert.equal(app.lines()[0].options.color, '#16a34a');
    assert.ok(app.markers().every(marker => marker.options.color === '#16a34a'));
    app.run("placeTempStopMarker(18.001, 79.501, 'Morning pin')");
    assert.match(app.pins()[0].options.icon.html, /#16a34a/);
    assert.equal(app.markers().length + app.pins().length, 2);
    app.run("temporaryStopDrafts.morning.routeCheck = temporaryStopRouteCheck = {on_route: true}; setTemporaryStopDirection('evening')");
    respond(app.pending[1]); await flush();
    assert.equal(app.lines()[0].options.color, '#dc2626');
    assert.ok(app.markers().every(marker => marker.options.color === '#dc2626'));
    app.run("placeTempStopMarker(18.021, 79.521, 'Evening pin'); setTemporaryStopDirection('morning')");
    assert.match(app.pins()[0].options.icon.html, /#16a34a/);
    assert.equal(app.run('temporaryStopDrafts.morning.routeCheck.on_route'), true);
    app.run("setTemporaryStopDirection('evening')");
    assert.match(app.pins()[0].options.icon.html, /#dc2626/);
    assert.equal(app.mapCreations(), 1);
});

for (const directions of [['morning'], ['evening'], ['morning', 'evening']]) {
    test(`${directions.join('+')} saved request renders only registered directions`, async () => {
        const app = setup();
        const selection = { directions };
        directions.forEach(direction => {
            selection[`${direction}_temporary_latitude`] = direction === 'morning' ? 18.001 : 18.021;
            selection[`${direction}_temporary_longitude`] = direction === 'morning' ? 79.501 : 79.521;
        });
        app.run(`temporaryStopChange = ${JSON.stringify(selection)}; renderTemporaryRouteExplorer()`);
        for (const direction of ['evening', 'morning']) {
            const before = app.pending.length;
            app.run(`setTemporaryStopDirection('${direction}')`);
            if (directions.includes(direction)) {
                assert.equal(app.pending.length, before + 1);
                respond(app.pending.at(-1)); await flush();
                assert.equal(app.lines().length, 1);
                assert.equal(app.pins().length + app.markers().length, 2);
            } else {
                assert.equal(app.pending.length, before);
                assert.equal(app.lines().length + app.pins().length + app.markers().length, 0);
                assert.equal(app.elements.get('temporaryRouteMapStatus').textContent, `No ${direction} stop registered`);
            }
        }
        assert.equal(app.notices.length, 0);
    });
}

test('blank coordinates are absent, clearing one direction leaves the other submittable', () => {
    const app = setup();
    assert.equal(app.run("temporaryStopInputFromDraft('morning')"), null);
    assert.equal(app.run("temporaryStopInputFromDraft('evening')"), null);
    assert.equal(app.run('getTemporaryStopRequestInput()'), null);
    app.run("placeTempStopMarker(18.001, 79.501, 'Morning'); temporaryStopRouteCheck = temporaryStopDrafts.morning.routeCheck = {on_route: true}; setTemporaryStopDirection('evening')");
    assert.equal(app.elements.get('confirmTemporaryStopBtn').disabled, false);
    app.run("placeTempStopMarker(18.021, 79.521, 'Evening'); clearTemporaryStopDirection()");
    assert.equal(app.run("temporaryStopInputFromDraft('evening')"), null);
    assert.equal(app.elements.get('confirmTemporaryStopBtn').disabled, false);
});

test('evening cannot fall back to morning when evening coordinates are explicitly absent', () => {
    const app = setup();
    app.run("routeStops = [{stop_id: 1, latitude: 18.001, longitude: 79.501, evening_latitude: null, evening_longitude: null}]; setTemporaryStopDirection('evening')");
    assert.equal(app.markers().length, 0);
    assert.equal(app.pending.length, 1);
    assert.match(app.elements.get('temporaryRouteMapStatus').textContent, /No evening stops/);
});

for (const directions of [['morning'], ['evening'], ['morning', 'evening']]) {
    test(`form submits exactly ${directions.join('+')} without manufacturing a second location`, async () => {
        const app = setup();
        app.run(`
            temporaryStopDirection = '${directions[0]}'; temporaryStopInputMode = 'registered';
            document.getElementById('temporaryRegisteredStop').value = '1';
            temporaryStopRouteCheck = {on_route: true};
            document.getElementById('temporaryStartDate').value = '2026-09-29';
            document.getElementById('temporaryEndDate').value = '2026-09-30';
        `);
        directions.forEach(direction => app.run(`temporaryStopDrafts.${direction} = {mode: 'registered', stopId: 1, routeCheck: {on_route: true}}`));
        const submitted = app.run('submitTemporaryStopChange()');
        const request = app.pending.at(-1);
        assert.match(request.url, /temporary-stop-change$/);
        const payload = JSON.parse(request.options.body);
        for (const direction of ['morning', 'evening']) {
            assert.equal(Object.hasOwn(payload, `${direction}_location`), directions.includes(direction));
        }
        request.resolve({ ok: true, json: async () => ({status: 'active', directions}) });
        await submitted;
        assert.equal(app.notices.filter(notice => notice[0] === 'error').length, 0);
    });
}

test('selected bus updates the stop dropdown and draws markers plus geometry together', async () => {
    const app = setup();
    app.run("setTemporaryRouteView('2')");
    const options = app.elements.get('temporaryRegisteredStop').innerHTML;
    assert.match(options, /Stop 3/);
    assert.match(options, /Stop 5/);
    assert.doesNotMatch(options, /Stop 1/);
    respond(app.pending.at(-1)); await flush();
    assert.equal(app.markers().length, 3);
    assert.equal(app.lines().length, 1);
});

test('admin logs render readable single-direction and both-direction labels', () => {
    const admin = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/admin.js'), 'utf8');
    const elements = {tempStopLogsList: {}, tempStopFilterStatus: {value: 'all'}};
    const rows = [
        {directions: ['morning'], morning_temporary_stop_id: 1, morning_temporary_stop_name: 'Morning A'},
        {directions: ['evening'], evening_temporary_stop_id: 2, evening_temporary_stop_name: 'Evening B'},
        {directions: ['morning', 'evening'], morning_temporary_stop_id: 1, evening_temporary_stop_id: 2,
            morning_temporary_stop_name: 'Morning C', evening_temporary_stop_name: 'Evening C'}
    ].map((row, index) => ({...row, request_id: index + 1, status: 'pending_admin_approval', student_name: `Student ${index}`}));
    const context = vm.createContext({cachedTempStopLogs: rows, escapeHtml: value => String(value ?? ''),
        document: {getElementById: id => elements[id]}});
    vm.runInContext(admin.slice(admin.indexOf('    function filterTempStopLogs()'), admin.indexOf('    async function deleteTemporaryStopChange(')), context);
    vm.runInContext('filterTempStopLogs()', context);
    const html = elements.tempStopLogsList.innerHTML;
    for (const label of ['Morning only', 'Evening only', 'Both', 'Morning A', 'Evening B']) assert.ok(html.includes(label));
    assert.doesNotMatch(html, /undefined|null|Stop unavailable/);
});
