const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/src/main/assets/student.js'), 'utf8');
const handler = source.slice(source.indexOf('async function cancelTemporaryStopChange()'), source.indexOf('window.cancelTemporaryStopChange'));
function setup(check, active = true, checkOk = true) {
    const calls = [], notices = [];
    const context = vm.createContext({
        console, API_BASE: 'test', studentFeatureSubmitting: false,
        temporaryStopChange: { active, scheduled: !active, original_stop_id: 17 },
        temporaryRouteSelection: {}, getToken: () => 'token',
        KambusNotify: { confirm: async () => true },
        renderTemporaryStopStatus() {}, closeTemporaryStopModal() {},
        updateStudentDashboard() {}, updateMissedBusButtonUI() {}, setMyStopState() {},
        clearStudentAssignmentTracking() { calls.push('clear'); },
        async loadStudentBus() { calls.push('reload'); return true; },
        featureNotify(...args) { notices.push(args); },
        async fetch(url, options) {
            calls.push({ url, ...options });
            return { ok: options.method === 'DELETE' || checkOk, json: async () => options.method === 'DELETE' ? {success: true} : check };
        }
    });
    vm.runInContext(handler, context);
    return {context, calls, notices, run: () => context.cancelTemporaryStopChange()};
}
test('cancel checks original stop against replacement, clears tracking and reloads before rejection', async () => {
    const app = setup({on_route: false, candidate_buses: [{bus_id: 3}]});
    await app.run();
    assert.equal(app.calls[0].method, 'POST');
    assert.deepEqual(JSON.parse(app.calls[0].body), {stop_id: 17});
    assert.equal(app.calls[1].method, 'DELETE');
    assert.deepEqual(app.calls.slice(2), ['clear', 'reload']);
    assert.equal(app.context.temporaryStopChange, null);
    assert.match(app.notices[0][2], /does not travel through this stop/);
    assert.equal(app.context.studentFeatureSubmitting, false);
});
test('covered original stop and own-bus approximate match do not show rejection', async () => {
    for (const check of [{on_route: true}, {on_route: false, candidate_buses: [{is_own_bus: true}]}]) {
        const app = setup(check);
        await app.run();
        assert.equal(app.notices[0][0], 'success');
        assert.ok(app.calls.includes('reload'));
    }
});
test('scheduled cancellation refreshes without validating an inactive temporary assignment', async () => {
    const app = setup({}, false);
    await app.run();
    assert.equal(app.calls[0].method, 'DELETE');
    assert.equal(app.calls.length, 3);
});
test('failed validation does not cancel or claim successful revalidation', async () => {
    const app = setup({detail: 'Route unavailable'}, true, false);
    await app.run();
    assert.equal(app.calls.length, 1);
    assert.equal(app.context.temporaryStopChange.active, true);
    assert.equal(app.notices[0][0], 'error');
    assert.equal(app.context.studentFeatureSubmitting, false);
});
test('failed assignment refresh clears the replacement details and reports reload failure', async () => {
    const app = setup({on_route: false, candidate_buses: []});
    app.context.assignedBusId = 3;
    app.context.studentAssignment = {bus_id: 3, driver_name: 'Zain'};
    app.context.activeAlternativeAllotment = {alternative_bus_id: 3};
    let dashboard;
    app.context.updateStudentDashboard = data => { dashboard = data; };
    app.context.loadStudentBus = async () => false;
    await app.run();
    assert.equal(app.context.assignedBusId, null);
    assert.equal(app.context.studentAssignment, null);
    assert.equal(app.context.activeAlternativeAllotment, null);
    assert.equal(Object.keys(dashboard).length, 0);
    assert.match(app.notices[0][2], /Unable to reload/);
});
