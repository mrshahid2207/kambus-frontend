const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('Wait Request UI & WebSocket Fixes', () => {
    const driverHtmlPath = path.join(__dirname, 'app/src/main/assets/driver.html');
    const driverJsPath = path.join(__dirname, 'app/src/main/assets/driver.js');
    const studentHtmlPath = path.join(__dirname, '../kambus-rider/app/src/main/assets/student.html');
    const studentJsPath = path.join(__dirname, '../kambus-rider/app/src/main/assets/student.js');

    const driverHtml = fs.readFileSync(driverHtmlPath, 'utf8');
    const driverJs = fs.readFileSync(driverJsPath, 'utf8');
    const studentHtml = fs.readFileSync(studentHtmlPath, 'utf8');
    const studentJs = fs.readFileSync(studentJsPath, 'utf8');

    test('Fix 1: driver.js handles wait_request_boarded in WebSocket onmessage handler', () => {
        assert.ok(
            driverJs.includes('data.type === "wait_request_boarded"'),
            'driver.js must handle data.type === "wait_request_boarded"'
        );
        assert.ok(
            driverJs.includes('hideActiveWaitCard()'),
            'driver.js must immediately hide the active wait card on wait_request_boarded'
        );
        assert.ok(
            driverJs.includes('toast_student_boarded'),
            'driver.js must notify driver when student boards'
        );
    });

    test('Fix 2: driver.html contains separate completeWaitBtn for ending active wait early', () => {
        assert.ok(
            driverHtml.includes('id="completeWaitBtn"'),
            'driver.html must have #completeWaitBtn'
        );
        assert.ok(
            driverHtml.includes('data-i18n="wait_continue_now"'),
            'driver.html completeWaitBtn must have i18n key wait_continue_now'
        );
        assert.ok(
            driverHtml.includes('id="skipWaitBtn"'),
            'driver.html must still have distinct #skipWaitBtn'
        );
    });

    test('Fix 2: driver.js exposes handleCompleteActiveWait and toggles buttons appropriately', () => {
        assert.ok(
            driverJs.includes('handleCompleteActiveWait'),
            'driver.js must define handleCompleteActiveWait'
        );
        assert.ok(
            driverJs.includes('/driver/wait-request/${firstStudentRequestId}/complete-early') ||
            driverJs.includes('/driver/wait-request/'),
            'handleCompleteActiveWait must call the backend complete-early endpoint'
        );
        // Status checks
        assert.ok(
            driverJs.includes('completeBtn?.classList.remove("hidden")'),
            'completeWaitBtn must be shown on accepted and waiting states'
        );
        assert.ok(
            driverJs.includes('completeBtn?.classList.add("hidden")'),
            'completeWaitBtn must be hidden on pending and dismissed states'
        );
    });

    test('Fix 3: student.html differentiates boarding_confirmed true vs false/unset', () => {
        assert.ok(
            studentHtml.includes('data.boarding_confirmed'),
            'student.html must inspect data.boarding_confirmed'
        );
        assert.ok(
            studentHtml.includes('Wait time ended'),
            'student.html must display neutral/cautionary "Wait time ended" on timeout'
        );
        assert.ok(
            studentHtml.includes('Boarding confirmed'),
            'student.html must display positive "Boarding confirmed" when confirmed'
        );
    });

    test('Fix 4: student.html contains waitCancelBtn and cancelStudentWaitRequest function', () => {
        assert.ok(
            studentHtml.includes('id="waitCancelBtn"'),
            'student.html must have #waitCancelBtn'
        );
        assert.ok(
            studentHtml.includes('cancelStudentWaitRequest'),
            'student.html must have cancelStudentWaitRequest function'
        );
        assert.ok(
            studentHtml.includes('/student/wait-request/${waitRequestActiveId}/cancel'),
            'cancelStudentWaitRequest must call POST /student/wait-request/{id}/cancel'
        );
    });

    test('Fix 1 & 2 integration: student.js handles wait_request_boarded notification', () => {
        assert.ok(
            studentJs.includes('data.type === "wait_request_boarded"'),
            'student.js must handle incoming wait_request_boarded notification'
        );
    });
});
