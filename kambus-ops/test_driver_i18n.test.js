const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

describe('Driver App Multilingual Support (English, Hindi, Telugu)', () => {
    function createDriverEnvironment(initialStorage = {}) {
        const storage = { ...initialStorage };
        const storageCalls = {
            getItem: [],
            setItem: []
        };
        const mockLocalStorage = {
            getItem: (key) => {
                storageCalls.getItem.push(key);
                return storage[key] ?? null;
            },
            setItem: (key, val) => {
                storageCalls.setItem.push({ key, val });
                storage[key] = String(val);
            },
            removeItem: (key) => {
                delete storage[key];
            }
        };

        const spokenUtterances = [];
        class MockSpeechSynthesisUtterance {
            constructor(text) {
                this.text = text;
                this.lang = '';
                this.rate = 1;
                this.voice = null;
            }
        }

        const mockSpeechSynthesis = {
            speaking: false,
            cancelCalls: 0,
            cancel() {
                this.cancelCalls++;
                this.speaking = false;
            },
            speak(utterance) {
                spokenUtterances.push(utterance);
            },
            getVoices() {
                return [
                    { lang: 'en-IN', name: 'Google English (India)' },
                    { lang: 'hi-IN', name: 'Google Hindi (India)' },
                    { lang: 'te-IN', name: 'Google Telugu (India)' }
                ];
            }
        };

        const elements = {};
        function getOrCreateElement(id) {
            if (!elements[id]) {
                elements[id] = {
                    id,
                    textContent: '',
                    innerHTML: '',
                    placeholder: '',
                    title: '',
                    attrs: {},
                    classListSet: new Set(),
                    classList: {
                        add(...cls) { cls.forEach(c => elements[id].classListSet.add(c)); },
                        remove(...cls) { cls.forEach(c => elements[id].classListSet.delete(c)); },
                        toggle(c, force) {
                            if (force === undefined) {
                                if (elements[id].classListSet.has(c)) elements[id].classListSet.delete(c);
                                else elements[id].classListSet.add(c);
                            } else if (force) {
                                elements[id].classListSet.add(c);
                            } else {
                                elements[id].classListSet.delete(c);
                            }
                        },
                        contains(c) { return elements[id].classListSet.has(c); }
                    },
                    setAttribute(k, v) { this.attrs[k] = String(v); },
                    getAttribute(k) { return this.attrs[k] ?? null; },
                    disabled: false
                };
            }
            return elements[id];
        }

        // Pre-create standard i18n DOM elements
        const staticI18nElements = [
            { id: 'nextStopCardHeader', 'data-i18n': 'next_stop_header', textContent: 'Next Stop' },
            { id: 'startTripText', 'data-i18n': 'start_trip_select', textContent: 'Select Trip Type' },
            { id: 'scanPassLabel', 'data-i18n': 'scan_pass_btn', textContent: 'Scan Pass' },
            { id: 'detourLabel', 'data-i18n': 'detour_btn', textContent: 'Detour' },
            { id: 'sosLabel', 'data-i18n': 'sos_btn', textContent: 'SOS' },
            { id: 'endTripLabel', 'data-i18n': 'end_trip', textContent: 'End Trip' },
            { id: 'tripActiveLabel', 'data-i18n': 'trip_active', textContent: 'Trip Active' },
            { id: 'collegeEtaLabel', 'data-i18n': 'eta_to_college', textContent: 'ETA to College' },
            { id: 'morningTripTypeBtn', 'data-i18n': 'morning', textContent: 'Morning' },
            { id: 'eveningTripTypeBtn', 'data-i18n': 'evening', textContent: 'Evening' },
        ];

        staticI18nElements.forEach(item => {
            const el = getOrCreateElement(item.id);
            el.setAttribute('data-i18n', item['data-i18n']);
            el.textContent = item.textContent;
        });

        const langButtons = ['langBtnEn', 'langBtnHi', 'langBtnTe'];
        langButtons.forEach(id => getOrCreateElement(id));

        const mockDocument = {
            getElementById: (id) => getOrCreateElement(id),
            querySelectorAll: (selector) => {
                if (selector === '[data-i18n]') {
                    return Object.values(elements).filter(el => el.getAttribute('data-i18n') !== null);
                }
                if (selector === '[data-i18n-placeholder]') {
                    return Object.values(elements).filter(el => el.getAttribute('data-i18n-placeholder') !== null);
                }
                if (selector === '[data-i18n-title]') {
                    return Object.values(elements).filter(el => el.getAttribute('data-i18n-title') !== null);
                }
                if (selector === '[data-i18n-aria]') {
                    return Object.values(elements).filter(el => el.getAttribute('data-i18n-aria') !== null);
                }
                if (selector === '.detourReasonBtn' || selector === '.detourDelayBtn' || selector === '.sosTypeBtn') {
                    return [];
                }
                return [];
            },
            addEventListener: () => {},
            documentElement: {
                lang: 'en',
                style: { setProperty() {} },
                classList: { add() {}, remove() {}, toggle() {} }
            }
        };

        const mockWindow = {
            fetch: async () => ({ ok: true, json: async () => ({}) }),
            location: { replace() {} },
            addEventListener() {},
            localStorage: mockLocalStorage,
            speechSynthesis: mockSpeechSynthesis,
            SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
            __driverRouteStopsLoadedFromLogin: false
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
            marker: (latlng, opts) => ({
                latlng, opts, stopData: null, popupContent: '',
                bindPopup(html) { this.popupContent = html; return this; },
                setIcon(icon) { this.icon = icon; return this; },
                setZIndexOffset(z) { this.zIndexOffset = z; return this; },
                setLatLng(ll) { this.latlng = ll; return this; }
            })
        };

        const mockVoiceAnnouncer = {
            checkProximityAnnouncement() {},
            checkWaitRequestAnnouncement() {},
            resetWaitDedup() {},
            setEnabled() {}
        };

        const driverJsPath = path.join(__dirname, 'app/src/main/assets/driver.js');
        const driverJsContent = fs.readFileSync(driverJsPath, 'utf8');

        const context = {
            window: mockWindow,
            document: mockDocument,
            localStorage: mockLocalStorage,
            L: mockLeaflet,
            VoiceAnnouncer: mockVoiceAnnouncer,
            SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
            console,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
            module: { exports: {} },
            exports: {}
        };

        vm.createContext(context);
        vm.runInContext(driverJsContent, context);

        return {
            exports: context.module.exports,
            elements,
            storage,
            storageCalls,
            spokenUtterances,
            doc: mockDocument
        };
    }

    test('Translation Dictionary Integrity: 100% key parity across EN, HI, and TE', () => {
        const { exports } = createDriverEnvironment();
        const { TRANSLATIONS } = exports;

        assert.ok(TRANSLATIONS, 'TRANSLATIONS dictionary must exist');
        assert.ok(TRANSLATIONS.en, 'TRANSLATIONS.en must exist');
        assert.ok(TRANSLATIONS.hi, 'TRANSLATIONS.hi must exist');
        assert.ok(TRANSLATIONS.te, 'TRANSLATIONS.te must exist');

        const enKeys = Object.keys(TRANSLATIONS.en);
        const hiKeys = Object.keys(TRANSLATIONS.hi);
        const teKeys = Object.keys(TRANSLATIONS.te);

        assert.ok(enKeys.length >= 180, `Expected at least 180 keys, found ${enKeys.length}`);

        const missingInHi = enKeys.filter(k => !(k in TRANSLATIONS.hi));
        const missingInTe = enKeys.filter(k => !(k in TRANSLATIONS.te));

        assert.deepEqual(missingInHi, [], `Missing Hindi keys: ${missingInHi.join(', ')}`);
        assert.deepEqual(missingInTe, [], `Missing Telugu keys: ${missingInTe.join(', ')}`);

        // Check no empty translations
        for (const k of enKeys) {
            assert.ok(typeof TRANSLATIONS.en[k] === 'string' && TRANSLATIONS.en[k].length > 0, `Empty EN key: ${k}`);
            assert.ok(typeof TRANSLATIONS.hi[k] === 'string' && TRANSLATIONS.hi[k].length > 0, `Empty HI key: ${k}`);
            assert.ok(typeof TRANSLATIONS.te[k] === 'string' && TRANSLATIONS.te[k].length > 0, `Empty TE key: ${k}`);
        }
    });

    test('t(key, params) correctly translates and interpolates parameters in all 3 languages', () => {
        const env = createDriverEnvironment();
        const { t, setLanguage } = env.exports;

        // English
        setLanguage('en');
        assert.equal(t('stops_count', { count: 6 }), '6 stops');
        assert.equal(t('stop_order_badge', { order: 2, total: 8 }), 'Stop 2 of 8');
        assert.equal(t('next_stop_eta', { min: 7 }), 'ETA: ~7 min');

        // Hindi
        setLanguage('hi');
        assert.equal(t('stops_count', { count: 6 }), '6 स्टॉप');
        assert.equal(t('stop_order_badge', { order: 2, total: 8 }), 'स्टॉप 2/8');
        assert.equal(t('next_stop_eta', { min: 7 }), 'ETA: ~7 मिनट');

        // Telugu
        setLanguage('te');
        assert.equal(t('stops_count', { count: 6 }), '6 స్టాప్‌లు');
        assert.equal(t('stop_order_badge', { order: 2, total: 8 }), 'స్టాప్ 2/8');
        assert.equal(t('next_stop_eta', { min: 7 }), 'ETA: ~7 నిమి');
    });

    test('Language switcher dynamically updates DOM text without page reload', () => {
        const env = createDriverEnvironment();
        const { setLanguage } = env.exports;
        const { elements, doc } = env;

        // Switch to Hindi
        setLanguage('hi');
        assert.equal(doc.documentElement.lang, 'hi');
        assert.equal(elements.nextStopCardHeader.textContent, 'अगला स्टॉप');
        assert.equal(elements.scanPassLabel.textContent, 'पास स्कैन');
        assert.equal(elements.detourLabel.textContent, 'डायवर्जन');
        assert.equal(elements.sosLabel.textContent, 'SOS');
        assert.equal(elements.endTripLabel.textContent, 'यात्रा समाप्त');
        assert.equal(elements.tripActiveLabel.textContent, 'यात्रा सक्रिय');

        // Verify switcher button state
        assert.equal(elements.langBtnHi.attrs['aria-pressed'], 'true');
        assert.equal(elements.langBtnEn.attrs['aria-pressed'], 'false');
        assert.equal(elements.langBtnTe.attrs['aria-pressed'], 'false');

        // Switch to Telugu
        setLanguage('te');
        assert.equal(doc.documentElement.lang, 'te');
        assert.equal(elements.nextStopCardHeader.textContent, 'తదుపరి స్టాప్');
        assert.equal(elements.scanPassLabel.textContent, 'పాస్ స్కాన్');
        assert.equal(elements.detourLabel.textContent, 'మళ్లింపు');
        assert.equal(elements.sosLabel.textContent, 'SOS');
        assert.equal(elements.endTripLabel.textContent, 'ట్రిప్ ముగించు');
        assert.equal(elements.tripActiveLabel.textContent, 'ట్రిప్ యాక్టివ్');

        // Verify switcher button state
        assert.equal(elements.langBtnTe.attrs['aria-pressed'], 'true');
        assert.equal(elements.langBtnHi.attrs['aria-pressed'], 'false');
        assert.equal(elements.langBtnEn.attrs['aria-pressed'], 'false');

        // Switch back to English
        setLanguage('en');
        assert.equal(doc.documentElement.lang, 'en');
        assert.equal(elements.nextStopCardHeader.textContent, 'Next Stop');
        assert.equal(elements.scanPassLabel.textContent, 'Scan Pass');
        assert.equal(elements.detourLabel.textContent, 'Detour');
        assert.equal(elements.endTripLabel.textContent, 'End Trip');
    });

    test('localStorage persistence remembers driver choice across simulated app restarts', () => {
        // Initial session: driver switches to Telugu
        const env1 = createDriverEnvironment();
        env1.exports.setLanguage('te');
        assert.equal(env1.storage['kambus_driver_lang'], 'te');

        // Next session / simulated restart: app boots with kambus_driver_lang="te" in storage
        const env2 = createDriverEnvironment({ 'kambus_driver_lang': 'te' });
        assert.equal(env2.exports.getCurrentLanguage(), 'te');
        assert.equal(env2.exports.getVoiceLangCode(), 'te-IN');

        // Initial session: driver switches to Hindi
        const env3 = createDriverEnvironment({ 'kambus_driver_lang': 'hi' });
        assert.equal(env3.exports.getCurrentLanguage(), 'hi');
        assert.equal(env3.exports.getVoiceLangCode(), 'hi-IN');
    });

    test('Multilingual Voice Announcements set correct lang codes (en-IN, hi-IN, te-IN)', () => {
        const env = createDriverEnvironment();
        const { setLanguage, speakVoiceAnnouncement, getVoiceLangCode } = env.exports;

        // Test English voice
        setLanguage('en');
        assert.equal(getVoiceLangCode(), 'en-IN');
        speakVoiceAnnouncement('Next stop Subedari, 3 students', 2);
        assert.equal(env.spokenUtterances.length, 1);
        assert.equal(env.spokenUtterances[0].lang, 'en-IN');
        assert.equal(env.spokenUtterances[0].text, 'Next stop Subedari, 3 students');

        // Test Hindi voice
        setLanguage('hi');
        assert.equal(getVoiceLangCode(), 'hi-IN');
        speakVoiceAnnouncement('अगला स्टॉप सूबेदारी, 3 छात्र', 2);
        assert.equal(env.spokenUtterances.length, 2);
        assert.equal(env.spokenUtterances[1].lang, 'hi-IN');
        assert.equal(env.spokenUtterances[1].text, 'अगला स्टॉप सूबेदारी, 3 छात्र');

        // Test Telugu voice
        setLanguage('te');
        assert.equal(getVoiceLangCode(), 'te-IN');
        speakVoiceAnnouncement('తదుపరి స్టాప్ సుబేదారి, 3 విద్యార్థులు', 2);
        assert.equal(env.spokenUtterances.length, 3);
        assert.equal(env.spokenUtterances[2].lang, 'te-IN');
        assert.equal(env.spokenUtterances[2].text, 'తదుపరి స్టాప్ సుబేదారి, 3 విద్యార్థులు');
    });

    test('Conciseness and Layout constraints on Action Buttons and Collapsed Summary', () => {
        const { exports } = createDriverEnvironment();
        const { TRANSLATIONS } = exports;

        // Action buttons: Scan Pass, Detour, SOS, End Trip
        // These are placed in compact grid columns (approx 70-80px wide on phones)
        const btnKeys = ['scan_pass_btn', 'detour_btn', 'sos_btn', 'end_trip'];
        for (const lang of ['en', 'hi', 'te']) {
            for (const key of btnKeys) {
                const text = TRANSLATIONS[lang][key];
                // Length check: ensure button text is under 18 characters to prevent overflow / awkward multi-line break
                assert.ok(text.length <= 18, `Button label too long in ${lang} for ${key}: "${text}" (${text.length} chars)`);
            }
        }

        // Collapsed summary bar text: single-line, no newlines
        const summaryKeys = ['summary_exp', 'summary_stats', 'summary_passed_ratio', 'duration_approx_min'];
        for (const lang of ['en', 'hi', 'te']) {
            for (const key of summaryKeys) {
                const text = TRANSLATIONS[lang][key];
                assert.ok(!text.includes('\n'), `Summary string in ${lang} contains newline: ${key}`);
            }
        }
    });
});
