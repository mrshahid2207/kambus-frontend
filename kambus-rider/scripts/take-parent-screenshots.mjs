import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, '../app/src/main/assets');
const outDir = path.resolve(__dirname, '../screenshots');

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

const mockChildrenData = {
    parent: {
        id: 1,
        name: "Sarah Connor",
        phone: "9876543210"
    },
    children: [
        {
            id: 101,
            name: "John Connor",
            roll_number: "21CS101",
            bus_id: 12,
            bus_number: "12",
            route_name: "Route 4 - Hanamkonda",
            stop_name: "Kazipet Junction",
            stop_latitude: 17.515,
            stop_longitude: 78.525,
            live_status: "on_bus",
            boarding_scan: { time: "08:15 AM" }
        },
        {
            id: 102,
            name: "Jane Connor",
            roll_number: "23EC204",
            bus_id: 8,
            bus_number: "08",
            route_name: "Route 2 - Subedari",
            stop_name: "Subedari Bus Stop",
            stop_latitude: 17.505,
            stop_longitude: 78.515,
            live_status: "dropped",
            drop_scan: { time: "08:45 AM" }
        },
        {
            id: 103,
            name: "Tommy Connor",
            roll_number: "25ME305",
            bus_id: 15,
            bus_number: "15",
            route_name: "Route 1 - Kazipet",
            stop_name: "REC Petrol Pump",
            stop_latitude: 17.525,
            stop_longitude: 78.535,
            live_status: "not_travelling"
        }
    ]
};

const mockBusLocations = {
    "12": {
        bus_id: 12,
        latitude: 17.52,
        longitude: 78.53,
        speed: 35,
        timestamp: new Date().toISOString(),
        trip_status: "active",
        is_active: true
    },
    "8": {
        bus_id: 8,
        latitude: 17.51,
        longitude: 78.52,
        speed: 0,
        timestamp: new Date(Date.now() - 300000).toISOString(), // 5 min ago (stale)
        trip_status: "active",
        is_active: true
    },
    "15": {
        bus_id: 15,
        latitude: null,
        longitude: null,
        speed: null,
        timestamp: null,
        trip_status: "inactive",
        is_active: false
    }
};

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost:8099');
    const pathname = parsedUrl.pathname;

    // Mock API endpoints
    if (pathname === '/parent/my-children') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify(mockChildrenData));
    }
    const busLocMatch = pathname.match(/^\/buses\/(\d+)\/location$/);
    if (busLocMatch) {
        const busId = busLocMatch[1];
        const loc = mockBusLocations[busId] || {
            bus_id: Number(busId),
            latitude: null,
            longitude: null,
            speed: null,
            timestamp: null,
            trip_status: "inactive",
            is_active: false
        };
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify(loc));
    }
    if (pathname === '/parent/device-token') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ status: "ok" }));
    }

    let filePath = path.join(assetsDir, pathname === '/' ? 'parent.html' : pathname);
    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        return res.end('Not found: ' + pathname);
    }

    const ext = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon'
    };
    res.writeHead(200, {
        'Content-Type': contentTypes[ext] || 'text/plain',
        'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
});

server.listen(8099, async () => {
    console.log('Static & API mock server running on http://localhost:8099');

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const tmpProfile = path.join(process.env.TEMP, 'chrome_parent_test_' + Date.now());
    const chrome = spawn(chromePath, [
        '--headless=new',
        '--remote-debugging-port=9223',
        `--user-data-dir=${tmpProfile}`,
        '--no-sandbox',
        '--disable-gpu',
        '--window-size=430,932',
        'about:blank'
    ]);

    let pageTarget = null;
    for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const res = await fetch('http://127.0.0.1:9223/json/list');
            const list = await res.json();
            pageTarget = list.find(t => t.type === 'page');
            if (pageTarget) break;
        } catch (e) {}
    }

    if (!pageTarget) {
        console.error('Could not connect to Chrome debugging port.');
        chrome.kill();
        server.close();
        process.exit(1);
    }

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let msgId = 1;
    const pending = new Map();

    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = msgId++;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
        }
    };

    ws.onopen = async () => {
        try {
            await send('Page.enable');
            await send('Runtime.enable');

            // Inject mock storage and point API_BASE to localhost:8099 before loading
            await send('Page.addScriptToEvaluateOnNewDocument', {
                source: `
                    localStorage.setItem('kambus_token', 'mock_token_123');
                    localStorage.setItem('kambus_role', 'parent');
                    localStorage.setItem('kambus_user_id', '1');
                    window.KAMBUS_API_BASE = 'http://localhost:8099';
                `
            });

            // Navigate to parent.html
            await send('Page.navigate', { url: 'http://localhost:8099/parent.html' });

            // Wait for load event
            await new Promise(r => setTimeout(r, 2000));

            // Wait until child cards are rendered
            await send('Runtime.evaluate', {
                expression: `
                    new Promise((resolve) => {
                        let count = 0;
                        const interval = setInterval(() => {
                            count++;
                            if (document.querySelectorAll('.child-card').length >= 3 || count > 50) {
                                clearInterval(interval);
                                resolve(true);
                            }
                        }, 100);
                    });
                `,
                awaitPromise: true
            });

            await new Promise(r => setTimeout(r, 800));

            // -------------------------------------------------------------
            // Screenshot 1: Overview showing new section order
            // (Nav tabs bar -> Interactive map block with legend -> Linked Children header -> student cards)
            // -------------------------------------------------------------
            console.log('Capturing Screenshot 1: Section order overview...');
            const shot1 = await send('Page.captureScreenshot', { format: 'png' });
            const path1 = path.join(outDir, '01_parent_section_order.png');
            fs.writeFileSync(path1, Buffer.from(shot1.data, 'base64'));
            console.log('Saved:', path1);

            // -------------------------------------------------------------
            // Screenshot 2: Collapsed Cards view (zoomed in to cards section)
            // -------------------------------------------------------------
            console.log('Capturing Screenshot 2: Collapsed cards...');
            // Scroll to the Linked Children section and cards
            await send('Runtime.evaluate', {
                expression: `
                    document.getElementById('childrenCardsContainer')?.scrollIntoView({ behavior: 'instant', block: 'start' });
                `
            });
            await new Promise(r => setTimeout(r, 400));

            const shot2 = await send('Page.captureScreenshot', { format: 'png' });
            const path2 = path.join(outDir, '02_parent_collapsed_cards.png');
            fs.writeFileSync(path2, Buffer.from(shot2.data, 'base64'));
            console.log('Saved:', path2);

            // -------------------------------------------------------------
            // Screenshot 3: Expanded Card (tap on first card 101)
            // -------------------------------------------------------------
            console.log('Capturing Screenshot 3: Expanded card...');
            await send('Runtime.evaluate', {
                expression: `
                    window.parentApp?.toggleCard?.('101');
                `
            });
            // Wait for smooth expand animation (250ms CSS transition)
            await new Promise(r => setTimeout(r, 600));

            const shot3 = await send('Page.captureScreenshot', { format: 'png' });
            const path3 = path.join(outDir, '03_parent_expanded_card.png');
            fs.writeFileSync(path3, Buffer.from(shot3.data, 'base64'));
            console.log('Saved:', path3);

            console.log('All 3 screenshots captured successfully!');
        } catch (err) {
            console.error('Error during screenshot capture:', err);
        } finally {
            ws.close();
            chrome.kill();
            server.close();
            process.exit(0);
        }
    };
});
