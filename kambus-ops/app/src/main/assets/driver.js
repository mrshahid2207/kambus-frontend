// ========================================================================
// KAMBUS - Driver Live Dashboard & Active Trip Controller
// ========================================================================

const API_BASE = "https://kambus-backend.onrender.com";
const OSRM_BASE = "https://kambus-orsm.onrender.com";

// Sign out and return to the login screen when the server rejects the saved token
(function () {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function (...args) {
        const response = await nativeFetch(...args);
        try {
            const input = args[0];
            const url = typeof input === "string" ? input : (input && (input.url || input.href)) || "";
            if (response.status === 401 && url.startsWith(API_BASE) && !window.__kambusSigningOut) {
                window.__kambusSigningOut = true;
                localStorage.removeItem("kambus_token");
                localStorage.removeItem("kambus_role");
                localStorage.removeItem("kambus_user_id");
                localStorage.removeItem("kambus_driver_dashboard");
                if (window.AndroidSession && typeof window.AndroidSession.clearSession === "function") {
                    try { window.AndroidSession.clearSession(); } catch (_) {}
                }
                window.location.replace("index.html");
            }
        } catch (e) { /* never break the original request */ }
        return response;
    };
})();

function getInitialDriverDashboard() {
    try {
        const raw = localStorage.getItem("kambus_driver_dashboard");
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

// ========================================================================
// MULTILINGUAL TRANSLATION SYSTEM (EN / HI / TE)
// ========================================================================

const TRANSLATIONS = {
    en: {
        // App & Header
        app_title: "KAMBUS",
        bus_badge: "Bus {num}",
        driver_default: "Driver",
        status_offline: "Offline",
        status_gps_not_active: "GPS not active",
        status_gps_paused: "GPS Paused",
        status_updates_suspended: "Updates suspended",
        status_acquiring_gps: "Acquiring GPS",
        status_waiting_fix: "Waiting for first fix…",
        status_live: "LIVE",
        status_sending_elapsed: "Sending • {s}s ago",
        status_slow_gps: "Slow GPS",
        logout: "Logout",

        // Banners
        emergency_sos_active: "EMERGENCY SOS ACTIVE",
        call_112: "Call 112",
        clear: "Clear",
        active_detour: "Active Detour",
        clear_detour: "Clear Detour",
        active_detour_banner_text: "Active Detour: {reason} (+{delay} min delay)",
        active_sos_banner_text: "SOS ACTIVE: {type} — Authorities & Dispatch Alerted",

        // Map controls & badges
        route_preview_ready: "Route Preview • Ready",
        trip_active_live_gps: "Trip Active • Live GPS",
        road_route_active: "Road Route Active",
        road_route_unavailable: "Road Route Unavailable",
        nav_mode: "Nav Mode",
        overview: "Overview",
        recenter: "Recenter",
        title_nav_mode: "Current: Bearing-Up Nav Camera (Click for Flat Overview)",
        title_overview: "Current: Flat Overview (Click for Bearing-Up Nav Camera)",

        // Pre-trip view
        assigned_route: "Assigned Route",
        stops_count: "{count} stops",
        stop_count_single: "1 stop",
        loading_route: "Loading assigned route...",
        first_stop_label: "First Stop:",
        route_stops_ready: "Route stops ready",
        ready: "Ready",
        select_trip_type: "Select trip type",
        morning: "Morning",
        evening: "Evening",
        start_trip_select: "Select Trip Type",
        start_morning_trip: "START MORNING TRIP",
        start_evening_trip: "START EVENING TRIP",
        starting_trip: "STARTING TRIP…",
        scan_pass_title: "Scan Pass",
        verify_student_sub: "Verify student",
        report_detour_title: "Report Detour",
        road_diversion_sub: "Road diversion",
        sos_breakdown_footer: "Emergency SOS / Breakdown",

        // Active Trip View - Next Stop Card
        next_stop_header: "Next Stop",
        finding_next_stop: "Finding next stop...",
        all_stops_completed: "All stops completed",
        trip_complete: "Trip Complete",
        final_destination: "Final Destination",
        stop_order_badge: "Stop {order} of {total}",
        stop_order_badge_final: "Stop {order} of {total} (Final Stop)",
        next_stop_eta: "ETA: ~{min} min",
        students_expected: "{count} students expected",
        student_expected_single: "1 student expected",
        no_pickups_badge: "No pickups",
        no_pickups_expected: "No pickups expected (All not travelling)",
        route_stops_header: "Route Stops",

        // Trip Summary Bar (Collapsed & Expanded)
        college_label: "College",
        final_stop_label: "Final Stop",
        eta_to_college: "ETA to College",
        eta_to_final_stop: "ETA to Final Stop",
        duration_approx_min: "~{min} min",
        summary_college_eta: "~{min} min ({time})",
        expected_abbrev: "exp",
        summary_exp: "{count} exp",
        summary_stats: "Stats",
        summary_passed_ratio: "{passed}/{total} passed",
        passed_count: "{count} passed",
        remaining_count: "{count} remaining",
        today: "Today",
        expected: "expected",
        next_stop_prefix: "Next: {name}",
        to_college: "To College",

        // Driver Actions Row & Trip Active Bar
        scan_pass_btn: "Scan Pass",
        detour_btn: "Detour",
        sos_btn: "SOS",
        trip_active: "Trip Active",
        end_trip: "End Trip",

        // Wait Request Card
        wait_request: "Wait Request",
        wait_request_title: "WAIT REQUEST — {stop}",
        upcoming_stop: "Upcoming Stop",
        wait_students_waiting: "• {count} {student_str} waiting ({min} min)",
        student_singular: "student",
        students_plural: "students",
        skip: "Skip",
        wait_accepted_arrival: "Accepted — waiting for arrival",
        wait_continue_trip: "Continue your trip",
        wait_resume_in: "Waiting — resume in {min}:{sec}",
        auto_accepting_soon: "Auto-accepting soon…",
        auto_accepted: "Auto-accepted",
        auto_accepting_in: "Auto-accepting in {time}",

        // Pass Scanner Modal
        scan_pass_modal_title: "Scan Student Pass",
        scanner_instruction: "Position student barcode in front of camera",
        start_camera: "Start Camera",
        upload: "Upload",
        or_enter_roll: "Or Enter Roll Number",
        verify: "Verify",
        checking: "Checking…",
        pass_valid_active: "PASS VALID & ACTIVE",
        marked_not_travelling: "MARKED NOT TRAVELLING",
        just_now: "Just now",
        stop_label: "Stop:",
        bus_label: "Bus:",
        invalid_pass: "Invalid Pass",
        invalid_pass_title: "Invalid Student Pass",
        student_not_assigned_bus: "Student not assigned to this bus.",
        student_not_found_assigned: "Student not found or assigned to another bus.",
        network_error: "Network error communicating with server.",

        // Detour Modal
        report_detour_modal_title: "Report Route Detour",
        reason_for_detour: "Reason for Detour",
        detour_road_work: "Road Work",
        detour_traffic_jam: "Traffic Jam",
        detour_weather: "Weather",
        detour_road_closed: "Road Closed",
        estimated_delay: "Estimated Delay",
        broadcast_detour_btn: "Broadcast Detour to Students & Admin",
        broadcasting: "Broadcasting…",

        // Emergency SOS Modal
        sos_modal_title: "Emergency SOS / Breakdown",
        select_incident_type: "Select Incident Type",
        sos_breakdown: "Breakdown",
        sos_medical: "Medical",
        sos_accident: "Accident",
        sos_security: "Security",
        college_transport_cell: "College Transport Cell",
        police_emergency: "Police / Emergency",
        transmit_sos_btn: "Transmit Emergency SOS",
        transmitting_sos: "Transmitting SOS…",

        // End Trip Confirmation Dialog
        confirm_end_trip_title: "End this trip?",
        confirm_end_trip_msg: "Your live location sharing will stop.",
        confirm_logout_active_trip: "You have an active trip in progress. Are you sure you want to log out? The trip will be ended automatically.",
        confirm_end_trip_ok: "End Trip",
        cancel: "Cancel",

        // Trusted Device Modal
        trusted_device_title: "Trust this device?",
        trusted_device_prompt: "Do you trust this device? If yes, this becomes your primary device and other sessions will be signed out.",
        trusted_device_confirm: "Yes, trust this device",
        trusted_device_dismiss: "Not now",
        device_trusted_success: "Device marked as trusted",

        // Toasts & Notifications
        toast_select_trip_type: "Select trip type",
        toast_select_trip_msg: "Choose Morning or Evening before starting the trip.",
        toast_session_expired: "Session expired",
        toast_session_expired_msg: "Please login again.",
        toast_bus_not_assigned: "Bus not assigned",
        toast_bus_not_assigned_msg: "No bus assignment found for your driver account.",
        toast_trip_started: "Trip started",
        toast_trip_started_msg: "Live GPS sharing has started.",
        toast_unable_start_trip: "Unable to start trip",
        toast_unable_start_trip_msg: "Please check your connection.",
        toast_trip_ended: "Trip ended",
        toast_trip_ended_msg: "Live location sharing stopped.",
        toast_unable_end_trip: "Unable to end trip",
        toast_unable_end_trip_msg: "Please try again.",
        toast_gps_not_supported: "GPS not supported",
        toast_gps_not_supported_msg: "Geolocation is not supported on this device.",
        toast_bus_reassigned: "Bus reassigned",
        toast_bus_reassigned_msg: "You are no longer assigned to this bus. Please log in again to continue.",
        toast_wait_skipped: "Wait skipped",
        toast_wait_skipped_msg: "Wait request at {stop} was skipped.",
        toast_skip_failed: "Skip failed",
        toast_skip_failed_msg: "Please try again.",
        toast_student_boarded: "Student boarded",
        toast_student_boarded_msg: "Passenger marked as boarded. You can proceed.",
        toast_complete_wait_failed_msg: "Unable to complete wait early. Please try again.",
        wait_continue_now: "Student Boarded",
        toast_camera_access: "Camera Access",
        toast_camera_access_msg: "Camera not available. Please enter the Roll Number or upload a pass image.",
        toast_barcode_scanner_unavailable: "Barcode scanner unavailable",
        toast_enter_roll_manually: "Please enter the Roll Number manually.",
        toast_pass_image_selected: "Pass image selected",
        toast_pass_image_selected_msg: "Please enter the roll number directly below to verify.",
        toast_qr_not_detected: "QR Not Detected",
        toast_qr_not_detected_msg: "Could not read QR from the uploaded image. Please enter roll number.",
        toast_roll_required: "Roll Number Required",
        toast_roll_required_msg: "Please enter a valid student roll number.",
        toast_invalid_scanner_val: "Invalid scanner value",
        toast_invalid_scanner_msg: "The scanner returned an image frame instead of a barcode value. Please scan again or enter the Roll Number.",
        toast_student_verified: "Student Verified",
        toast_student_verified_msg: "{name} ({roll}) boarded for {stop}.",
        toast_pass_invalid: "Pass Invalid",
        toast_pass_invalid_msg: "Student pass could not be verified.",
        toast_detour_broadcasted: "Detour Broadcasted",
        toast_detour_cleared: "Detour Cleared",
        toast_detour_cleared_msg: "Normal route travel resumed.",
        toast_sos_dispatched: "EMERGENCY SOS DISPATCHED",
        toast_sos_dispatched_msg: "College Transport Cell & Emergency services notified of {type}.",
        toast_sos_cleared: "Emergency Status Cleared",
        toast_sos_cleared_msg: "SOS alert has been stood down.",

        // Voice Announcements
        voice_next_stop_singular: "Next stop {name}, 1 student",
        voice_next_stop_plural: "Next stop {name}, {count} students",
        voice_no_need_stop: "No need to stop at {name}, no student coming in bus",
        voice_wait_request: "{stop} stop, bus will stop for {minutes} {unit}",
        min_singular: "min",
        min_plural: "mins"
    },
    hi: {
        // App & Header
        app_title: "KAMBUS",
        bus_badge: "बस {num}",
        driver_default: "ड्राइवर",
        status_offline: "ऑफ़लाइन",
        status_gps_not_active: "जीपीएस सक्रिय नहीं",
        status_gps_paused: "जीपीएस रुका हुआ",
        status_updates_suspended: "अपडेट निलंबित",
        status_acquiring_gps: "जीपीएस खोज रहा है",
        status_waiting_fix: "सिग्नल की प्रतीक्षा…",
        status_live: "लाइव",
        status_sending_elapsed: "भेज रहा है • {s} से. पहले",
        status_slow_gps: "धीमा जीपीएस",
        logout: "लॉग आउट",

        // Banners
        emergency_sos_active: "आपातकालीन SOS सक्रिय",
        call_112: "112 पर कॉल करें",
        clear: "हटाएं",
        active_detour: "सक्रिय डायवर्जन",
        clear_detour: "डायवर्जन हटाएं",
        active_detour_banner_text: "सक्रिय डायवर्जन: {reason} (+{delay} मिनट देरी)",
        active_sos_banner_text: "SOS सक्रिय: {type} — अधिकारियों और नियंत्रण कक्ष को सूचित किया गया",

        // Map controls & badges
        route_preview_ready: "मार्ग पूर्वावलोकन • तैयार",
        trip_active_live_gps: "यात्रा सक्रिय • लाइव जीपीएस",
        road_route_active: "सड़क मार्ग सक्रिय",
        road_route_unavailable: "सड़क मार्ग अनुपलब्ध",
        nav_mode: "नेव मोड",
        overview: "अवलोकन",
        recenter: "पुनः केंद्रित करें",
        title_nav_mode: "वर्तमान: नेविगेशन कैमरा (अवलोकन के लिए क्लिक करें)",
        title_overview: "वर्तमान: अवलोकन (नेविगेशन कैमरा के लिए क्लिक करें)",

        // Pre-trip view
        assigned_route: "आवंटित मार्ग",
        stops_count: "{count} स्टॉप",
        stop_count_single: "1 स्टॉप",
        loading_route: "आवंटित मार्ग लोड हो रहा है...",
        first_stop_label: "पहला स्टॉप:",
        route_stops_ready: "रूट के स्टॉप तैयार",
        ready: "तैयार",
        select_trip_type: "यात्रा का प्रकार चुनें",
        morning: "सुबह",
        evening: "शाम",
        start_trip_select: "यात्रा का प्रकार चुनें",
        start_morning_trip: "सुबह की यात्रा शुरू करें",
        start_evening_trip: "शाम की यात्रा शुरू करें",
        starting_trip: "यात्रा शुरू हो रही है…",
        scan_pass_title: "पास स्कैन",
        verify_student_sub: "छात्र सत्यापित करें",
        report_detour_title: "डायवर्जन रिपोर्ट करें",
        road_diversion_sub: "सड़क डायवर्जन",
        sos_breakdown_footer: "आपातकालीन SOS / खराबी",

        // Active Trip View - Next Stop Card
        next_stop_header: "अगला स्टॉप",
        finding_next_stop: "अगला स्टॉप खोजा जा रहा है...",
        all_stops_completed: "सभी स्टॉप पूरे हुए",
        trip_complete: "यात्रा पूर्ण",
        final_destination: "अंतिम गंतव्य",
        stop_order_badge: "स्टॉप {order}/{total}",
        stop_order_badge_final: "स्टॉप {order}/{total} (अंतिम)",
        next_stop_eta: "ETA: ~{min} मिनट",
        students_expected: "{count} छात्र अपेक्षित",
        student_expected_single: "1 छात्र अपेक्षित",
        no_pickups_badge: "कोई पिकअप नहीं",
        no_pickups_expected: "कोई छात्र अपेक्षित नहीं (सभी अनुपस्थित)",
        route_stops_header: "रूट के स्टॉप",

        // Trip Summary Bar (Collapsed & Expanded)
        college_label: "कॉलेज",
        final_stop_label: "अंतिम स्टॉप",
        eta_to_college: "कॉलेज पहुंचने का समय",
        eta_to_final_stop: "अंतिम स्टॉप का समय",
        duration_approx_min: "~{min} मिनट",
        summary_college_eta: "~{min} मिनट ({time})",
        expected_abbrev: "छात्र",
        summary_exp: "{count} छात्र",
        summary_stats: "विवरण",
        summary_passed_ratio: "{passed}/{total} पार",
        passed_count: "{count} पार हुए",
        remaining_count: "{count} शेष",
        today: "आज",
        expected: "अपेक्षित",
        next_stop_prefix: "अगला: {name}",
        to_college: "कॉलेज की ओर",

        // Driver Actions Row & Trip Active Bar
        scan_pass_btn: "पास स्कैन",
        detour_btn: "डायवर्जन",
        sos_btn: "SOS",
        trip_active: "यात्रा सक्रिय",
        end_trip: "यात्रा समाप्त",

        // Wait Request Card
        wait_request: "रुकने का अनुरोध",
        wait_request_title: "रुकने का अनुरोध — {stop}",
        upcoming_stop: "आगामी स्टॉप",
        wait_students_waiting: "• {count} छात्र प्रतीक्षा में ({min} मिनट)",
        student_singular: "छात्र",
        students_plural: "छात्र",
        skip: "छोड़ें",
        wait_accepted_arrival: "स्वीकृत — पहुंचने की प्रतीक्षा",
        wait_continue_trip: "अपनी यात्रा जारी रखें",
        wait_resume_in: "प्रतीक्षा — {min}:{sec} में आगे बढ़ें",
        auto_accepting_soon: "शीघ्र ही स्वतः स्वीकार…",
        auto_accepted: "स्वतः स्वीकृत",
        auto_accepting_in: "{time} में स्वतः स्वीकार",

        // Pass Scanner Modal
        scan_pass_modal_title: "छात्र पास स्कैन करें",
        scanner_instruction: "छात्र का बारकोड कैमरे के सामने रखें",
        start_camera: "कैमरा चालू करें",
        upload: "अपलोड",
        or_enter_roll: "या रोल नंबर दर्ज करें",
        verify: "सत्यापित करें",
        checking: "जांच जारी है…",
        pass_valid_active: "पास वैध एवं सक्रिय",
        marked_not_travelling: "यात्रा नहीं कर रहे",
        just_now: "अभी-अभी",
        stop_label: "स्टॉप:",
        bus_label: "बस:",
        invalid_pass: "अमान्य पास",
        invalid_pass_title: "अमान्य छात्र पास",
        student_not_assigned_bus: "छात्र इस बस में आवंटित नहीं है।",
        student_not_found_assigned: "छात्र नहीं मिला या दूसरी बस में आवंटित है।",
        network_error: "सर्वर से संपर्क करने में त्रुटि।",

        // Detour Modal
        report_detour_modal_title: "रूट डायवर्जन रिपोर्ट करें",
        reason_for_detour: "डायवर्जन का कारण",
        detour_road_work: "सड़क कार्य",
        detour_traffic_jam: "ट्रैफिक जाम",
        detour_weather: "खराब मौसम",
        detour_road_closed: "सड़क बंद",
        estimated_delay: "अनुमानित देरी",
        broadcast_detour_btn: "छात्रों और एडमिन को डायवर्जन भेजें",
        broadcasting: "भेजा जा रहा है…",

        // Emergency SOS Modal
        sos_modal_title: "आपातकालीन SOS / खराबी",
        select_incident_type: "घटना का प्रकार चुनें",
        sos_breakdown: "बस खराबी",
        sos_medical: "चिकित्सा",
        sos_accident: "दुर्घटना",
        sos_security: "सुरक्षा",
        college_transport_cell: "कॉलेज परिवहन विभाग",
        police_emergency: "पुलिस / आपातकालीन",
        transmit_sos_btn: "आपातकालीन SOS भेजें",
        transmitting_sos: "SOS भेजा जा रहा है…",

        // End Trip Confirmation Dialog
        confirm_end_trip_title: "क्या यात्रा समाप्त करें?",
        confirm_end_trip_msg: "आपकी लाइव लोकेशन शेयरिंग बंद हो जाएगी।",
        confirm_logout_active_trip: "आपकी यात्रा अभी सक्रिय है। क्या आप वाकई लॉग आउट करना चाहते हैं? यात्रा स्वतः समाप्त हो जाएगी।",
        confirm_end_trip_ok: "यात्रा समाप्त करें",
        cancel: "रद्द करें",

        // Trusted Device Modal
        trusted_device_title: "क्या आप इस डिवाइस पर भरोसा करते हैं?",
        trusted_device_prompt: "क्या आप इस डिवाइस पर भरोसा करते हैं? यदि हाँ, तो यह आपका प्राथमिक डिवाइस बन जाएगा और अन्य सत्र साइन आउट हो जाएंगे।",
        trusted_device_confirm: "हाँ, इस डिवाइस पर भरोसा करें",
        trusted_device_dismiss: "अभी नहीं",
        device_trusted_success: "डिवाइस को आपके विश्वसनीय प्राथमिक डिवाइस के रूप में चिह्नित किया गया है।",

        // Toasts & Notifications
        toast_select_trip_type: "यात्रा का प्रकार चुनें",
        toast_select_trip_msg: "यात्रा शुरू करने से पहले सुबह या शाम चुनें।",
        toast_session_expired: "सत्र समाप्त",
        toast_session_expired_msg: "कृपया पुनः लॉगिन करें।",
        toast_bus_not_assigned: "बस आवंटित नहीं",
        toast_bus_not_assigned_msg: "आपके ड्राइवर खाते के लिए कोई बस नहीं मिली।",
        toast_trip_started: "यात्रा शुरू हुई",
        toast_trip_started_msg: "लाइव जीपीएस शेयरिंग शुरू हो गई है।",
        toast_unable_start_trip: "यात्रा शुरू करने में असमर्थ",
        toast_unable_start_trip_msg: "कृपया अपना कनेक्शन जांचें।",
        toast_trip_ended: "यात्रा समाप्त",
        toast_trip_ended_msg: "लाइव लोकेशन शेयरिंग बंद कर दी गई।",
        toast_unable_end_trip: "यात्रा समाप्त करने में असमर्थ",
        toast_unable_end_trip_msg: "कृपया पुनः प्रयास करें।",
        toast_gps_not_supported: "जीपीएस समर्थित नहीं",
        toast_gps_not_supported_msg: "इस डिवाइस पर जियोलोकेशन समर्थित नहीं है।",
        toast_bus_reassigned: "बस पुनः आवंटित",
        toast_bus_reassigned_msg: "आप अब इस बस में नियुक्त नहीं हैं। जारी रखने के लिए कृपया पुनः लॉगिन करें।",
        toast_wait_skipped: "प्रतीक्षा छोड़ी गई",
        toast_wait_skipped_msg: "{stop} पर रुकने का अनुरोध छोड़ दिया गया।",
        toast_skip_failed: "छोड़ना विफल",
        toast_skip_failed_msg: "कृपया पुनः प्रयास करें।",
        toast_student_boarded: "छात्र सवार हुआ",
        toast_student_boarded_msg: "यात्री सवार हो गया है। आप आगे बढ़ सकते हैं।",
        toast_complete_wait_failed_msg: "प्रतीक्षा समाप्त नहीं की जा सकी। कृपया पुनः प्रयास करें।",
        wait_continue_now: "छात्र सवार हुआ",
        toast_camera_access: "कैमरा एक्सेस",
        toast_camera_access_msg: "कैमरा उपलब्ध नहीं है। कृपया रोल नंबर दर्ज करें या पास अपलोड करें।",
        toast_barcode_scanner_unavailable: "बारकोड स्कैनर अनुपलब्ध",
        toast_enter_roll_manually: "कृपया रोल नंबर मैन्युअल रूप से दर्ज करें।",
        toast_pass_image_selected: "पास छवि चुनी गई",
        toast_pass_image_selected_msg: "सत्यापित करने के लिए कृपया नीचे सीधे रोल नंबर दर्ज करें।",
        toast_qr_not_detected: "QR नहीं मिला",
        toast_qr_not_detected_msg: "अपलोड की गई छवि से QR नहीं पढ़ा जा सका। कृपया रोल नंबर दर्ज करें।",
        toast_roll_required: "रोल नंबर आवश्यक",
        toast_roll_required_msg: "कृपया एक मान्य छात्र रोल नंबर दर्ज करें।",
        toast_invalid_scanner_val: "अमान्य स्कैनर मान",
        toast_invalid_scanner_msg: "स्कैनर ने बारकोड के बजाय छवि भेजी। कृपया पुनः स्कैन करें या रोल नंबर दर्ज करें।",
        toast_student_verified: "छात्र सत्यापित",
        toast_student_verified_msg: "{name} ({roll}) {stop} के लिए बस में चढ़े।",
        toast_pass_invalid: "पास अमान्य",
        toast_pass_invalid_msg: "छात्र पास सत्यापित नहीं किया जा सका।",
        toast_detour_broadcasted: "डायवर्जन भेजा गया",
        toast_detour_cleared: "डायवर्जन समाप्त",
        toast_detour_cleared_msg: "सामान्य मार्ग यात्रा फिर से शुरू हुई।",
        toast_sos_dispatched: "आपातकालीन SOS भेजा गया",
        toast_sos_dispatched_msg: "कॉलेज परिवहन विभाग और आपातकालीन सेवाओं को {type} की सूचना दी गई।",
        toast_sos_cleared: "आपातकालीन स्थिति समाप्त",
        toast_sos_cleared_msg: "SOS अलर्ट वापस ले लिया गया है।",

        // Voice Announcements
        voice_next_stop_singular: "अगला स्टॉप {name}, 1 छात्र",
        voice_next_stop_plural: "अगला स्टॉप {name}, {count} छात्र",
        voice_no_need_stop: "{name} पर रुकने की आवश्यकता नहीं है, कोई छात्र नहीं है",
        voice_wait_request: "{stop} स्टॉप, बस {minutes} मिनट के लिए रुकेगी",
        min_singular: "मिनट",
        min_plural: "मिनट"
    },
    te: {
        // App & Header
        app_title: "KAMBUS",
        bus_badge: "బస్సు {num}",
        driver_default: "డ్రైవర్",
        status_offline: "ఆఫ్‌లైన్",
        status_gps_not_active: "GPS సక్రియంగా లేదు",
        status_gps_paused: "GPS పాజ్ చేయబడింది",
        status_updates_suspended: "అప్‌డేట్‌లు నిలిపివేయబడ్డాయి",
        status_acquiring_gps: "GPS పొందుతోంది",
        status_waiting_fix: "సిగ్నల్ కోసం వేచి ఉంది…",
        status_live: "లైవ్",
        status_sending_elapsed: "పంపిస్తోంది • {s} సెకన్ల క్రితం",
        status_slow_gps: "స్లో GPS",
        logout: "లాగ్ అవుట్",

        // Banners
        emergency_sos_active: "ఎమర్జెన్సీ SOS యాక్టివ్",
        call_112: "112కి కాల్ చేయండి",
        clear: "క్లియర్",
        active_detour: "యాక్టివ్ మళ్లింపు",
        clear_detour: "మళ్లింపు తొలగించు",
        active_detour_banner_text: "యాక్టివ్ మళ్లింపు: {reason} (+{delay} నిమి ఆలస్యం)",
        active_sos_banner_text: "SOS యాక్టివ్: {type} — అధికారులు & డిస్పాచ్‌కు సమాచారం అందించబడింది",

        // Map controls & badges
        route_preview_ready: "రూట్ ప్రివ్యూ • సిద్ధం",
        trip_active_live_gps: "ట్రిప్ యాక్టివ్ • లైవ్ GPS",
        road_route_active: "రోడ్డు రూట్ యాక్టివ్",
        road_route_unavailable: "రోడ్డు రూట్ అందుబాటులో లేదు",
        nav_mode: "నావ్ మోడ్",
        overview: "ఓవర్‌వ్యూ",
        recenter: "రీసెంటర్",
        title_nav_mode: "ప్రస్తుతం: నావిగేషన్ కెమెరా (ఓవర్‌వ్యూ కోసం క్లిక్ చేయండి)",
        title_overview: "ప్రస్తుతం: ఓవర్‌వ్యూ (నావిగేషన్ కెమెరా కోసం క్లిక్ చేయండి)",

        // Pre-trip view
        assigned_route: "కేటాయించిన రూట్",
        stops_count: "{count} స్టాప్‌లు",
        stop_count_single: "1 స్టాప్",
        loading_route: "రూట్ లోడ్ అవుతోంది...",
        first_stop_label: "మొదటి స్టాప్:",
        route_stops_ready: "రూట్ స్టాప్‌లు సిద్ధంగా ఉన్నాయి",
        ready: "సిద్ధం",
        select_trip_type: "ట్రిప్ రకాన్ని ఎంచుకోండి",
        morning: "ఉదయం",
        evening: "సాయంత్రం",
        start_trip_select: "ట్రిప్ రకాన్ని ఎంచుకోండి",
        start_morning_trip: "ఉదయం ట్రిప్ ప్రారంభించండి",
        start_evening_trip: "సాయంత్రం ట్రిప్ ప్రారంభించండి",
        starting_trip: "ట్రిప్ ప్రారంభమవుతోంది…",
        scan_pass_title: "పాస్ స్కాన్",
        verify_student_sub: "విద్యార్థిని ధృవీకరించండి",
        report_detour_title: "మళ్లింపు రిపోర్ట్ చేయండి",
        road_diversion_sub: "రోడ్డు మళ్లింపు",
        sos_breakdown_footer: "ఎమర్జెన్సీ SOS / బ్రేక్‌డౌన్",

        // Active Trip View - Next Stop Card
        next_stop_header: "తదుపరి స్టాప్",
        finding_next_stop: "తదుపరి స్టాప్ కోసం వెతుకుతోంది...",
        all_stops_completed: "అన్ని స్టాప్‌లు పూర్తయ్యాయి",
        trip_complete: "ట్రిప్ పూర్తయింది",
        final_destination: "తుది గమ్యస్థానం",
        stop_order_badge: "స్టాప్ {order}/{total}",
        stop_order_badge_final: "స్టాప్ {order}/{total} (చివరిది)",
        next_stop_eta: "ETA: ~{min} నిమి",
        students_expected: "{count} విద్యార్థులు రానున్నారు",
        student_expected_single: "1 విద్యార్థి రానున్నారు",
        no_pickups_badge: "పికప్‌లు లేవు",
        no_pickups_expected: "ఎవరూ రావట్లేదు (అందరూ సెలవు)",
        route_stops_header: "రూట్ స్టాప్‌లు",

        // Trip Summary Bar (Collapsed & Expanded)
        college_label: "కళాశాల",
        final_stop_label: "చివరి స్టాప్",
        eta_to_college: "కళాశాలకు చేరే సమయం",
        eta_to_final_stop: "చివరి స్టాప్‌కు సమయం",
        duration_approx_min: "~{min} నిమి",
        summary_college_eta: "~{min} నిమి ({time})",
        expected_abbrev: "మంది",
        summary_exp: "{count} మంది",
        summary_stats: "వివరాలు",
        summary_passed_ratio: "{passed}/{total} దాటాయి",
        passed_count: "{count} దాటాయి",
        remaining_count: "{count} మిగిలి ఉన్నాయి",
        today: "ఈరోజు",
        expected: "రానున్నారు",
        next_stop_prefix: "తర్వాత: {name}",
        to_college: "కళాశాలకు",

        // Driver Actions Row & Trip Active Bar
        scan_pass_btn: "పాస్ స్కాన్",
        detour_btn: "మళ్లింపు",
        sos_btn: "SOS",
        trip_active: "ట్రిప్ యాక్టివ్",
        end_trip: "ట్రిప్ ముగించు",

        // Wait Request Card
        wait_request: "వేచి ఉండే అభ్యర్థన",
        wait_request_title: "వేచి ఉండే అభ్యర్థన — {stop}",
        upcoming_stop: "రాబోయే స్టాప్",
        wait_students_waiting: "• {count} మంది వేచి ఉన్నారు ({min} నిమి)",
        student_singular: "విద్యార్థి",
        students_plural: "విద్యార్థులు",
        skip: "దాటవేయి",
        wait_accepted_arrival: "ఆమోదించబడింది — రాక కోసం వేచి ఉంది",
        wait_continue_trip: "మీ ట్రిప్‌ను కొనసాగించండి",
        wait_resume_in: "వేచి ఉంది — {min}:{sec} లో కొనసాగించండి",
        auto_accepting_soon: "త్వరలో ఆటో-ఆమోదం…",
        auto_accepted: "ఆటో-ఆమోదించబడింది",
        auto_accepting_in: "{time} లో ఆటో-ఆమోదం",

        // Pass Scanner Modal
        scan_pass_modal_title: "విద్యార్థి పాస్ స్కాన్ చేయండి",
        scanner_instruction: "విద్యార్థి బార్‌కోడ్‌ను కెమెరా ముందు ఉంచండి",
        start_camera: "కెమెరా ప్రారంభించండి",
        upload: "అప్‌లోడ్",
        or_enter_roll: "లేదా రోల్ నంబర్ నమోదు చేయండి",
        verify: "ధృవీకరించండి",
        checking: "తనిఖీ చేస్తోంది…",
        pass_valid_active: "పాస్ చెల్లుబాటులో ఉంది & యాక్టివ్",
        marked_not_travelling: "ప్రయాణించడం లేదని గుర్తించబడింది",
        just_now: "ఇప్పుడే",
        stop_label: "స్టాప్:",
        bus_label: "బస్సు:",
        invalid_pass: "చెల్లని పాస్",
        invalid_pass_title: "చెల్లని విద్యార్థి పాస్",
        student_not_assigned_bus: "విద్యార్థి ఈ బస్సుకు కేటాయించబడలేదు.",
        student_not_found_assigned: "విద్యార్థి కనుగొనబడలేదు లేదా వేరే బస్సుకి కేటాయించబడ్డారు.",
        network_error: "సర్వర్‌తో కమ్యూనికేట్ చేయడంలో నెట్‌వర్క్ లోపం.",

        // Detour Modal
        report_detour_modal_title: "రూట్ మళ్లింపు రిపోర్ట్ చేయండి",
        reason_for_detour: "మళ్లింపునకు కారణం",
        detour_road_work: "రోడ్డు పని",
        detour_traffic_jam: "ట్రాఫిక్ జామ్",
        detour_weather: "వాతావరణం",
        detour_road_closed: "రోడ్డు మూసివేత",
        estimated_delay: "అంచనా వేసిన ఆలస్యం",
        broadcast_detour_btn: "విద్యార్థులు & అడ్మిన్‌కు మళ్లింపు పంపండి",
        broadcasting: "ప్రసారం చేస్తోంది…",

        // Emergency SOS Modal
        sos_modal_title: "ఎమర్జెన్సీ SOS / బ్రేక్‌డౌన్",
        select_incident_type: "సమస్య రకాన్ని ఎంచుకోండి",
        sos_breakdown: "బ్రేక్‌డౌన్",
        sos_medical: "వైద్య అత్యవసరం",
        sos_accident: "ప్రమాదం",
        sos_security: "భద్రత",
        college_transport_cell: "కళాశాల రవాణా విభాగం",
        police_emergency: "పోలీస్ / అత్యవసరం",
        transmit_sos_btn: "ఎమర్జెన్సీ SOS పంపండి",
        transmitting_sos: "SOS పంపుతోంది…",

        // End Trip Confirmation Dialog
        confirm_end_trip_title: "ఈ ట్రిప్‌ను ముగించాలా?",
        confirm_end_trip_msg: "మీ లైవ్ లొకేషన్ షేరింగ్ ఆగిపోతుంది.",
        confirm_logout_active_trip: "మీ యాక్టివ్ ట్రిప్ ఇంకా కొనసాగుతోంది. మీరు ఖచ్చితంగా లాగ్ అవుట్ చేయాలనుకుంటున్నారా? ట్రిప్ స్వయంచాలకంగా ముగుస్తుంది.",
        confirm_end_trip_ok: "ట్రిప్ ముగించండి",
        cancel: "రద్దు చేయండి",

        // Trusted Device Modal
        trusted_device_title: "ఈ పరికరాన్ని విశ్వసిస్తున్నారా?",
        trusted_device_prompt: "మీరు ఈ పరికరాన్ని విశ్వసిస్తున్నారా? అవును అయితే, ఇది మీ ప్రాథమిక పరికరం అవుతుంది మరియు ఇతర సెషన్‌లు సైన్ అవుట్ చేయబడతాయి.",
        trusted_device_confirm: "అవును, ఈ పరికరాన్ని విశ్వసించండి",
        trusted_device_dismiss: "ఇప్పుడు కాదు",
        device_trusted_success: "పరికరం మీ విశ్వసనీయ ప్రాథమిక పరికరంగా గుర్తించబడింది.",

        // Toasts & Notifications
        toast_select_trip_type: "ట్రిప్ రకాన్ని ఎంచుకోండి",
        toast_select_trip_msg: "ట్రిప్ ప్రారంభించే ముందు ఉదయం లేదా సాయంత్రం ఎంచుకోండి.",
        toast_session_expired: "సెషన్ గడువు ముగిసింది",
        toast_session_expired_msg: "దయచేసి మళ్లీ లాగిన్ అవ్వండి.",
        toast_bus_not_assigned: "బస్సు కేటాయించబడలేదు",
        toast_bus_not_assigned_msg: "మీ డ్రైవర్ ఖాతాకు బస్సు కేటాయింపు కనుగొనబడలేదు.",
        toast_trip_started: "ట్రిప్ ప్రారంభమైంది",
        toast_trip_started_msg: "లైవ్ GPS షేరింగ్ ప్రారంభమైంది.",
        toast_unable_start_trip: "ట్రిప్ ప్రారంభించడం సాధ్యం కాలేదు",
        toast_unable_start_trip_msg: "దయచేసి మీ కనెక్షన్‌ని తనిఖీ చేయండి.",
        toast_trip_ended: "ట్రిప్ ముగిసింది",
        toast_trip_ended_msg: "లైవ్ location sharing ఆగిపోయింది.",
        toast_unable_end_trip: "ట్రిప్ ముగించడం సాధ్యం కాలేదు",
        toast_unable_end_trip_msg: "దయచేసి మళ్లీ ప్రయత్నించండి.",
        toast_gps_not_supported: "GPS మద్దతు లేదు",
        toast_gps_not_supported_msg: "ఈ పరికరంలో జియోలొకేషన్ సపోర్ట్ లేదు.",
        toast_bus_reassigned: "బస్సు తిరిగి కేటాయించబడింది",
        toast_bus_reassigned_msg: "మీరు ఇకపై ఈ బస్సుకు కేటాయించబడలేదు. కొనసాగడానికి దయచేసి మళ్లీ లాగిన్ అవ్వండి.",
        toast_wait_skipped: "నిరీక్షణ దాటవేయబడింది",
        toast_wait_skipped_msg: "{stop} వద్ద వేచి ఉండే అభ్యర్థన దాటవేయబడింది.",
        toast_skip_failed: "దాటవేయడం విఫలమైంది",
        toast_skip_failed_msg: "దయచేసి మళ్లీ ప్రయత్నించండి.",
        toast_student_boarded: "విద్యార్థి ఎక్కారు",
        toast_student_boarded_msg: "ప్రయాణీకుడు ఎక్కారు. మీరు ప్రయాణాన్ని కొనసాగించవచ్చు.",
        toast_complete_wait_failed_msg: "నిరీక్షణను ముందుగా పూర్తి చేయడం సాధ్యపడలేదు. దయచేసి మళ్లీ ప్రయత్నించండి.",
        wait_continue_now: "విద్యార్థి ఎక్కారు",
        toast_camera_access: "కెమెరా యాక్సెస్",
        toast_camera_access_msg: "కెమెరా అందుబాటులో లేదు. దయచేసి రోల్ నంబర్‌ను నమోదు చేయండి లేదా పాస్‌ను అప్‌లోడ్ చేయండి.",
        toast_barcode_scanner_unavailable: "బార్‌కోడ్ స్కానర్ అందుబాటులో లేదు",
        toast_enter_roll_manually: "దయచేసి రోల్ నంబర్‌ను మాన్యువల్‌గా నమోదు చేయండి.",
        toast_pass_image_selected: "పాస్ చిత్రం ఎంచుకోబడింది",
        toast_pass_image_selected_msg: "ధృవీకరించడానికి దయచేసి క్రింద నేరుగా రోల్ నంబర్‌ను నమోదు చేయండి.",
        toast_qr_not_detected: "QR గుర్తించబడలేదు",
        toast_qr_not_detected_msg: "అప్‌లోడ్ చేసిన చిత్రం నుండి QR చదవలేకపోయాము. దయచేసి రోల్ నంబర్‌ను నమోదు చేయండి.",
        toast_roll_required: "రోల్ నంబర్ అవసరం",
        toast_roll_required_msg: "దయచేసి సరైన విద్యార్థి రోల్ నంబర్‌ను నమోదు చేయండి.",
        toast_invalid_scanner_val: "చెల్లని స్కానర్ విలువ",
        toast_invalid_scanner_msg: "స్కానర్ బార్‌కోడ్ విలువకు బదులుగా చిత్ర ఫ్రేమ్‌ను అందించింది. దయచేసి మళ్లీ స్కాన్ చేయండి లేదా రోల్ నంబర్‌ను నమోదు చేయండి.",
        toast_student_verified: "విద్యార్థి ధృవీకరించబడ్డారు",
        toast_student_verified_msg: "{name} ({roll}) {stop} కోసం బస్సు ఎక్కారు.",
        toast_pass_invalid: "పాస్ చెల్లదు",
        toast_pass_invalid_msg: "విద్యార్థి పాస్ ధృవీకరించబడలేదు.",
        toast_detour_broadcasted: "మళ్లింపు ప్రసారం చేయబడింది",
        toast_detour_cleared: "మళ్లింపు తొలగించబడింది",
        toast_detour_cleared_msg: "సాధారణ రూట్ ప్రయాణం ప్రారంభమైంది.",
        toast_sos_dispatched: "ఎమర్జెన్సీ SOS పంపబడింది",
        toast_sos_dispatched_msg: "కళాశాల రవాణా విభాగం & అత్యవసర సేవలకు {type} గురించి సమాచారం అందించబడింది.",
        toast_sos_cleared: "ఎమర్జెన్సీ స్థితి క్లియర్ చేయబడింది",
        toast_sos_cleared_msg: "SOS హెచ్చరిక తొలగించబడింది.",

        // Voice Announcements
        voice_next_stop_singular: "తదుపరి స్టాప్ {name}, 1 విద్యార్థి",
        voice_next_stop_plural: "తదుపరి స్టాప్ {name}, {count} విద్యార్థులు",
        voice_no_need_stop: "{name} వద్ద ఆగాల్సిన అవసరం లేదు, బస్సులో విద్యార్థులు ఎవరూ లేరు",
        voice_wait_request: "{stop} స్టాప్, బస్సు {minutes} నిమిషాలు ఆగుతుంది",
        min_singular: "నిమిషం",
        min_plural: "నిమిషాలు"
    }
};

let currentLanguage = (function () {
    try {
        const saved = localStorage.getItem("kambus_driver_lang");
        if (saved && (saved === "en" || saved === "hi" || saved === "te")) {
            return saved;
        }
    } catch (_) {}
    return "en";
})();

function getVoiceLangCode() {
    switch (currentLanguage) {
        case "hi": return "hi-IN";
        case "te": return "te-IN";
        default: return "en-IN";
    }
}

function t(key, params = {}) {
    const lang = TRANSLATIONS[currentLanguage] ? currentLanguage : "en";
    let str = TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS["en"]?.[key] ?? key;
    if (params && typeof params === "object") {
        for (const [k, v] of Object.entries(params)) {
            str = str.replaceAll(`{${k}}`, v);
        }
    }
    return str;
}

function updateLanguageSwitcherUI() {
    ["en", "hi", "te"].forEach(lang => {
        const btn = document.getElementById(`langBtn${lang.charAt(0).toUpperCase() + lang.slice(1)}`);
        if (!btn) return;
        const isSelected = currentLanguage === lang;
        btn.setAttribute("aria-pressed", String(isSelected));
        btn.classList.toggle("bg-navy", isSelected);
        btn.classList.toggle("text-white", isSelected);
        btn.classList.toggle("shadow-2xs", isSelected);
        btn.classList.toggle("text-navy", !isSelected);
        btn.classList.toggle("hover:bg-surface", !isSelected);
    });
}

function applyStaticTranslations() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;

    document.querySelectorAll("[data-i18n]").forEach(el => {
        const key = el.getAttribute("data-i18n");
        if (key) {
            el.textContent = t(key);
        }
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (key) el.placeholder = t(key);
    });

    document.querySelectorAll("[data-i18n-title]").forEach(el => {
        const key = el.getAttribute("data-i18n-title");
        if (key) el.title = t(key);
    });

    document.querySelectorAll("[data-i18n-aria]").forEach(el => {
        const key = el.getAttribute("data-i18n-aria");
        if (key) el.setAttribute("aria-label", t(key));
    });
}

function refreshAllDynamicTexts() {
    updateTopStatusBar();
    updateTripTypeControls();
    updatePreTripOverview();
    updateCameraModeUI();
    updateStopProgressionUI();

    const busBadge = document.getElementById("headerBusBadge");
    if (busBadge) {
        busBadge.textContent = t("bus_badge", { num: currentBusData?.bus_number || "—" });
    }
    const driverName = document.getElementById("headerDriverName");
    if (driverName && (!currentBusData || !currentBusData.driver_name)) {
        driverName.textContent = t("driver_default");
    }

    if (isTripActive && lastPosition) {
        updateNextStopAndEta(lastPosition);
        updateCollegeEta(lastPosition);
    } else {
        const statusText = document.getElementById("routeStatusText");
        if (statusText) {
            statusText.textContent = isTripActive ? t("trip_active_live_gps") : t("route_preview_ready");
        }
    }

    if (activeWaitRequest) {
        renderActiveWaitCard(activeWaitRequest);
    }

    const detourBanner = document.getElementById("activeDetourBanner");
    const detourText = document.getElementById("activeDetourText");
    if (detourBanner && !detourBanner.classList.contains("hidden") && detourText) {
        detourText.textContent = t("active_detour_banner_text", {
            reason: getTranslatedDetourReason(currentDetourReason),
            delay: currentDetourDelay
        });
    }

    const sosBanner = document.getElementById("activeSosBanner");
    const sosText = document.getElementById("activeSosText");
    if (sosBanner && !sosBanner.classList.contains("hidden") && sosText) {
        sosText.textContent = t("active_sos_banner_text", {
            type: getTranslatedSosType(currentSosType)
        });
    }
}

function getTranslatedDetourReason(reason) {
    switch (reason) {
        case "Road Construction": return t("detour_road_work");
        case "Heavy Traffic": return t("detour_traffic_jam");
        case "Waterlogging": return t("detour_weather");
        case "Road Blocked": return t("detour_road_closed");
        default: return reason;
    }
}

function getTranslatedSosType(type) {
    switch (type) {
        case "Vehicle Breakdown": return t("sos_breakdown");
        case "Medical Emergency": return t("sos_medical");
        case "Accident": return t("sos_accident");
        case "Security Alert": return t("sos_security");
        default: return type;
    }
}

function setLanguage(lang) {
    if (!TRANSLATIONS[lang]) lang = "en";
    currentLanguage = lang;
    try {
        localStorage.setItem("kambus_driver_lang", lang);
    } catch (_) {}

    if (typeof document !== "undefined" && document.documentElement) {
        document.documentElement.lang = lang;
    }

    updateLanguageSwitcherUI();
    applyStaticTranslations();
    refreshAllDynamicTexts();
}
if (typeof window !== "undefined") {
    window.setLanguage = setLanguage;
}

// Multilingual Voice Announcement Engine
function speakVoiceAnnouncement(text, priority = 1) {
    if (typeof window === "undefined") return;

    if ("speechSynthesis" in window) {
        if (priority === 2) {
            window.speechSynthesis.cancel();
        } else if (window.speechSynthesis.speaking && priority === 1) {
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        const targetLang = getVoiceLangCode();
        utterance.lang = targetLang;

        if (typeof window.speechSynthesis.getVoices === "function") {
            const voices = window.speechSynthesis.getVoices();
            const prefix = targetLang.slice(0, 2).toLowerCase();
            const matched = voices.find(v => v.lang === targetLang || (v.lang && v.lang.toLowerCase().startsWith(prefix)));
            if (matched) utterance.voice = matched;
        }

        window.speechSynthesis.speak(utterance);
        return;
    }

    if (typeof window.AndroidTTS !== "undefined" && typeof window.AndroidTTS.speak === "function") {
        try {
            window.AndroidTTS.speak(text);
        } catch (_) {}
    }
}

if (typeof VoiceAnnouncer !== "undefined") {
    let lastAnnouncedStopId = null;
    let lastAnnouncedWaitKey = null;

    VoiceAnnouncer.checkProximityAnnouncement = function (stopId, name, studentCount, distToNext) {
        const ANNOUNCE_DISTANCE_M = 400;
        if (distToNext > ANNOUNCE_DISTANCE_M) return;
        if (stopId === lastAnnouncedStopId) return;

        const count = Number(studentCount) || 0;
        let text;
        if (count === 0) {
            text = t("voice_no_need_stop", { name });
        } else if (count === 1) {
            text = t("voice_next_stop_singular", { name });
        } else {
            text = t("voice_next_stop_plural", { name, count });
        }

        speakVoiceAnnouncement(text, 1);
        lastAnnouncedStopId = stopId;
    };

    VoiceAnnouncer.checkWaitRequestAnnouncement = function (group) {
        const key = group.students?.[0]?.request_id || `${group.stop_name}-${group.minutes}`;
        if (key === lastAnnouncedWaitKey) return;

        const minutes = Number(group.minutes) || 1;
        const unit = t(minutes === 1 ? "min_singular" : "min_plural");
        const stopName = group.stop_name || t("stop_label").replace(":", "");
        const text = t("voice_wait_request", { stop: stopName, minutes, unit });

        speakVoiceAnnouncement(text, 2);
        lastAnnouncedWaitKey = key;
    };

    VoiceAnnouncer.resetWaitDedup = function () {
        lastAnnouncedWaitKey = null;
    };
}

// Driver & Trip State
let isTripActive = false;
let isGpsPaused = false;
let isTripStarting = false;
let isTripEnding = false;
let selectedTripType = null;
let busAssignmentCheckInterval = null; // Polls for driver->bus reassignment while a trip is active

let BUS_ID = null;
let currentBusData = null;
let driverRouteStops = [];
let driverExtraPickups = [];
let activeTripType = null;
let passedStopIds = new Set();
let currentNextStop = null;

// GPS Tracking State
let gpsWatchId = null;
let lastPosition = null;
let lastLocationSentAt = 0;
let locationRequestInFlight = false;
let statusElapsedTimer = null;

// Wait Request Polling & Countdown State
let waitRequestPollTimer = null;
let waitCountdownInterval = null;
let activeWaitRequest = null;
const waitRequestSkipInFlight = new Set();

// Map & Visualization Layers
let routeMap = null;
let driverMarker = null;
let completedRouteLayer = null;
let remainingRouteLayer = null;
let remainingRouteArrowLayer = null;
let currentRemainingRouteLatLngs = [];
let stopMarkersGroup = null;
let collegeMarker = null;

// Navigation Camera & Bearing Tracking State
let isBearingUpMode = true; // Driver toggle: true = Bearing-up follow camera, false = Flat north-up overview
let currentSmoothedBearing = null;
let previousGpsFix = null;
const MIN_SPEED_FOR_DEVICE_BEARING_KMH = 2.0; // Device bearing is ignored when stopped / below 2 km/h (avoids GPS jitter)
const MIN_DISTANCE_FOR_CALCULATED_BEARING_M = 3.0; // Minimum displacement to compute azimuth fallback
const BEARING_SMOOTHING_ALPHA = 0.25; // Exponential moving average factor for circular angle smoothing

// Authoritative College Coordinates (fallback default)
const COLLEGE_LOCATION = {
    latitude: 18.054145359568437,
    longitude: 79.53558731724873,
    name: "KITSW / College"
};

// OSRM Road Routing Cache & Throttle State
let lastRouteFetchAt = 0;
let lastRouteFetchPos = null;
let lastNextStopId = null;
let isRouteFetchInFlight = false;
const ROUTE_REFRESH_MIN_INTERVAL_MS = 25000; // 25 seconds minimum between OSRM requests
const ROUTE_REFRESH_MIN_DISTANCE_M = 120;    // 120 meters minimum movement before recalculating
let wakeLockSentinel = null;

async function acquireWakeLock() {
    try {
        if ("wakeLock" in navigator) {
            wakeLockSentinel = await navigator.wakeLock.request("screen");
            wakeLockSentinel.addEventListener("release", () => {
});
}
    } catch (err) {
        console.warn("Wake lock request failed:", err.message);
    }
}

async function releaseWakeLock() {
    if (wakeLockSentinel) {
        try { await wakeLockSentinel.release(); } catch (_) {}
        wakeLockSentinel = null;
    }
}

// Re-acquire on tab/app resume — wake locks are auto-released on visibility change
document.addEventListener("visibilitychange", async () => {
    if (isTripActive && document.visibilityState === "visible") {
        await acquireWakeLock();
    }
});
// ========================================================================
// AUTHENTICATION HELPER
// ========================================================================

function getToken() {
    let token = localStorage.getItem("kambus_token");
    if (!token && window.AndroidSession && typeof window.AndroidSession.getToken === "function") {
        token = window.AndroidSession.getToken();
        if (token) localStorage.setItem("kambus_token", token);
    }
    return token;
}

// ========================================================================
// CAMPUS PLAN ENTITLEMENTS & FEATURE GATING
// ========================================================================

let driverCampusEntitlements = null;

async function loadDriverCampusEntitlements() {
    const token = getToken();
    if (!token) return;
    try {
        const response = await fetch(`${API_BASE}/me/entitlements`, {
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
            }
        });
        if (response.ok) {
            driverCampusEntitlements = await response.json();
            applyDriverFeatureGating();
        }
    } catch (e) {
        console.warn("Could not load driver campus entitlements:", e);
    }
}

function hasDriverEntitlement(featureName) {
    if (!driverCampusEntitlements || !Array.isArray(driverCampusEntitlements.features)) {
        return true; // default open while loading
    }
    return driverCampusEntitlements.features.includes(featureName);
}

function applyDriverFeatureGating() {
    if (!hasDriverEntitlement("driver_voice_announcements")) {
        if (typeof VoiceAnnouncer !== "undefined" && typeof VoiceAnnouncer.setEnabled === "function") {
            VoiceAnnouncer.setEnabled(false);
        }
    } else {
        if (typeof VoiceAnnouncer !== "undefined" && typeof VoiceAnnouncer.setEnabled === "function") {
            VoiceAnnouncer.setEnabled(true);
        }
    }
    if (!hasDriverEntitlement("wait_request")) {
        stopWaitRequestsPolling();
        hideActiveWaitCard();
    } else {
        if (isTripActive && typeof startWaitRequestsPolling === "function") {
            startWaitRequestsPolling();
        }
    }
}

// ========================================================================
// INITIALIZATION ON DOM LOAD
// ========================================================================

document.addEventListener("DOMContentLoaded", () => {
    setLanguage(currentLanguage);
    loadDriverCampusEntitlements();
// Bind Start & End Trip Buttons
    document.getElementById("startTripBtn")?.addEventListener("click", handleStartTrip);
    document.getElementById("endTripBtn")?.addEventListener("click", confirmAndEndTrip);
    document.getElementById("morningTripTypeBtn")?.addEventListener("click", () => selectTripType("morning"));
    document.getElementById("eveningTripTypeBtn")?.addEventListener("click", () => selectTripType("evening"));
    updateTripTypeControls();

    // Bind Recenter & Camera Mode Toggle Buttons
    document.getElementById("recenterBtn")?.addEventListener("click", recenterRouteMap);
    document.getElementById("cameraModeToggleBtn")?.addEventListener("click", toggleCameraMode);
    updateCameraModeUI();

    // Bind Skip Wait Button
    document.getElementById("skipWaitBtn")?.addEventListener("click", handleSkipActiveWait);
    document.getElementById("completeWaitBtn")?.addEventListener("click", handleCompleteActiveWait);

    // Bind Logout Button
    document.getElementById("driverLogoutBtn")?.addEventListener("click", handleDriverLogout);

    // Start Live Status Elapsed Ticker
    startStatusElapsedTicker();

    // Restore Driver State
    restoreDriverDashboardState();

    // Check Trusted Device Confirmation Flow
    checkTrustedDeviceFlow();

    // Initialize Driver Real-time WebSocket
    initDriverWebSocket();

    // Live Entitlements auto-refresh on foreground / interval (mitigation for tier upgrades)
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            loadDriverCampusEntitlements();
        }
    });
    window.addEventListener("focus", () => {
        loadDriverCampusEntitlements();
    });
    setInterval(() => {
        loadDriverCampusEntitlements();
    }, 60000);
});

// ========================================================================
// LOGOUT HANDLER
// ========================================================================

async function handleDriverLogout(event) {
    if (event) event.preventDefault();

    if (isTripActive) {
        const confirmed = await confirm(t("confirm_logout_active_trip"));
        if (!confirmed) return;
    }

    const token = getToken();

    // End active trip and notify backend before clearing local session
    if (token) {
        try {
            await fetch(`${API_BASE}/driver/end-trip`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                keepalive: true
            }).catch(() => {});
        } catch (err) {
            console.warn("[WARN] /driver/end-trip failed during logout:", err);
        }

        try {
            await fetch(`${API_BASE}/auth/logout`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                keepalive: true
            }).catch(() => {});
        } catch (err) {
            console.warn("[WARN] /auth/logout failed during logout:", err);
        }
    }

    // Stop GPS tracking & any active polling
    stopGpsTracking();
    stopWaitRequestsPolling();
    stopBusAssignmentPolling();

    // Clear session tokens
    localStorage.removeItem("kambus_token");
    localStorage.removeItem("kambus_role");
    localStorage.removeItem("kambus_user_id");
    localStorage.removeItem("kambus_driver_dashboard");
    sessionStorage.removeItem("kambus_trust_prompt_dismissed");
    if (window.AndroidSession && typeof window.AndroidSession.clearSession === "function") {
        try { window.AndroidSession.clearSession(); } catch (_) {}
    }

    // Redirect to login page
    window.location.href = "index.html";
}

// ========================================================================
// TRUSTED DEVICE CONFIRMATION FLOW
// ========================================================================

function getOrCreateDeviceId() {
    try {
        if (window.AndroidSession && typeof window.AndroidSession.getDeviceId === "function") {
            const devId = window.AndroidSession.getDeviceId();
            if (devId && devId.length > 5) {
                localStorage.setItem("kambus_device_id", devId);
                return devId;
            }
        }
    } catch (e) {
        console.warn("Could not retrieve device ID from native bridge:", e);
    }

    let devId = localStorage.getItem("kambus_device_id");
    if (!devId) {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            devId = window.crypto.randomUUID();
        } else {
            devId = "dev-" + Math.random().toString(36).substring(2, 15) + "-" + Date.now().toString(36);
        }
        localStorage.setItem("kambus_device_id", devId);
    }
    return devId;
}

function showTrustedDeviceModal() {
    const modal = document.getElementById("trustedDeviceModal");
    if (modal) {
        modal.classList.remove("hidden");
    }
}

function dismissTrustedDeviceModal() {
    const modal = document.getElementById("trustedDeviceModal");
    if (modal) {
        modal.classList.add("hidden");
    }
    sessionStorage.setItem("kambus_trust_prompt_dismissed", "true");
}

async function confirmTrustedDevice() {
    const token = getToken();
    const deviceId = getOrCreateDeviceId();
    const btn = document.getElementById("confirmTrustDeviceBtn");
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span>Saving…</span>`;
    }

    try {
        const response = await fetch(`${API_BASE}/driver/trust-device`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ device_id: deviceId })
        });

        if (response.ok) {
            const data = await response.json();
            const dash = getInitialDriverDashboard() || {};
            dash.trusted_device_id = deviceId;
            dash.is_trusted_device = true;
            dash.needs_trust_prompt = false;
            localStorage.setItem("kambus_driver_dashboard", JSON.stringify(dash));
            sessionStorage.setItem("kambus_trust_prompt_dismissed", "true");
            dismissTrustedDeviceModal();
            if (window.KambusNotify && typeof window.KambusNotify.notify === "function") {
                window.KambusNotify.notify({
                    type: "success",
                    title: t("trusted_device_title") || "Trusted Device",
                    message: t("device_trusted_success") || "Device marked as trusted"
                });
            }
        } else {
            const err = await response.json().catch(() => ({}));
            console.error("Failed to trust device:", err);
            dismissTrustedDeviceModal();
        }
    } catch (err) {
        console.error("Error confirming trusted device:", err);
        dismissTrustedDeviceModal();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }
}

async function checkTrustedDeviceFlow() {
    const token = getToken();
    if (!token) return;

    if (sessionStorage.getItem("kambus_trust_prompt_dismissed") === "true") {
        return;
    }

    const initialData = getInitialDriverDashboard();
    if (initialData && typeof initialData.needs_trust_prompt === "boolean") {
        if (initialData.needs_trust_prompt) {
            showTrustedDeviceModal();
        }
        return;
    }

    try {
        const deviceId = getOrCreateDeviceId();
        const resp = await fetch(`${API_BASE}/driver/trusted-device/status?device_id=${encodeURIComponent(deviceId)}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data.needs_trust_prompt) {
                showTrustedDeviceModal();
            }
        }
    } catch (e) {
        console.warn("Could not check trusted device status:", e);
    }
}

// ========================================================================
// STATUS BAR ELAPSED TIMER (Sending • 3s ago)
// ========================================================================

function startStatusElapsedTicker() {
    if (statusElapsedTimer) clearInterval(statusElapsedTimer);

    statusElapsedTimer = setInterval(() => {
        updateTopStatusBar();
    }, 1000);
}

function updateTopStatusBar() {
    const dot = document.getElementById("statusDot");
    const statusText = document.getElementById("liveStatusText");
    const elapsedText = document.getElementById("lastUpdateElapsed");

    if (!dot || !statusText || !elapsedText) return;

    if (!isTripActive) {
        dot.className = "w-2 h-2 rounded-full bg-slate-300";
        statusText.textContent = t("status_offline");
        statusText.className = "text-xs font-bold text-slate-500";
        elapsedText.textContent = t("status_gps_not_active");
        return;
    }

    if (isGpsPaused) {
        dot.className = "w-2 h-2 rounded-full bg-warn animate-pulse";
        statusText.textContent = t("status_gps_paused");
        statusText.className = "text-xs font-bold text-warn";
        elapsedText.textContent = t("status_updates_suspended");
        return;
    }

    if (lastLocationSentAt === 0) {
        dot.className = "w-2 h-2 rounded-full bg-ok animate-pulse";
        statusText.textContent = t("status_acquiring_gps");
        statusText.className = "text-xs font-bold text-ok";
        elapsedText.textContent = t("status_waiting_fix");
        return;
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastLocationSentAt) / 1000));

    if (elapsedSeconds <= 15) {
        dot.className = "w-2 h-2 rounded-full bg-ok animate-pulse";
        statusText.textContent = t("status_live");
        statusText.className = "text-xs font-bold text-ok";
        elapsedText.textContent = t("status_sending_elapsed", { s: elapsedSeconds });
    } else {
        dot.className = "w-2 h-2 rounded-full bg-warn";
        statusText.textContent = t("status_slow_gps");
        statusText.className = "text-xs font-bold text-warn";
        elapsedText.textContent = t("status_sending_elapsed", { s: elapsedSeconds });
    }
}

// ========================================================================
// RESTORE DASHBOARD STATE ON LOAD
// ========================================================================

async function restoreDriverDashboardState() {
    const token = getToken();
    if (!token) return;

    const initialLoginData = getInitialDriverDashboard();
    if (!window.__driverStateRestoredFromLogin && initialLoginData) {
        window.__driverStateRestoredFromLogin = true;

        await loadDriverBus();

        const tripStatus = initialLoginData.trip_status;
        if (tripStatus && tripStatus.active) {
            isTripActive = true;
            activeTripType = tripStatus.trip_type || initialLoginData.route_stops?.trip_type || "morning";
            await loadDriverRouteStops(activeTripType);
            switchToActiveTripView();
            startGpsTracking();
            startWaitRequestsPolling();
            startBusAssignmentPolling();
        } else {
            isTripActive = false;
            activeTripType = null;
            await loadDriverRouteStops();
            switchToPreTripView();
        }
        return;
    }

    // 1. Load Driver's Assigned Bus
    const myBus = await loadDriverBus();
    if (!myBus.success) return;

    try {
        const response = await fetch(`${API_BASE}/driver/trip-status`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok && data.active) {
            isTripActive = true;
            activeTripType = data.trip_type || selectedTripType || "morning";
            await loadDriverRouteStops(activeTripType);
            switchToActiveTripView();
            startGpsTracking();
            startWaitRequestsPolling();
            startBusAssignmentPolling();
        } else {
            isTripActive = false;
            activeTripType = null;
            await loadDriverRouteStops();
            switchToPreTripView();
        }
    } catch (error) {
        console.warn("Trip status restore error:", error);
        switchToPreTripView();
    }
}

// ========================================================================
// SWITCH VIEWS: PRE-TRIP vs ACTIVE TRIP
// ========================================================================

function switchToPreTripView() {
    document.body.classList.remove("trip-active");
    document.getElementById("preTripView")?.classList.remove("hidden");
    document.getElementById("preTripFooter")?.classList.remove("hidden");
    document.getElementById("activeTripView")?.classList.add("hidden");
    document.getElementById("waitRequestCard")?.classList.add("hidden");

    // Update floating status badge on map for pre-trip preview
    const statusBadge = document.getElementById("routeStatusBadge");
    const statusDot = document.getElementById("routeStatusDot");
    const statusText = document.getElementById("routeStatusText");
    if (statusBadge) statusBadge.classList.remove("hidden");
    if (statusDot) statusDot.className = "w-1.5 h-1.5 rounded-full bg-brand";
    if (statusText) statusText.textContent = t("route_preview_ready");

    updatePreTripOverview();
    updateTopStatusBar();

    // Render map preview for pre-trip
    setTimeout(() => {
        initOrUpdateRouteMap();
        if (routeMap) {
            routeMap.invalidateSize();
            if (driverRouteStops.length > 0) {
                const boundsCoords = driverRouteStops.map(s => [s.latitude, s.longitude]);
                boundsCoords.push([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude]);
                routeMap.fitBounds(L.latLngBounds(boundsCoords), { padding: [35, 35] });
            }
        }
    }, 150);
}

function switchToActiveTripView() {
    document.body.classList.add("trip-active");
    document.getElementById("preTripView")?.classList.add("hidden");
    document.getElementById("preTripFooter")?.classList.add("hidden");
    document.getElementById("activeTripView")?.classList.remove("hidden");

    // Update floating status badge on map for active trip
    const statusBadge = document.getElementById("routeStatusBadge");
    const statusDot = document.getElementById("routeStatusDot");
    const statusText = document.getElementById("routeStatusText");
    if (statusBadge) statusBadge.classList.remove("hidden");
    if (statusDot) statusDot.className = "w-1.5 h-1.5 rounded-full bg-ok animate-pulse";
    if (statusText) statusText.textContent = t("trip_active_live_gps");

    // Initialize/refresh map on active switch
    setTimeout(() => {
        initOrUpdateRouteMap();
        if (routeMap) routeMap.invalidateSize();
    }, 150);

    updateTopStatusBar();
}

// ========================================================================
// LOAD DRIVER'S ASSIGNED BUS
// ========================================================================

async function loadDriverBus() {
    const token = getToken();
    if (!token) {
        return { success: false, message: "Token missing" };
    }

    try {
        let data = null;
        const initialLoginData = getInitialDriverDashboard();
        if (!window.__driverBusLoadedFromLogin && initialLoginData && initialLoginData.bus_id) {
            window.__driverBusLoadedFromLogin = true;
            data = initialLoginData;
        } else {
            const response = await fetch(`${API_BASE}/driver/my-bus`, {
                headers: {
                    "Accept": "application/json",
                    "Authorization": `Bearer ${token}`
                }
            });

            data = await response.json();

            if (!response.ok || !data.bus_id) {
                console.error("[ERROR] Failed to load driver bus:", data);
                return { success: false, message: data.detail || "Bus unavailable" };
            }
        }

        BUS_ID = data.bus_id;
        currentBusData = data;

        // Update header & badges
        const busBadge = document.getElementById("headerBusBadge");
        if (busBadge) busBadge.textContent = t("bus_badge", { num: data.bus_number || "—" });

        const driverName = document.getElementById("headerDriverName");
        if (driverName) driverName.textContent = data.driver_name || t("driver_default");

        return { success: true, bus: data };
    } catch (error) {
        console.error("[ERROR] loadDriverBus connection error:", error);
        return { success: false, message: error.message };
    }
}

// ========================================================================
// LOAD ROUTE STOPS & EXPECTED STUDENTS
// ========================================================================

function applyRouteStopsPayload(data, overrideTripType = null) {
    if (!data) return false;

    const resolvedTripType = overrideTripType || data.trip_type || activeTripType || selectedTripType || null;
    if (resolvedTripType) activeTripType = resolvedTripType;
    const isEvening = activeTripType === "evening";

    const rawStops = Array.isArray(data.stops) ? data.stops : [];

    // Sort stops according to trip direction (morning: 1..N, evening: N..1)
    let orderedStops = [...rawStops];
    if (orderedStops.length > 0 && typeof orderedStops[0].stop_order === "number") {
        orderedStops.sort((a, b) => {
            const orderA = Number(a.stop_order ?? 0);
            const orderB = Number(b.stop_order ?? 0);
            return isEvening ? (orderB - orderA) : (orderA - orderB);
        });
    } else if (isEvening && (!data.trip_type || data.trip_type !== "evening")) {
        // Fallback: reverse if stops lacked stop_order and were not already evening-ordered
        orderedStops.reverse();
    }

    // Map each stop using evening coordinates when in evening trip, otherwise morning coordinates
    driverRouteStops = orderedStops.map(stop => {
        const useEveningCoords = isEvening && stop.evening_latitude != null && stop.evening_longitude != null;
        const lat = useEveningCoords ? Number(stop.evening_latitude) : Number(stop.latitude);
        const lng = useEveningCoords ? Number(stop.evening_longitude) : Number(stop.longitude);
        const count = Number(stop.student_count || 0);
        const hasExplicitZeroStudents = (stop.student_count !== undefined && count === 0);
        const isCustom = Boolean(stop.is_custom);
        const isRealloc = Boolean(stop.is_reallocated || stop.has_reallocated_students || stop.is_extra_pickup);
        const isNoPickups = hasExplicitZeroStudents && !isCustom && !isRealloc;
        return {
            ...stop,
            latitude: lat,
            longitude: lng,
            student_count: count,
            is_no_pickups: isNoPickups,
            is_custom: isCustom,
            is_reallocated: Boolean(stop.is_reallocated),
            has_reallocated_students: Boolean(stop.has_reallocated_students),
            is_extra_pickup: isRealloc,
            reallocated_student_count: Number(stop.reallocated_student_count || 0),
            source_bus_id: stop.source_bus_id || null,
            source_bus_number: stop.source_bus_number || null,
            students: Array.isArray(stop.students) ? stop.students : []
        };
    });

    driverExtraPickups = Array.isArray(data.extra_pickups) ? data.extra_pickups : [];

    if (driverRouteStops.length > 0) {
        const firstStopName = document.getElementById("preTripFirstStopName");
        const firstStop = driverRouteStops[0];
        if (firstStopName && firstStop) {
            if (firstStop.is_extra_pickup) {
                const src = firstStop.source_bus_number ? ` • Bus ${firstStop.source_bus_number}` : "";
                firstStopName.innerHTML = `${firstStop.name} <span class="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-700 border border-amber-500/30" style="vertical-align: middle;">⚡ Extra${src}</span>`;
            } else if (firstStop.is_custom) {
                firstStopName.innerHTML = `${firstStop.name} <span class="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-warn/10 text-warn border border-warn/20" style="vertical-align: middle;">Temp</span>`;
            } else if (firstStop.is_no_pickups) {
                firstStopName.innerHTML = `${firstStop.name} <span class="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-300" style="vertical-align: middle;">${t("no_pickups_badge")}</span>`;
            } else {
                firstStopName.textContent = firstStop.name;
            }
        }
    }

    // Dynamic College Coordinates from Backend if provided
    if (data.college_location?.latitude && data.college_location?.longitude) {
        COLLEGE_LOCATION.latitude = Number(data.college_location.latitude);
        COLLEGE_LOCATION.longitude = Number(data.college_location.longitude);
        if (data.college_location.name) COLLEGE_LOCATION.name = data.college_location.name;
    }

    // Update Today's Total Students Count
    const todayStudentsElem = document.getElementById("todayStudentsCount");
    if (todayStudentsElem) {
        const count = data.total_students_today ?? data.total_assigned_students ?? "--";
        todayStudentsElem.textContent = count;
        const summaryTodayElem = document.getElementById("summaryTodayStudents");
        if (summaryTodayElem) summaryTodayElem.textContent = count;
    }

    updatePreTripOverview();
    updateStopProgressionUI();
    renderRouteStopList();

    if (isTripActive) {
        initOrUpdateRouteMap();
        if (lastPosition) {
            updateNextStopAndEta(lastPosition);
            triggerRoadRouteFetchIfNeeded(lastPosition, true);
        }
    }
    return true;
}

async function loadDriverRouteStops(requestedTripType = null) {
    const token = getToken();
    if (!token) return;

    const effectiveTripType = requestedTripType || activeTripType || selectedTripType || null;
    const initialLoginData = getInitialDriverDashboard();

    if (!requestedTripType && !window.__driverRouteStopsLoadedFromLogin && initialLoginData && initialLoginData.route_stops) {
        const cachedTripType = initialLoginData.route_stops.trip_type || initialLoginData.trip_status?.trip_type || null;
        if (!effectiveTripType || cachedTripType === effectiveTripType) {
            window.__driverRouteStopsLoadedFromLogin = true;
            applyRouteStopsPayload(initialLoginData.route_stops, effectiveTripType);
            return;
        }
    }

    try {
        const query = effectiveTripType ? `?trip_type=${encodeURIComponent(effectiveTripType)}` : "";
        const response = await fetch(`${API_BASE}/driver/route-stops${query}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.warn("Failed to load route stops:", data);
            return;
        }

        applyRouteStopsPayload(data, effectiveTripType);
    } catch (error) {
        console.error("loadDriverRouteStops error:", error);
    }
}

// ========================================================================
// PRE-TRIP OVERVIEW RENDERING
// ========================================================================

function updatePreTripOverview() {
    const routeName = document.getElementById("preTripRouteName");
    if (routeName) {
        routeName.textContent = currentBusData?.route_name || t("assigned_route");
    }

    const stopCount = document.getElementById("preTripStopCount");
    if (stopCount) {
        const count = driverRouteStops.length;
        stopCount.textContent = count === 1 ? t("stop_count_single") : t("stops_count", { count });
    }

    const firstStop = driverRouteStops[0];
    const firstStopName = document.getElementById("preTripFirstStopName");
    if (firstStopName) {
        if (firstStop?.is_extra_pickup) {
            const src = firstStop.source_bus_number ? ` • Bus ${firstStop.source_bus_number}` : "";
            firstStopName.innerHTML = `${firstStop.name || t("route_stops_ready")} <span class="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-700 border border-amber-500/30" style="vertical-align: middle;">⚡ Extra${src}</span>`;
        } else if (firstStop?.is_custom) {
            firstStopName.innerHTML = `${firstStop.name || t("route_stops_ready")} <span class="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-warn/10 text-warn border border-warn/20" style="vertical-align: middle;">Temp</span>`;
        } else if (firstStop?.is_no_pickups) {
            firstStopName.innerHTML = `${firstStop.name || t("route_stops_ready")} <span class="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-300" style="vertical-align: middle;">${t("no_pickups_badge")}</span>`;
        } else {
            firstStopName.textContent = firstStop?.name || t("route_stops_ready");
        }
    }

    renderPreTripExtraPickupsAlert();
}

function renderPreTripExtraPickupsAlert() {
    let alertElem = document.getElementById("preTripExtraPickupsAlert");
    if (!alertElem) {
        const preTripCard = document.querySelector("#preTripView > .kx-card");
        if (preTripCard) {
            alertElem = document.createElement("div");
            alertElem.id = "preTripExtraPickupsAlert";
            preTripCard.appendChild(alertElem);
        }
    }
    if (!alertElem) return;

    if (!driverExtraPickups || driverExtraPickups.length === 0) {
        alertElem.innerHTML = "";
        alertElem.classList.add("hidden");
        return;
    }

    alertElem.classList.remove("hidden");
    alertElem.className = "pt-2.5 border-t border-amber-200 mt-2";
    alertElem.innerHTML = `
        <div class="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1.5">
            <div class="flex items-center justify-between font-bold">
                <span class="flex items-center gap-1.5 text-amber-800">
                    <svg class="w-3.5 h-3.5 text-amber-600" fill="currentColor" viewBox="0 0 20 20"><path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/></svg>
                    ⚡ ${driverExtraPickups.length} Extra Pickup${driverExtraPickups.length > 1 ? 's' : ''} Today
                </span>
                <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">Reallocated</span>
            </div>
            <div class="space-y-1 text-[11px] text-amber-950">
                ${driverExtraPickups.map(p => `
                    <div class="flex items-center justify-between gap-1">
                        <span class="truncate"><strong>${p.student_name}</strong> at ${p.stop_name}</span>
                        <span class="shrink-0 font-semibold px-1.5 py-0.5 rounded bg-white/80 border border-amber-300 text-amber-800">Bus ${p.source_bus_number || '?'}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ========================================================================
// START TRIP CONTROLLER
// ========================================================================

async function selectTripType(tripType) {
    selectedTripType = tripType;
    await loadDriverRouteStops(tripType);
    updateTripTypeControls();
}

function updateTripTypeControls() {
    const startBtn = document.getElementById("startTripBtn");
    const startText = document.getElementById("startTripText");

    ["morning", "evening"].forEach((tripType) => {
        const button = document.getElementById(`${tripType}TripTypeBtn`);
        if (!button) return;
        const isSelected = selectedTripType === tripType;
        button.setAttribute("aria-pressed", String(isSelected));
        button.textContent = t(tripType);
        button.classList.toggle("bg-navy", isSelected);
        button.classList.toggle("text-white", isSelected);
        button.classList.toggle("border-navy", isSelected);
        button.classList.toggle("bg-bg", !isSelected);
        button.classList.toggle("text-navy", !isSelected);
        button.classList.toggle("border-line", !isSelected);
    });

    if (startBtn && !isTripStarting) startBtn.disabled = !selectedTripType;
    if (startText && !isTripStarting) {
        startText.textContent = selectedTripType
            ? (selectedTripType === "morning" ? t("start_morning_trip") : t("start_evening_trip"))
            : t("start_trip_select");
    }
}

async function handleStartTrip() {
    if (isTripActive || isTripStarting) return;

    if (!selectedTripType) {
        KambusNotify.notify({
            type: "warning",
            title: t("toast_select_trip_type"),
            message: t("toast_select_trip_msg")
        });
        return;
    }

    const token = getToken();
    if (!token) {
        KambusNotify.notify({
            type: "warning",
            title: t("toast_session_expired"),
            message: t("toast_session_expired_msg")
        });
        return;
    }

    if (!BUS_ID) {
        await loadDriverBus();
        if (!BUS_ID) {
            KambusNotify.notify({
                type: "error",
                title: t("toast_bus_not_assigned"),
                message: t("toast_bus_not_assigned_msg")
            });
            return;
        }
    }

    isTripStarting = true;

    const startBtn = document.getElementById("startTripBtn");
    const startIcon = document.getElementById("startTripIcon");
    const startText = document.getElementById("startTripText");

    if (startBtn) startBtn.disabled = true;
    if (startIcon) {
        startIcon.className = "w-4 h-4 animate-spin shrink-0";
        startIcon.innerHTML = '<use href="icons.svg#icon-spinner"/>';
    }
    if (startText) startText.textContent = t("starting_trip");

    try {
        const response = await fetch(`${API_BASE}/driver/start-trip`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ trip_type: selectedTripType })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || t("toast_unable_start_trip_msg"));
        }
        activeTripType = selectedTripType || data.trip_type || "morning";
        await loadDriverRouteStops(activeTripType);
        isTripActive = true;
        isGpsPaused = false;
        passedStopIds.clear();
        lastRouteFetchAt = 0;
        lastRouteFetchPos = null;
        lastNextStopId = null;
        currentSmoothedBearing = null;
        previousGpsFix = null;
        isBearingUpMode = true;
        updateCameraModeUI();

        switchToActiveTripView();
        startGpsTracking();
        startWaitRequestsPolling();
        startBusAssignmentPolling();

        KambusNotify.notify({
            type: "success",
            title: t("toast_trip_started"),
            message: t("toast_trip_started_msg")
        });
    } catch (error) {
        console.error("Start trip failed:", error);
        KambusNotify.notify({
            type: "error",
            title: t("toast_unable_start_trip"),
            message: error.message || t("toast_unable_start_trip_msg")
        });
    } finally {
        isTripStarting = false;
        if (startBtn) startBtn.disabled = !selectedTripType;
        if (startIcon) {
        startIcon.className = "w-4 h-4 shrink-0";
        startIcon.innerHTML = '<use href="icons.svg#icon-play"/>';
    }
        updateTripTypeControls();
    }
}

// ========================================================================
// END TRIP CONTROLLER (WITH CONFIRMATION MODAL)
// ========================================================================

async function confirmAndEndTrip() {
    if (!isTripActive || isTripEnding) return;

    // Safety Confirmation Modal
    const confirmed = await KambusNotify.confirm({
        title: t("confirm_end_trip_title"),
        message: t("confirm_end_trip_msg"),
        confirmText: t("confirm_end_trip_ok"),
        cancelText: t("cancel"),
        danger: true
    });

    if (!confirmed) return;

    isTripEnding = true;
    const token = getToken();

    try {
        const response = await fetch(`${API_BASE}/driver/end-trip`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || t("toast_unable_end_trip_msg"));
        }
// Stop GPS & Intervals
        stopGpsTracking();
        stopWaitRequestsPolling();
        stopBusAssignmentPolling();

        isTripActive = false;
        isGpsPaused = false;
        lastPosition = null;
        lastLocationSentAt = 0;
        passedStopIds.clear();
        lastRouteFetchAt = 0;
        lastRouteFetchPos = null;
        currentSmoothedBearing = null;
        previousGpsFix = null;
        if (routeMap && routeMap._rotate && typeof routeMap.setBearing === "function") {
            routeMap.setBearing(0);
        }
        updateCameraModeUI();

        // Clear Map Layers
        if (remainingRouteLayer) remainingRouteLayer.clearLayers();
        if (remainingRouteArrowLayer) remainingRouteArrowLayer.clearLayers();
        currentRemainingRouteLatLngs = [];
        if (completedRouteLayer) completedRouteLayer.clearLayers();
        if (driverMarker && routeMap) {
            routeMap.removeLayer(driverMarker);
            driverMarker = null;
        }

        switchToPreTripView();

        KambusNotify.notify({
            type: "success",
            title: t("toast_trip_ended"),
            message: t("toast_trip_ended_msg")
        });
    } catch (error) {
        console.error("End trip failed:", error);
        KambusNotify.notify({
            type: "error",
            title: t("toast_unable_end_trip"),
            message: error.message || t("toast_unable_end_trip_msg")
        });
    } finally {
        isTripEnding = false;
    }
}

// ========================================================================
// GPS TRACKING & LOCATION BROADCAST
// ========================================================================

function startGpsTracking() {
    acquireWakeLock();
    stopGpsTracking();

    if (!navigator.geolocation) {
        KambusNotify.notify({
            type: "error",
            title: t("toast_gps_not_supported"),
            message: t("toast_gps_not_supported_msg")
        });
        return;
    }

    gpsWatchId = navigator.geolocation.watchPosition(
        handleDriverLocationFix,
        handleDriverLocationError,
        {
            enableHighAccuracy: true,
            maximumAge: 2000,
            timeout: 10000
        }
    );
}

function stopGpsTracking() {
     releaseWakeLock();
    if (gpsWatchId !== null) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
}

function handleDriverLocationFix(position) {
    if (!isTripActive || isGpsPaused) return;

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const speedMs = position.coords.speed;
    const speed = (speedMs !== null && speedMs !== undefined && speedMs >= 0)
        ? Math.round(speedMs * 3.6)
        : null;
    const rawHeading = position.coords.heading;

    const currentPos = { latitude, longitude, speed, heading: rawHeading };

    // Bearing resolution & smoothing for navigation camera
    const targetBearing = resolveTargetBearing(
        rawHeading,
        speed,
        currentPos,
        previousGpsFix,
        currentSmoothedBearing
    );

    if (targetBearing !== null && targetBearing !== undefined) {
        currentSmoothedBearing = smoothBearing(currentSmoothedBearing, targetBearing, BEARING_SMOOTHING_ALPHA);
    }

    const isFirstFix = !lastPosition;
    previousGpsFix = lastPosition ? { ...lastPosition } : null;
    lastPosition = currentPos;

    // 1. Smoothly update Driver live marker ONLY (NO map reconstruction)
    updateDriverMarkerOnMap(latitude, longitude, speed, isFirstFix);

    // 2. Update Next Stop progress, ETA, and distance
    updateNextStopAndEta(lastPosition);

    // 3. Check if road route recalculation is needed (throttled/debounced)
    triggerRoadRouteFetchIfNeeded(lastPosition, isFirstFix);

    // 4. Broadcast live GPS to backend
    sendLocationUpdateToBackend(latitude, longitude, speed);
}

function handleDriverLocationError(error) {
    console.warn("GPS Location Error:", error);
    updateTopStatusBar();
}

async function sendLocationUpdateToBackend(latitude, longitude, speed) {
    if (locationRequestInFlight || Date.now() - lastLocationSentAt < 2500) {
        return;
    }

    const token = getToken();
    if (!token || !BUS_ID) return;

    locationRequestInFlight = true;

    try {
        const response = await fetch(`${API_BASE}/buses/${BUS_ID}/location`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                latitude: latitude,
                longitude: longitude,
                speed: speed
            })
        });

        if (response.ok) {
            lastLocationSentAt = Date.now();
            updateTopStatusBar();
            const respData = await response.json().catch(() => ({}));
            if (respData.rerouted && Array.isArray(respData.route_polyline) && respData.route_polyline.length >= 2) {
                const newCoords = respData.remaining_polyline || respData.route_polyline;
                currentRemainingRouteLatLngs = newCoords.map(p => [Number(p[0]), Number(p[1])]);
                if (remainingRouteLayer) {
                    remainingRouteLayer.clearLayers();
                    remainingRouteLayer.addData({
                        type: "Feature",
                        geometry: {
                            type: "LineString",
                            coordinates: currentRemainingRouteLatLngs.map(p => [p[1], p[0]])
                        }
                    });
                }
                if (remainingRouteArrowLayer && routeMap) {
                    renderDirectionArrows(routeMap, remainingRouteArrowLayer, currentRemainingRouteLatLngs, "#ffffff");
                }
            }
        } else if (response.status === 403) {
            // Bus was reassigned to another driver mid-trip — this driver no longer owns it
            handleBusReassignmentDetected();
        }
    } catch (e) {
        console.warn("Location send network failure:", e);
    } finally {
        locationRequestInFlight = false;
    }
}

let driverSocket = null;
let driverWsReconnectTimer = null;

function initDriverWebSocket() {
    const token = getToken();
    if (!token || typeof WebSocket === "undefined") return;
    if (driverSocket && (driverSocket.readyState === WebSocket.OPEN || driverSocket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    try {
        const wsUrl = `${API_BASE.replace(/^http/, "ws")}/ws/notifications?token=${encodeURIComponent(token)}`;
        driverSocket = new WebSocket(wsUrl);

        driverSocket.onopen = () => {
            if (driverWsReconnectTimer) {
                clearTimeout(driverWsReconnectTimer);
                driverWsReconnectTimer = null;
            }
        };

        driverSocket.onmessage = (event) => {
            try {
                if (event.data === "pong") return;
                const data = JSON.parse(event.data);
                if (data.type === "entitlements_updated") {
                    loadDriverCampusEntitlements();
                    return;
                }
                if (data.type === "route_rerouted" || data.type === "route_update") {
                    const poly = data.remaining_polyline || data.polyline;
                    if (Array.isArray(poly) && poly.length >= 2) {
                        currentRemainingRouteLatLngs = poly.map(p => [Number(p[0]), Number(p[1])]);
                        if (remainingRouteLayer) {
                            remainingRouteLayer.clearLayers();
                            remainingRouteLayer.addData({
                                type: "Feature",
                                geometry: {
                                    type: "LineString",
                                    coordinates: currentRemainingRouteLatLngs.map(p => [p[1], p[0]])
                                }
                            });
                        }
                        if (remainingRouteArrowLayer && routeMap) {
                            renderDirectionArrows(routeMap, remainingRouteArrowLayer, currentRemainingRouteLatLngs, "#ffffff");
                        }
                    }
                } else if (data.type === "wait_request_boarded") {
                    hideActiveWaitCard();
                    KambusNotify.notify({
                        type: "success",
                        title: t("toast_student_boarded"),
                        message: t("toast_student_boarded_msg")
                    });
                    setTimeout(loadActiveWaitRequests, 500);
                }
            } catch (err) {
                console.warn("Driver WS parse error:", err);
            }
        };

        driverSocket.onclose = () => {
            if (!driverWsReconnectTimer) {
                driverWsReconnectTimer = setTimeout(initDriverWebSocket, 5000);
            }
        };
    } catch (e) {
        console.warn("Driver WS init error:", e);
    }
}

// ========================================================================
// BUS REASSIGNMENT DETECTION (POLLING)
// ========================================================================
// While a trip is active, the admin can reassign this driver's bus to
// someone else at any time. The app previously kept using the stale
// BUS_ID until the driver manually logged out and back in. This polls
// /driver/my-bus periodically and also reacts immediately if a location
// POST comes back 403, so the driver is notified right away instead of
// silently continuing to broadcast to a bus they no longer own.

function startBusAssignmentPolling() {
    if (busAssignmentCheckInterval) return; // already running

    busAssignmentCheckInterval = setInterval(async () => {
        const previousBusId = BUS_ID;
        const result = await loadDriverBus();

        if (!result.success || BUS_ID !== previousBusId) {
            handleBusReassignmentDetected();
        }
    }, 45000); // check every 45 seconds
}

function stopBusAssignmentPolling() {
    if (busAssignmentCheckInterval) {
        clearInterval(busAssignmentCheckInterval);
        busAssignmentCheckInterval = null;
    }
}

async function handleBusReassignmentDetected() {
    // Avoid duplicate handling if this fires more than once in quick succession
    if (!isTripActive) return;

    stopBusAssignmentPolling();
    stopGpsTracking();
    stopWaitRequestsPolling();

    BUS_ID = null;
    currentBusData = null;
    isTripActive = false;
    isGpsPaused = false;
    lastPosition = null;
    lastLocationSentAt = 0;

    switchToPreTripView();

    KambusNotify.notify({
        type: "error",
        title: t("toast_bus_reassigned"),
        message: t("toast_bus_reassigned_msg")
    });
}

// ========================================================================
// NEXT STOP, DISTANCE, ETA & STOP PROGRESSION
// ========================================================================

function updateNextStopAndEta(driverPos) {
    if (!driverPos || driverRouteStops.length === 0) return;

    // The backend returns this array in the active trip's travel order.
    const remainingStops = driverRouteStops.filter(s => !passedStopIds.has(s.stop_id || s.id));

    if (remainingStops.length === 0) {
        if (activeTripType === "evening") {
            renderNextStopCard({
                name: t("all_stops_completed"),
                distance: 0,
                orderText: t("trip_complete"),
                studentCount: null,
                isCollege: false
            });

            currentNextStop = null;
            updateStopProgressionUI();
            return;
        }

        // All stops completed; route destination is College
        const distToCollege = calculateDistance(
            driverPos.latitude,
            driverPos.longitude,
            COLLEGE_LOCATION.latitude,
            COLLEGE_LOCATION.longitude
        );

        renderNextStopCard({
            name: COLLEGE_LOCATION.name,
            distance: distToCollege,
            orderText: t("final_destination"),
            studentCount: null,
            isCollege: true
        });

        currentNextStop = null;
        updateStopProgressionUI();
        updateCollegeEta(driverPos);
        return;
    }

    // Next upcoming stop in sequence
    const nextStop = remainingStops[0];
    const nextStopPosition = driverRouteStops.findIndex(
        stop => (stop.stop_id || stop.id) === (nextStop.stop_id || nextStop.id)
    ) + 1;
    const distToNext = calculateDistance(driverPos.latitude, driverPos.longitude, nextStop.latitude, nextStop.longitude);

    VoiceAnnouncer.checkProximityAnnouncement(
        nextStop.stop_id || nextStop.id,
        nextStop.name,
        nextStop.student_count,
        distToNext
    );

    // Auto-mark passed if within 80m of the stop
    if (distToNext <= 80) {
        passedStopIds.add(nextStop.stop_id || nextStop.id);
        updateStopProgressionUI();
        updateStopMarkersAppearance();
        triggerRoadRouteFetchIfNeeded(driverPos, true);
        return;
    }

    const previousNextStopId = currentNextStop ? (currentNextStop.stop_id || currentNextStop.id) : null;
    currentNextStop = nextStop;

    const isFinalStop = (nextStopPosition === driverRouteStops.length);
    const orderText = isFinalStop && activeTripType === "evening"
        ? t("stop_order_badge_final", { order: nextStopPosition, total: driverRouteStops.length })
        : t("stop_order_badge", { order: nextStopPosition, total: driverRouteStops.length });

    renderNextStopCard({
        name: nextStop.name,
        distance: distToNext,
        orderText: orderText,
        studentCount: nextStop.student_count,
        isCollege: false,
        isCustom: Boolean(nextStop.is_custom),
        isExtraPickup: Boolean(nextStop.is_extra_pickup || nextStop.has_reallocated_students || nextStop.is_reallocated),
        isNoPickups: Number(nextStop.student_count || 0) === 0,
        sourceBusNumber: nextStop.source_bus_number,
        reallocatedCount: Number(nextStop.reallocated_student_count || 0)
    });

    updateStopProgressionUI();
    updateCollegeEta(driverPos);

    // If next stop changed, update markers and trigger route refetch
    if (previousNextStopId !== (nextStop.stop_id || nextStop.id)) {
        updateStopMarkersAppearance();
        triggerRoadRouteFetchIfNeeded(driverPos, true);
    }
}

function renderNextStopCard({ name, distance, orderText, studentCount, isCollege, isCustom = false, isExtraPickup = false, isNoPickups = false, sourceBusNumber = null, reallocatedCount = 0 }) {
    const nameElem = document.getElementById("nextStopName");
    if (nameElem) nameElem.textContent = name;

    const distElem = document.getElementById("nextStopDistance");
    if (distElem) {
        distElem.textContent = distance >= 1000
            ? `${(distance / 1000).toFixed(1)} km`
            : `${Math.round(distance)} m`;
    }

    const badgeElem = document.getElementById("nextStopOrderBadge");
    if (badgeElem) {
        if (isExtraPickup) {
            const busTag = sourceBusNumber ? `Bus ${sourceBusNumber}` : "Reallocated";
            badgeElem.innerHTML = `${orderText} <span class="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 border border-amber-500/40" style="vertical-align: text-bottom;">⚡ ${busTag}</span>`;
            badgeElem.classList.remove("text-ink-muted", "bg-bg", "border-line", "text-warn", "bg-warn/10", "border-warn/20", "text-slate-600", "bg-slate-100", "border-slate-300");
            badgeElem.classList.add("text-amber-800", "bg-amber-50", "border-amber-300");
        } else if (isCustom) {
            badgeElem.innerHTML = `${orderText} <span class="ml-1 inline-block px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider bg-warn/20 text-warn border border-warn" style="vertical-align: text-bottom;">Temp</span>`;
            badgeElem.classList.remove("text-ink-muted", "bg-bg", "border-line", "text-amber-800", "bg-amber-50", "border-amber-300", "text-slate-600", "bg-slate-100", "border-slate-300");
            badgeElem.classList.add("text-warn", "bg-warn/10", "border-warn/20");
        } else if (isNoPickups && !isCollege) {
            badgeElem.innerHTML = `${orderText} <span class="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-300" style="vertical-align: text-bottom;">${t("no_pickups_badge")}</span>`;
            badgeElem.classList.remove("text-ink-muted", "bg-bg", "border-line", "text-warn", "bg-warn/10", "border-warn/20", "text-amber-800", "bg-amber-50", "border-amber-300");
            badgeElem.classList.add("text-slate-600", "bg-slate-100", "border-slate-300");
        } else {
            badgeElem.textContent = orderText;
            badgeElem.classList.remove("text-warn", "bg-warn/10", "border-warn/20", "text-amber-800", "bg-amber-50", "border-amber-300", "text-slate-600", "bg-slate-100", "border-slate-300");
            badgeElem.classList.add("text-ink-muted", "bg-bg", "border-line");
        }
    }

    // Next Stop ETA calculation
    const etaElem = document.getElementById("nextStopEta");
    if (etaElem) {
        const speedKmh = (lastPosition?.speed && lastPosition.speed >= 12) ? lastPosition.speed : 25;
        const minutes = Math.max(1, Math.ceil((distance / 1000) / (speedKmh / 60)));
        etaElem.textContent = t("next_stop_eta", { min: minutes });
    }

    // Expected Students Count
    const studentsContainer = document.getElementById("nextStopStudentsContainer");
    const studentsElem = document.getElementById("nextStopStudents");

    if (studentsContainer && studentsElem) {
        const count = Number(studentCount);
        if (isCollege || !Number.isFinite(count) || count < 0) {
            studentsContainer.classList.add("hidden");
        } else if (count === 0) {
            studentsContainer.classList.remove("hidden");
            studentsElem.textContent = t("no_pickups_expected");
        } else {
            studentsContainer.classList.remove("hidden");
            let text = count === 1
                ? t("student_expected_single")
                : t("students_expected", { count });
            if (isExtraPickup && reallocatedCount > 0) {
                const src = sourceBusNumber ? `from Bus ${sourceBusNumber}` : "reallocated";
                text += ` (${reallocatedCount} extra ${src})`;
            }
            studentsElem.textContent = text;
        }
    }
}

function updateCollegeEta(driverPos) {
    const clockElem = document.getElementById("collegeClockEta");
    const durationElem = document.getElementById("collegeDurationEta");
    const labelElem = document.getElementById("collegeEtaLabel");

    if (!clockElem || !durationElem || !driverPos) return;

    const finalStop = activeTripType === "evening" && driverRouteStops.length > 0
        ? driverRouteStops[driverRouteStops.length - 1]
        : null;
    const destination = finalStop || COLLEGE_LOCATION;

    const labelText = finalStop ? t("eta_to_final_stop") : t("eta_to_college");
    if (labelElem) {
        labelElem.textContent = labelText;
    }
    const summaryLabelElem = document.getElementById("summaryCollegeLabel");
    if (summaryLabelElem) {
        summaryLabelElem.textContent = finalStop ? t("final_stop_label") : t("college_label");
    }

    const distanceMeters = calculateDistance(
        driverPos.latitude,
        driverPos.longitude,
        Number(destination.latitude),
        Number(destination.longitude)
    );

    const speedKmh = (driverPos.speed && driverPos.speed >= 15) ? driverPos.speed : 28;
    const durationMinutes = Math.max(2, Math.ceil((distanceMeters / 1000) / (speedKmh / 60)));

    durationElem.textContent = t("duration_approx_min", { min: durationMinutes });

    const etaDate = new Date(Date.now() + durationMinutes * 60000);
    const clockTime = etaDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    clockElem.textContent = clockTime;

    const summaryEtaElem = document.getElementById("summaryCollegeEta");
    if (summaryEtaElem) {
        summaryEtaElem.textContent = t("summary_college_eta", { min: durationMinutes, time: clockTime });
    }
}

function updateStopProgressionUI() {
    const passedCount = passedStopIds.size;
    const totalStops = driverRouteStops.length;
    const remainingCount = Math.max(0, totalStops - passedCount);

    const passedElem = document.getElementById("progressPassedText");
    if (passedElem) passedElem.innerHTML = `<svg class="w-3.5 h-3.5 text-ok shrink-0 inline mr-1" aria-hidden="true"><use href="icons.svg#icon-check"/></svg>${t("passed_count", { count: passedCount })}`;

    const remainingElem = document.getElementById("progressRemainingText");
    if (remainingElem) remainingElem.textContent = t("remaining_count", { count: remainingCount });

    const nextElem = document.getElementById("progressNextText");
    if (nextElem) {
        if (currentNextStop) {
            const noPickupsTag = (Number(currentNextStop.student_count || 0) === 0) ? ` (${t("no_pickups_badge")})` : '';
            const extraTag = currentNextStop.is_extra_pickup
                ? ` (Extra • Bus ${currentNextStop.source_bus_number || '?'})`
                : (currentNextStop.is_custom ? ' (Temp)' : noPickupsTag);
            nextElem.textContent = `${t("next_stop_prefix", { name: currentNextStop.name })}${extraTag}`;
        } else {
            nextElem.textContent = t("to_college");
        }
    }

    const summaryPassedElem = document.getElementById("summaryPassedCount");
    if (summaryPassedElem) summaryPassedElem.textContent = passedCount;
    const summaryProgressElem = document.getElementById("summaryProgressText");
    if (summaryProgressElem) {
        summaryProgressElem.textContent = t("summary_passed_ratio", { passed: passedCount, total: totalStops });
    }

    updateActiveTripExtraPickupsBanner();
    renderExtraPickupsSummary();
    renderRouteStopList();
}

function updateActiveTripExtraPickupsBanner() {
    let banner = document.getElementById("activeTripExtraPickupsBanner");
    if (!banner) {
        const activeTripView = document.getElementById("activeTripView");
        if (activeTripView) {
            banner = document.createElement("div");
            banner.id = "activeTripExtraPickupsBanner";
            const nextStopSection = activeTripView.querySelector("section");
            if (nextStopSection && nextStopSection.nextElementSibling) {
                activeTripView.insertBefore(banner, nextStopSection.nextElementSibling);
            } else {
                activeTripView.prepend(banner);
            }
        }
    }
    if (!banner) return;

    if (!driverExtraPickups || driverExtraPickups.length === 0) {
        banner.innerHTML = "";
        banner.classList.add("hidden");
        return;
    }

    const reallocSummary = driverExtraPickups.map(p => `${p.student_name} (Bus ${p.source_bus_number || '?'})`).join(', ');
    banner.classList.remove("hidden");
    banner.className = "p-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-center gap-2 shadow-xs";
    banner.innerHTML = `
        <div class="w-6 h-6 rounded-lg bg-amber-200 flex items-center justify-center shrink-0 text-amber-800 font-bold text-xs">⚡</div>
        <div class="min-w-0 flex-1">
            <span class="font-bold text-amber-900">${driverExtraPickups.length} Extra Pickup${driverExtraPickups.length > 1 ? 's' : ''}:</span>
            <span class="text-amber-800 text-[11px] truncate block">${reallocSummary}</span>
        </div>
    `;
}

function renderExtraPickupsSummary() {
    let container = document.getElementById("extraPickupsSummaryContainer");
    if (!container) {
        const parent = document.getElementById("summaryDetailsContent");
        if (parent) {
            container = document.createElement("div");
            container.id = "extraPickupsSummaryContainer";
            parent.appendChild(container);
        }
    }
    if (!container) return;

    if (!driverExtraPickups || driverExtraPickups.length === 0) {
        container.innerHTML = "";
        container.classList.add("hidden");
        return;
    }

    container.classList.remove("hidden");
    container.className = "kx-card-sub p-2.5 space-y-2 border border-amber-200 bg-amber-50/50 rounded-xl";
    container.innerHTML = `
        <div class="flex items-center justify-between text-xs font-bold text-amber-900 uppercase tracking-wider">
            <span class="flex items-center gap-1.5">
                <svg class="w-3.5 h-3.5 text-amber-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"/></svg>
                Extra Pickups (${driverExtraPickups.length})
            </span>
            <span class="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 border border-amber-300">Reallocated</span>
        </div>
        <div class="space-y-1.5 text-xs text-navy">
            ${driverExtraPickups.map(p => `
                <div class="flex items-center justify-between gap-2 p-1.5 rounded bg-surface border border-amber-200/70 shadow-xs">
                    <div class="min-w-0">
                        <p class="font-semibold text-navy truncate">${p.student_name} <span class="font-normal font-mono text-ink-muted text-[11px]">(${p.roll_number})</span></p>
                        <p class="text-[11px] text-ink-muted truncate">Stop: <strong class="text-navy">${p.stop_name}</strong></p>
                    </div>
                    <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                        From Bus ${p.source_bus_number || '?'}
                    </span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderRouteStopList() {
    const listContainers = [
        document.getElementById("driverRouteStopList"),
        document.getElementById("preTripRouteStopList")
    ].filter(Boolean);

    if (listContainers.length === 0) return;

    if (!driverRouteStops || driverRouteStops.length === 0) {
        listContainers.forEach(container => {
            container.innerHTML = `<p class="text-xs text-ink-muted text-center py-2">${t("loading_route")}</p>`;
        });
        return;
    }

    const totalCountText = driverRouteStops.length === 1 ? t("stop_count_single") : t("stops_count", { count: driverRouteStops.length });
    const countBadge = document.getElementById("routeStopsCountBadge");
    if (countBadge) countBadge.textContent = totalCountText;
    const preTripCountBadge = document.getElementById("preTripStopListCount");
    if (preTripCountBadge) preTripCountBadge.textContent = totalCountText;
    const preTripCard = document.getElementById("preTripRouteStopListCard");
    if (preTripCard) preTripCard.classList.remove("hidden");

    const html = driverRouteStops.map((stop, index) => {
        const stopId = stop.stop_id || stop.id;
        const isPassed = passedStopIds.has(stopId);
        const isNext = currentNextStop && (currentNextStop.stop_id || currentNextStop.id) === stopId;
        const isNoPickups = Number(stop.student_count || 0) === 0;
        const isCustom = Boolean(stop.is_custom);
        const isExtraPickup = Boolean(stop.is_extra_pickup || stop.has_reallocated_students || stop.is_reallocated);
        const count = Number(stop.student_count || 0);

        let badgeHtml = "";
        if (isNoPickups) {
            badgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-300 shrink-0">${t("no_pickups_badge")}</span>`;
        } else if (isExtraPickup) {
            const src = stop.source_bus_number ? ` • Bus ${stop.source_bus_number}` : "";
            badgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-700 border border-amber-500/30 shrink-0">⚡ Extra${src}</span>`;
        } else if (isCustom) {
            badgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-warn/10 text-warn border border-warn/20 shrink-0">Temp</span>`;
        } else {
            badgeHtml = `<span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-ink-muted bg-bg border border-line shrink-0">${count} ${t("expected_abbrev")}</span>`;
        }

        let rowClasses = "flex items-center justify-between p-2 rounded-lg border text-xs transition-colors ";
        let orderIndicator = "";

        if (isPassed) {
            rowClasses += "bg-bg/60 border-line text-ink-muted opacity-60";
            orderIndicator = `<span class="w-5 h-5 rounded-full bg-ok/10 text-ok flex items-center justify-center text-[10px] shrink-0 font-bold">✓</span>`;
        } else if (isNext) {
            rowClasses += "bg-brand/5 border-brand/40 text-navy font-semibold shadow-xs ring-1 ring-brand/20";
            orderIndicator = `<span class="w-5 h-5 rounded-full bg-navy text-white flex items-center justify-center text-[10px] shrink-0 font-bold">${index + 1}</span>`;
        } else if (isNoPickups) {
            rowClasses += "bg-slate-50/80 border-dashed border-slate-200 text-slate-500";
            orderIndicator = `<span class="w-5 h-5 rounded-full bg-slate-200 text-slate-500 border border-dashed border-slate-400 flex items-center justify-center text-[10px] shrink-0 font-medium">${index + 1}</span>`;
        } else {
            rowClasses += "bg-surface border-line text-navy";
            orderIndicator = `<span class="w-5 h-5 rounded-full bg-bg border border-line text-ink-muted flex items-center justify-center text-[10px] shrink-0 font-medium">${index + 1}</span>`;
        }

        return `
            <div class="${rowClasses}" data-stop-id="${stopId}">
                <div class="flex items-center gap-2 min-w-0 pr-2">
                    ${orderIndicator}
                    <span class="truncate ${isNoPickups && !isNext ? 'text-slate-500' : ''}">${stop.name}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    ${badgeHtml}
                </div>
            </div>
        `;
    }).join("");

    listContainers.forEach(container => {
        container.innerHTML = html;
    });
}

function toggleTripSummary() {
    const details = document.getElementById("summaryDetailsContent");
    const btn = document.getElementById("summaryToggleBtn");
    const chevron = document.getElementById("summaryChevronIcon");
    if (!details) return;

    const isHidden = details.classList.contains("hidden");
    if (isHidden) {
        details.classList.remove("hidden");
        btn?.setAttribute("aria-expanded", "true");
        chevron?.classList.add("rotate-180");
    } else {
        details.classList.add("hidden");
        btn?.setAttribute("aria-expanded", "false");
        chevron?.classList.remove("rotate-180");
    }
}
window.toggleTripSummary = toggleTripSummary;

// ========================================================================
// LIVE ROAD ROUTE MAP (LEAFLET + OSRM PUBLIC ROUTING)
// ========================================================================

function initOrUpdateRouteMap() {
    const mapContainer = document.getElementById("routeMap");
    if (!mapContainer) return;

    if (!routeMap) {
        routeMap = L.map("routeMap", {
            zoomControl: false,
            attributionControl: false,
            rotate: true,
            rotateControl: false,
            touchRotate: false
        }).setView([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude], 14);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(routeMap);

        // Separate layer groups for roads and markers
        completedRouteLayer = L.geoJSON(null, {
            style: { color: "#52707A", weight: 4, opacity: 0.55 }
        }).addTo(routeMap);

        remainingRouteLayer = L.geoJSON(null, {
            style: { color: "#4A6F79", weight: 5, opacity: 0.85 }
        }).addTo(routeMap);

        if (!remainingRouteArrowLayer) {
            remainingRouteArrowLayer = L.layerGroup().addTo(routeMap);
            routeMap.on("zoomend", function () {
                if (currentRemainingRouteLatLngs && currentRemainingRouteLatLngs.length >= 2) {
                    renderDirectionArrows(routeMap, remainingRouteArrowLayer, currentRemainingRouteLatLngs, "#ffffff");
                }
            });
        }

        stopMarkersGroup = L.layerGroup().addTo(routeMap);
    }

    renderMapMarkers();
}

function renderMapMarkers() {
    if (!stopMarkersGroup) return;
    stopMarkersGroup.clearLayers();

    // 1. Plot Stops
    driverRouteStops.forEach((stop, index) => {
        const lat = Number(stop.latitude);
        const lng = Number(stop.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const isPassed = passedStopIds.has(stop.stop_id || stop.id);
        const isNext = currentNextStop && (currentNextStop.stop_id || currentNextStop.id) === (stop.stop_id || stop.id);
        const isCustom = Boolean(stop.is_custom);
        const isExtraPickup = Boolean(stop.is_extra_pickup || stop.has_reallocated_students || stop.is_reallocated);
        const isNoPickups = (stop.is_no_pickups !== undefined) ? Boolean(stop.is_no_pickups) : (Number(stop.student_count || 0) === 0 && !isCustom && !isExtraPickup);
        const sourceBusNumber = stop.source_bus_number;

        const stopIcon = createStopMarkerIcon(index + 1, isPassed, isNext, isCustom, isExtraPickup, isNoPickups);

        const isLastInTrip = (index === driverRouteStops.length - 1);
        const stopLabel = (isLastInTrip && activeTripType === "evening")
            ? `Stop ${index + 1} (Final Stop)`
            : `Stop ${index + 1}`;

        const tempBadgeHtml = isCustom ? ` <span style="display:inline-block; font-size:10px; font-weight:700; background:var(--warn-bg); color:var(--warn); border:1px solid rgba(138,95,10,0.3); padding:1px 5px; border-radius:4px; text-transform:uppercase; margin-left:4px;">Temp Stop</span>` : '';
        const extraBadgeHtml = isExtraPickup ? ` <span style="display:inline-block; font-size:10px; font-weight:700; background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; padding:1px 5px; border-radius:4px; margin-left:4px;">⚡ Extra Pickup${sourceBusNumber ? ` (Bus ${sourceBusNumber})` : ''}</span>` : '';
        const noPickupsBadgeHtml = isNoPickups ? ` <span style="display:inline-block; font-size:10px; font-weight:700; background:#F1F5F9; color:#64748B; border:1px solid #CBD5E1; padding:1px 5px; border-radius:4px; margin-left:4px;">${t("no_pickups_badge")}</span>` : '';

        const studentsListHtml = (stop.students && stop.students.length > 0)
            ? `<div style="margin-top:4px;font-size:11px;color:#374151;">${stop.students.map(st => `• ${st.name}${st.is_reallocated ? ` <strong style="color:#B45309;">(From Bus ${st.source_bus_number || '?'})</strong>` : ''}`).join('<br>')}</div>`
            : '';

        const studentCountText = isNoPickups
            ? ' • 0 expected (No pickups)'
            : (stop.student_count ? ` • ${stop.student_count} expected` : '');

        const marker = L.marker([lat, lng], {
            icon: stopIcon,
            zIndexOffset: isNext ? 500 : (isNoPickups ? 40 : (isExtraPickup ? 200 : (isCustom ? 150 : 100)))
        }).bindPopup(`<strong>${stop.name}</strong>${tempBadgeHtml}${extraBadgeHtml}${noPickupsBadgeHtml}<br>${stopLabel}${studentCountText}${studentsListHtml}`);

        marker.stopData = stop;
        stopMarkersGroup.addLayer(marker);
    });

    // 2. Plot College Marker
    const collegeIcon = L.divIcon({
        className: "",
        html: `
            <div style="
                width: 32px; height: 32px;
                border-radius: 4px;
                background: var(--navy);
                color: #ffffff;
                border: 2px solid #ffffff;
                display: flex; align-items: center; justify-content: center;
            ">
                <svg style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2;"><use href="icons.svg#icon-kambus"/></svg>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    const collegeRole = activeTripType === "evening" ? "Trip Starting Point" : "Final Destination";
    collegeMarker = L.marker([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude], {
        icon: collegeIcon,
        zIndexOffset: 300
    }).bindPopup(`<strong>${COLLEGE_LOCATION.name}</strong><br>${collegeRole}`);

    stopMarkersGroup.addLayer(collegeMarker);

    // Initial bounds fitting if no GPS fix yet
    if (!lastPosition && driverRouteStops.length > 0) {
        const boundsCoords = driverRouteStops.map(s => [s.latitude, s.longitude]);
        boundsCoords.push([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude]);
        routeMap.fitBounds(L.latLngBounds(boundsCoords), { padding: [35, 35] });
    }
}

function createStopMarkerIcon(stopOrder, isPassed, isNext, isCustom = false, isExtraPickup = false, isNoPickups = false) {
    let bg = '#ffffff';
    let color = '#173541';
    let border = '3px solid #E3E8E8';
    let size = 26;
    let shadow = '0 2px 6px rgba(0,0,0,0.15)';

    if (isExtraPickup) {
        if (isPassed) {
            bg = '#78350F';
            color = '#ffffff';
            border = '2px solid #D97706';
            shadow = '0 1px 4px rgba(217, 119, 6, 0.2)';
        } else if (isNext) {
            bg = '#D97706';
            color = '#ffffff';
            border = '3px solid #78350F';
            size = 32;
            shadow = '0 0 0 4px rgba(217, 119, 6, 0.45), 0 3px 8px rgba(0,0,0,0.3)';
        } else {
            bg = '#FEF3C7';
            color = '#92400E';
            border = '3px solid #D97706';
            size = 28;
            shadow = '0 0 0 2px rgba(217, 119, 6, 0.25), 0 2px 6px rgba(0,0,0,0.15)';
        }
    } else if (isCustom) {
        if (isPassed) {
            bg = '#B59B7C';
            color = '#ffffff';
            border = '2px solid #8A5F0A';
            shadow = '0 1px 4px rgba(138, 95, 10, 0.2)';
        } else if (isNext) {
            bg = '#E8B04A';
            color = '#173541';
            border = '3px solid #8A5F0A';
            size = 30;
            shadow = '0 0 0 4px rgba(232, 176, 74, 0.4), 0 3px 8px rgba(0,0,0,0.25)';
        } else {
            bg = '#FBF1DC';
            color = '#8A5F0A';
            border = '3px solid #E8B04A';
            shadow = '0 2px 6px rgba(138, 95, 10, 0.25)';
        }
    } else if (isNoPickups) {
        if (isPassed) {
            bg = '#E2E8F0';
            color = '#94A3B8';
            border = '2px solid #CBD5E1';
            size = 24;
            shadow = 'none';
        } else if (isNext) {
            bg = '#64748B';
            color = '#ffffff';
            border = '3px dashed #334155';
            size = 30;
            shadow = '0 0 0 4px rgba(100, 116, 139, 0.25), 0 3px 8px rgba(0,0,0,0.15)';
        } else {
            bg = '#F1F5F9';
            color = '#64748B';
            border = '2px dashed #94A3B8';
            size = 24;
            shadow = '0 1px 3px rgba(0,0,0,0.06)';
        }
    } else {
        if (isPassed) {
            bg = '#52707A';
            color = '#ffffff';
            border = '2px solid #173541';
        } else if (isNext) {
            bg = '#4A6F79';
            color = '#ffffff';
            border = '3px solid #173541';
            size = 30;
            shadow = '0 0 0 4px rgba(79, 70, 229, 0.25), 0 3px 8px rgba(0,0,0,0.2)';
        }
    }

    const extraTagHtml = isExtraPickup && !isNoPickups ? `
        <span style="
            position: absolute; top: -7px; right: -10px;
            background: #D97706; color: #ffffff;
            font-size: 8px; font-weight: 900; font-family: IBM Plex Sans, sans-serif;
            padding: 1px 4px; border-radius: 4px;
            border: 1.5px solid #ffffff; line-height: 1.1;
            letter-spacing: 0.5px; pointer-events: none;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        ">⚡ EXTRA</span>
    ` : (isCustom && !isNoPickups ? `
        <span style="
            position: absolute; top: -5px; right: -8px;
            background: #8A5F0A; color: #ffffff;
            font-size: 8px; font-weight: 800; font-family: IBM Plex Sans, sans-serif;
            padding: 1px 3px; border-radius: 4px;
            border: 1px solid #ffffff; line-height: 1;
            letter-spacing: 0.5px; pointer-events: none;
        ">TEMP</span>
    ` : (isNoPickups ? `
        <span style="
            position: absolute; top: -5px; right: -8px;
            background: #64748B; color: #ffffff;
            font-size: 8px; font-weight: 800; font-family: IBM Plex Sans, sans-serif;
            padding: 1px 3px; border-radius: 4px;
            border: 1px solid #ffffff; line-height: 1;
            letter-spacing: 0.5px; pointer-events: none;
        ">0</span>
    ` : ''));

    return L.divIcon({
        className: "",
        html: `
            <div style="position: relative; width: ${size}px; height: ${size}px;">
                <div style="
                    width: ${size}px; height: ${size}px;
                    border-radius: 50%;
                    background: ${bg};
                    color: ${color};
                    border: ${border};
                    display: flex; align-items: center; justify-content: center;
                    font-size: ${isNext ? '12px' : '11px'}; font-weight: 900;
                    box-shadow: ${shadow};
                ">
                    ${isPassed ? '•' : (stopOrder || '•')}
                </div>
                ${extraTagHtml}
            </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}

function updateStopMarkersAppearance() {
    if (!stopMarkersGroup) return;

    stopMarkersGroup.eachLayer(layer => {
        if (layer.stopData) {
            const stop = layer.stopData;
            const isPassed = passedStopIds.has(stop.stop_id || stop.id);
            const isNext = currentNextStop && (currentNextStop.stop_id || currentNextStop.id) === (stop.stop_id || stop.id);
            const isCustom = Boolean(stop.is_custom);
            const isExtraPickup = Boolean(stop.is_extra_pickup || stop.has_reallocated_students || stop.is_reallocated);
            const isNoPickups = (stop.is_no_pickups !== undefined) ? Boolean(stop.is_no_pickups) : (Number(stop.student_count || 0) === 0 && !isCustom && !isExtraPickup);
            const stopPosition = driverRouteStops.findIndex(
                routeStop => (routeStop.stop_id || routeStop.id) === (stop.stop_id || stop.id)
            ) + 1;
            layer.setIcon(createStopMarkerIcon(stopPosition, isPassed, isNext, isCustom, isExtraPickup, isNoPickups));
            layer.setZIndexOffset(isNext ? 500 : (isNoPickups ? 40 : (isExtraPickup ? 200 : (isCustom ? 150 : (isPassed ? 50 : 100)))));
        }
    });
}

function updateDriverMarkerOnMap(latitude, longitude, speed, isFirstFix = false) {
    if (!routeMap) return;

    if (!driverMarker) {
        const busIcon = L.divIcon({
            className: "",
            html: `
                <div style="position: relative; width: 36px; height: 36px;">
                    <div class="bus-pulse-ring" style="
                        position: absolute; inset: -4px;
                        border-radius: 50%;
                        background: rgba(30, 58, 138, 0.25);
                    "></div>
                    <div style="
                        position: relative;
                        width: 36px; height: 36px;
                        border-radius: 50%;
                        background: var(--navy);
                        color: white;
                        border: 2px solid white;
                        display: flex; align-items: center; justify-content: center;
                    ">
                        <svg style="width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2;"><use href="icons.svg#icon-bus"/></svg>
                    </div>
                </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });

        driverMarker = L.marker([latitude, longitude], { icon: busIcon, zIndexOffset: 1000 }).addTo(routeMap);

        if (isFirstFix) {
            if (isBearingUpMode) {
                applyBearingUpCamera(latitude, longitude, currentSmoothedBearing, 17);
            } else {
                routeMap.setView([latitude, longitude], 15);
            }
        }
    } else {
        // Smoothly update marker location
        driverMarker.setLatLng([latitude, longitude]);

        // Auto-recenter map to follow the bus on every fix while trip is active
        if (isTripActive) {
            if (isBearingUpMode) {
                applyBearingUpCamera(latitude, longitude, currentSmoothedBearing);
            } else {
                routeMap.panTo([latitude, longitude], { animate: true, duration: 0.5 });
            }
        }
    }
}

function recenterRouteMap() {
    if (!routeMap) return;

    if (isTripActive && lastPosition) {
        if (isBearingUpMode) {
            applyBearingUpCamera(lastPosition.latitude, lastPosition.longitude, currentSmoothedBearing, 17);
        } else {
            routeMap.setView([lastPosition.latitude, lastPosition.longitude], 16, { animate: true });
        }
        driverMarker?.openPopup();
        return;
    }

    if (driverRouteStops.length > 0) {
        const boundsCoords = driverRouteStops.map(s => [s.latitude, s.longitude]);
        boundsCoords.push([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude]);
        if (lastPosition) {
            boundsCoords.push([lastPosition.latitude, lastPosition.longitude]);
        }
        routeMap.fitBounds(L.latLngBounds(boundsCoords), { padding: [35, 35], animate: true });
        return;
    }

    routeMap.setView([COLLEGE_LOCATION.latitude, COLLEGE_LOCATION.longitude], 14, { animate: true });
}

// ========================================================================
// BEARING-UP NAVIGATION CAMERA & HEADING CONTROLLER
// ========================================================================

/**
 * Standard forward-azimuth calculation between consecutive GPS points.
 * Returns bearing in degrees [0, 360).
 */
function calculateBearingFromCoords(lat1, lon1, lat2, lon2) {
    if (!Number.isFinite(lat1) || !Number.isFinite(lon1) ||
        !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
        return null;
    }
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const phi1 = lat1 * toRad;
    const phi2 = lat2 * toRad;
    const deltaLambda = (lon2 - lon1) * toRad;

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
              Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

    const theta = Math.atan2(y, x);
    return ((theta * toDeg) % 360 + 360) % 360;
}

/**
 * Resolves the target heading according to sensor availability and speed:
 * - Uses device bearing if available and speed > 2 km/h (eliminates stationary sensor jitter).
 * - Falls back to 2-point GPS forward azimuth if distance >= 3m.
 * - Otherwise retains last known bearing to prevent map spin while stopped.
 */
function resolveTargetBearing(deviceHeading, speedKmh, currentPos, prevPos, lastKnownBearing = null) {
    const hasValidDeviceHeading = (
        deviceHeading !== null &&
        deviceHeading !== undefined &&
        !isNaN(deviceHeading) &&
        Number.isFinite(Number(deviceHeading))
    );
    const validSpeed = (typeof speedKmh === "number" && !isNaN(speedKmh)) ? speedKmh : 0;

    // 1. Device-reported bearing when moving above threshold (> 2 km/h)
    if (hasValidDeviceHeading && validSpeed > MIN_SPEED_FOR_DEVICE_BEARING_KMH) {
        return ((Number(deviceHeading) % 360) + 360) % 360;
    }

    // 2. Fall back to computing bearing from the last two valid GPS points
    if (prevPos && currentPos) {
        const distM = calculateDistance(
            prevPos.latitude, prevPos.longitude,
            currentPos.latitude, currentPos.longitude
        );
        if (distM >= MIN_DISTANCE_FOR_CALCULATED_BEARING_M) {
            const calculated = calculateBearingFromCoords(
                prevPos.latitude, prevPos.longitude,
                currentPos.latitude, currentPos.longitude
            );
            if (calculated !== null) {
                return calculated;
            }
        }
    }

    // 3. Stationary or low speed with no displacement -> retain last known bearing
    return lastKnownBearing;
}

/**
 * Exponential moving average across the circular 0° / 360° boundary.
 * Computes shortest angular delta between -180° and +180° to avoid spinning the camera.
 */
function smoothBearing(currentSmoothed, targetBearing, alpha = BEARING_SMOOTHING_ALPHA) {
    if (targetBearing === null || targetBearing === undefined || !Number.isFinite(targetBearing)) {
        return currentSmoothed;
    }
    if (currentSmoothed === null || currentSmoothed === undefined || !Number.isFinite(currentSmoothed)) {
        return ((targetBearing % 360) + 360) % 360;
    }

    // Shortest angular difference in range [-180, 180]
    let diff = ((targetBearing - currentSmoothed + 540) % 360) - 180;
    let newBearing = (currentSmoothed + alpha * diff) % 360;
    if (newBearing < 0) newBearing += 360;
    return newBearing;
}

/**
 * Offsets the map center so the bus marker sits in the bottom third of the viewport,
 * opening up the road ahead like Google Maps turn-by-turn navigation.
 */
function computeNavigationCenter(lat, lng, bearingDeg, zoom, containerHeight = null) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [lat, lng];

    const mapContainer = document.getElementById("routeMap");
    const mapH = containerHeight || (mapContainer ? mapContainer.clientHeight : 400) || 400;

    // Offset the bus into the bottom third: roughly 22% of viewport height below screen center
    const pixelOffset = Math.round(mapH * 0.22);

    const safeBearing = Number.isFinite(bearingDeg) ? bearingDeg : 0;
    const safeZoom = Number.isFinite(zoom) ? zoom : 17;
    const toRad = Math.PI / 180;

    // Ground resolution in meters/pixel at latitude and zoom level
    const metersPerPixel = (156543.03392 * Math.cos(lat * toRad)) / Math.pow(2, safeZoom);
    const distMeters = pixelOffset * metersPerPixel;

    const bearingRad = safeBearing * toRad;
    const deltaLat = (distMeters * Math.cos(bearingRad)) / 111320;
    const deltaLng = (distMeters * Math.sin(bearingRad)) / (111320 * Math.cos(lat * toRad));

    return [lat + deltaLat, lng + deltaLng];
}

/**
 * Applies the bearing-up navigation camera to the driver map instance.
 * Rotates the map container so heading is UP and positions the bus in the lower viewport.
 */
function applyBearingUpCamera(lat, lng, bearingDeg, targetZoom = null) {
    if (!routeMap) return;

    const currentZoom = (typeof routeMap.getZoom === "function") ? routeMap.getZoom() : 17;
    const zoom = targetZoom ? targetZoom : Math.max(currentZoom, 17);
    const smoothed = (bearingDeg !== null && bearingDeg !== undefined && Number.isFinite(bearingDeg))
        ? bearingDeg
        : 0;

    // Rotate map so bus bearing points UP:
    // When bus bearing is B (clockwise from north), map rotates counter-clockwise by B (i.e. 360 - B)
    if (routeMap._rotate && typeof routeMap.setBearing === "function") {
        const mapBearing = (360 - (smoothed % 360)) % 360;
        routeMap.setBearing(mapBearing);
    }

    const center = computeNavigationCenter(lat, lng, smoothed, zoom);
    routeMap.setView(center, zoom, { animate: true, duration: 0.35 });
}

/**
 * Toggles between Bearing-Up Follow Mode and Flat North-Up Overview Mode.
 */
function toggleCameraMode() {
    isBearingUpMode = !isBearingUpMode;
    updateCameraModeUI();

    if (!routeMap) return;

    if (isBearingUpMode) {
        // Nav Mode (Bearing-Up Follow):
        // 1. Hide directional arrows (camera rotation provides direction)
        if (remainingRouteArrowLayer) {
            remainingRouteArrowLayer.clearLayers();
        }
        // 2. Orient and offset camera to follow bus
        if (lastPosition) {
            applyBearingUpCamera(lastPosition.latitude, lastPosition.longitude, currentSmoothedBearing, 17);
        }
    } else {
        // Overview Mode (Flat North-Up):
        // 1. Reset map bearing to 0 (North up)
        if (routeMap._rotate && typeof routeMap.setBearing === "function") {
            routeMap.setBearing(0);
        }
        // 2. Recenter view
        if (lastPosition) {
            routeMap.setView([lastPosition.latitude, lastPosition.longitude], 15, { animate: true });
        }
        // 3. Re-render directional arrows
        if (currentRemainingRouteLatLngs && currentRemainingRouteLatLngs.length >= 2) {
            renderDirectionArrows(routeMap, remainingRouteArrowLayer, currentRemainingRouteLatLngs, "#ffffff");
        }
    }
}

/**
 * Updates the camera toggle button visuals to reflect current mode.
 */
function updateCameraModeUI() {
    const btn = document.getElementById("cameraModeToggleBtn");
    const text = document.getElementById("cameraModeText");
    if (!btn || !text) return;

    if (isBearingUpMode) {
        btn.classList.remove("bg-surface", "text-navy", "border-line");
        btn.classList.add("bg-navy", "text-white", "border-navy");
        text.textContent = t("nav_mode");
        btn.setAttribute("title", t("title_nav_mode"));
    } else {
        btn.classList.remove("bg-navy", "text-white", "border-navy");
        btn.classList.add("bg-surface", "text-navy", "border-line");
        text.textContent = t("overview");
        btn.setAttribute("title", t("title_overview"));
    }
}

// ========================================================================
// OSRM ROAD ROUTING ENGINE & THROTTLED DISPATCH
// ========================================================================

function triggerRoadRouteFetchIfNeeded(driverPos, force = false) {
    if (!isTripActive || isRouteFetchInFlight) return;

    const now = Date.now();
    const currentNextId = currentNextStop ? (currentNextStop.stop_id || currentNextStop.id) : "college";

    // Check conditions for routing recalculation
    const timeElapsed = now - lastRouteFetchAt >= ROUTE_REFRESH_MIN_INTERVAL_MS;
    const nextStopChanged = currentNextId !== lastNextStopId;
    const distanceMoved = lastRouteFetchPos
        ? calculateDistance(driverPos.latitude, driverPos.longitude, lastRouteFetchPos.latitude, lastRouteFetchPos.longitude)
        : Infinity;

    const shouldFetch = force || !lastRouteFetchPos || nextStopChanged || (timeElapsed || distanceMoved >= ROUTE_REFRESH_MIN_DISTANCE_M);

    if (shouldFetch) {
        fetchAndDrawRoadRoute(driverPos, currentNextId);
    }
}

async function fetchAndDrawRoadRoute(driverPos, nextId) {
    if (isRouteFetchInFlight) return;
    isRouteFetchInFlight = true;

    const statusBadge = document.getElementById("routeStatusBadge");
    const statusDot = document.getElementById("routeStatusDot");
    const statusText = document.getElementById("routeStatusText");

    try {
        // Build remaining waypoints: Driver Position -> Remaining Unpassed Stops -> College
        const remainingStops = driverRouteStops.filter(s => !passedStopIds.has(s.stop_id || s.id));

        const waypoints = [
            { latitude: driverPos.latitude, longitude: driverPos.longitude }
        ];

        remainingStops.forEach(stop => {
            waypoints.push({ latitude: Number(stop.latitude), longitude: Number(stop.longitude) });
        });

        if (activeTripType !== "evening") {
            waypoints.push({ latitude: COLLEGE_LOCATION.latitude, longitude: COLLEGE_LOCATION.longitude });
        }

        // IMPORTANT: OSRM uses longitude,latitude format
        const coordString = waypoints
            .map(p => `${p.longitude},${p.latitude}`)
            .join(";");

        const url = `${OSRM_BASE}/route/v1/driving/${coordString}?overview=full&geometries=geojson&steps=false`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`OSRM HTTP error: ${response.status}`);

        const data = await response.json();
        if (!data.routes || !data.routes.length) throw new Error("No road route found in OSRM response");

        const routeGeoJson = {
            type: "Feature",
            geometry: data.routes[0].geometry
        };

        // Render Road Geometry onto remainingRouteLayer
        if (remainingRouteLayer) {
            remainingRouteLayer.clearLayers();
            remainingRouteLayer.addData(routeGeoJson);
        }

        // Extract road-snapped coordinates from OSRM [lon, lat]
        const coordinates = data.routes[0].geometry.coordinates;
        currentRemainingRouteLatLngs = coordinates.map(([lon, lat]) => [lat, lon]);

        if (remainingRouteArrowLayer) {
            renderDirectionArrows(routeMap, remainingRouteArrowLayer, currentRemainingRouteLatLngs, "#ffffff");
        }

        // Cache fetch state
        lastRouteFetchAt = Date.now();
        lastRouteFetchPos = { latitude: driverPos.latitude, longitude: driverPos.longitude };
        lastNextStopId = nextId;

        // Update Road Status Badge
        if (statusBadge && statusDot && statusText) {
            statusBadge.classList.remove("hidden");
            statusDot.className = "w-1.5 h-1.5 rounded-full bg-ok";
            statusText.textContent = t("road_route_active");
        }
    } catch (error) {
        console.warn("Road routing notice:", error.message);

        // Fallback: Keep markers working, do not draw fake straight lines
        if (statusBadge && statusDot && statusText) {
            statusBadge.classList.remove("hidden");
            statusDot.className = "w-1.5 h-1.5 rounded-full bg-warn";
            statusText.textContent = t("road_route_unavailable");
        }
    } finally {
        isRouteFetchInFlight = false;
    }
}

function renderDirectionArrows(mapInstance, arrowLayer, polylinePoints, color = "#ffffff") {
    if (!mapInstance || !arrowLayer || !Array.isArray(polylinePoints) || polylinePoints.length < 2) return;
    arrowLayer.clearLayers();
    if (isBearingUpMode) {
        return; // Arrows hidden in bearing-up navigation mode (rotating camera replaces them)
    }
    const zoom = mapInstance.getZoom();

    const arrowSpacing = 85;
    let untilArrow = 45;

    for (let i = 1; i < polylinePoints.length; i++) {
        const p1 = polylinePoints[i - 1];
        const p2 = polylinePoints[i];

        const lat1 = Array.isArray(p1) ? p1[0] : p1.lat;
        const lng1 = Array.isArray(p1) ? p1[1] : p1.lng;
        const lat2 = Array.isArray(p2) ? p2[0] : p2.lat;
        const lng2 = Array.isArray(p2) ? p2[1] : p2.lng;

        if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) continue;

        const a = mapInstance.project([lat1, lng1], zoom);
        const b = mapInstance.project([lat2, lng2], zoom);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        if (!length) continue;

        for (; untilArrow <= length; untilArrow += arrowSpacing) {
            const x = a.x + (dx * untilArrow) / length;
            const y = a.y + (dy * untilArrow) / length;
            const ux = dx / length;
            const uy = dy / length;

            const arrowPixels = [
                [x - ux * 7 - uy * 4, y - uy * 7 + ux * 4],
                [x, y],
                [x - ux * 7 + uy * 4, y - uy * 7 - ux * 4]
            ];

            const arrowLatLngs = arrowPixels.map(p => mapInstance.unproject(p, zoom));
            L.polyline(arrowLatLngs, {
                color: color,
                weight: 2.5,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
                interactive: false
            }).addTo(arrowLayer);
        }
        untilArrow -= length;
    }
}

// ========================================================================
// WAIT REQUESTS: AUTO-ACCEPT BY DEFAULT & COUNTDOWN CONTROLLER
// ========================================================================

let isWaitPollInFlight = false;

function startWaitRequestsPolling() {
    if (!hasDriverEntitlement("wait_request")) return;
    stopWaitRequestsPolling();
    loadActiveWaitRequests();
    waitRequestPollTimer = setInterval(loadActiveWaitRequests, 8000);
}

function stopWaitRequestsPolling() {
    if (waitRequestPollTimer) clearInterval(waitRequestPollTimer);
    if (waitCountdownInterval) clearInterval(waitCountdownInterval);
    waitRequestPollTimer = null;
    waitCountdownInterval = null;
    isWaitPollInFlight = false;
}

async function loadActiveWaitRequests() {
    if (!isTripActive || isWaitPollInFlight) return;
    if (!hasDriverEntitlement("wait_request")) return;

    const token = getToken();
    if (!token) return;

    isWaitPollInFlight = true;
    try {
        const response = await fetch(`${API_BASE}/driver/wait-requests`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (!response.ok) return;

        const requests = Array.isArray(data.requests) ? data.requests : [];

        if (requests.length === 0) {
            hideActiveWaitCard();
        } else {
            renderActiveWaitCard(requests[0]);
        }
    } catch (e) {
        console.warn("Wait requests poll error:", e);
    } finally {
        isWaitPollInFlight = false;
    }
}

function renderActiveWaitCard(group) {
    activeWaitRequest = group;
    VoiceAnnouncer.checkWaitRequestAnnouncement(group);

    const card = document.getElementById("waitRequestCard");
    const title = document.getElementById("waitStopTitle");
    const countElem = document.getElementById("waitStudentCount");
    const countdownElem = document.getElementById("waitCountdownBadge");
    const skipBtn = document.getElementById("skipWaitBtn");
    const completeBtn = document.getElementById("completeWaitBtn");

    if (!card || !title || !countdownElem) return;

    card.classList.remove("hidden");
    title.textContent = t("wait_request_title", { stop: group.stop_name || t("upcoming_stop") });

    const studentCount = Number(group.student_count || 1);
    if (countElem) {
        const studentStr = studentCount === 1 ? t("student_singular") : t("students_plural");
        countElem.textContent = t("wait_students_waiting", {
            count: studentCount,
            student_str: studentStr,
            min: group.minutes || 1
        });
    }

    if (waitCountdownInterval) clearInterval(waitCountdownInterval);
    const status = group.status || "pending";

    if (status === "accepted") {
        countdownElem.textContent = t("wait_accepted_arrival");
        skipBtn?.classList.add("hidden");
        completeBtn?.classList.remove("hidden");
        return;
    }

    if (status === "waiting") {
        skipBtn?.classList.add("hidden");
        completeBtn?.classList.remove("hidden");
        let fallbackSeconds = Math.max(0, Number(group.wait_remaining_seconds) || 0);

        function updateWaitingCountdown() {
            const deadline = Date.parse(group.wait_until);
            const remainingSeconds = Number.isFinite(deadline)
                ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
                : fallbackSeconds;

            if (remainingSeconds <= 0) {
                countdownElem.textContent = t("wait_continue_trip");
                clearInterval(waitCountdownInterval);
                waitCountdownInterval = null;
                return;
            }

            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = String(remainingSeconds % 60).padStart(2, "0");
            countdownElem.textContent = t("wait_resume_in", { min: minutes, sec: seconds });
            fallbackSeconds = Math.max(0, fallbackSeconds - 1);
        }

        updateWaitingCountdown();
        waitCountdownInterval = setInterval(updateWaitingCountdown, 1000);
        return;
    }

    skipBtn?.classList.remove("hidden");
    completeBtn?.classList.add("hidden");

    // Pending: live auto-accept countdown.

    function updateCountdown() {
        const deadline = Date.parse(group.auto_accept_at);
        if (!Number.isFinite(deadline)) {
            countdownElem.textContent = t("auto_accepting_soon");
            return;
        }

        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
            countdownElem.textContent = t("auto_accepted");
            clearInterval(waitCountdownInterval);
            setTimeout(loadActiveWaitRequests, 1000);
            return;
        }

        const remainingSec = Math.ceil(remainingMs / 1000);
        const formatted = remainingSec < 10 ? `00:0${remainingSec}` : `00:${remainingSec}`;
        countdownElem.textContent = t("auto_accepting_in", { time: formatted });
    }

    updateCountdown();
    waitCountdownInterval = setInterval(updateCountdown, 1000);
}

function hideActiveWaitCard() {
    activeWaitRequest = null;
    VoiceAnnouncer.resetWaitDedup();
    if (waitCountdownInterval) clearInterval(waitCountdownInterval);
    document.getElementById("waitRequestCard")?.classList.add("hidden");
    document.getElementById("skipWaitBtn")?.classList.remove("hidden");
    document.getElementById("completeWaitBtn")?.classList.add("hidden");
}

async function handleSkipActiveWait() {
    if (!activeWaitRequest) return;

    const firstStudentRequestId = activeWaitRequest.students?.[0]?.request_id;
    if (!firstStudentRequestId) return;

    // Optimistic UI: Hide card immediately so button feels instantaneous
    hideActiveWaitCard();

    const token = getToken();

    try {
        const response = await fetch(`${API_BASE}/driver/wait-request/${firstStudentRequestId}/skip`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            KambusNotify.notify({
                type: "warning",
                title: t("toast_wait_skipped"),
                message: t("toast_wait_skipped_msg", { stop: activeWaitRequest?.stop_name || "" })
            });
            setTimeout(loadActiveWaitRequests, 500);
        } else {
            throw new Error(data.detail || t("toast_skip_failed_msg"));
        }
    } catch (e) {
        KambusNotify.notify({
            type: "error",
            title: t("toast_skip_failed"),
            message: e.message || t("toast_skip_failed_msg")
        });
        loadActiveWaitRequests();
    }
}

async function handleCompleteActiveWait() {
    if (!activeWaitRequest) return;

    const firstStudentRequestId = activeWaitRequest.students?.[0]?.request_id;
    if (!firstStudentRequestId) return;

    // Optimistic UI: Hide card immediately so button feels instantaneous
    hideActiveWaitCard();

    const token = getToken();

    try {
        const response = await fetch(`${API_BASE}/driver/wait-request/${firstStudentRequestId}/complete-early`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            KambusNotify.notify({
                type: "success",
                title: t("toast_student_boarded"),
                message: t("toast_student_boarded_msg")
            });
            setTimeout(loadActiveWaitRequests, 500);
        } else {
            throw new Error(data.detail || t("toast_complete_wait_failed_msg"));
        }
    } catch (e) {
        KambusNotify.notify({
            type: "error",
            title: t("toast_failed") || "Failed",
            message: e.message || t("toast_complete_wait_failed_msg")
        });
        loadActiveWaitRequests();
    }
}

// ========================================================================
// UTILITY HELPERS: DISTANCE CALCULATION
// ========================================================================

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius in meters
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ========================================================================
// DRIVER UTILITY & MODAL CONTROLLERS (PASS SCANNER, DETOUR, SOS)
// ========================================================================

let scannerStream = null;
let scannerScanInterval = null;
let scannerFallbackTimeout = null;
let scannerFallbackStarted = false;
let scannerHasDecoded = false;
let isQuaggaLiveScanning = false;
let quaggaDetectedHandler = null;
let currentDetourReason = "Road Construction";
let currentDetourDelay = 10;
let currentSosType = "Vehicle Breakdown";
let isVerifyingPass = false;

// 1. STUDENT PASS SCANNER & LOOKUP
function verifyStudentPass() {
    openPassScannerModal();
}
window.verifyStudentPass = verifyStudentPass;

function openPassScannerModal() {
    const modal = document.getElementById("passScannerModal");
    if (!modal) return;

    modal.classList.remove("hidden");
    const resultCard = document.getElementById("passResultCard");
    if (resultCard) resultCard.classList.add("hidden");
    const errorCard = document.getElementById("passErrorCard");
    if (errorCard) errorCard.classList.add("hidden");

    const rollInput = document.getElementById("manualRollInput");
    if (rollInput) {
        rollInput.value = "";
        setTimeout(() => rollInput.focus(), 150);
    }
}
window.openPassScannerModal = openPassScannerModal;

function closePassScannerModal() {
    const modal = document.getElementById("passScannerModal");
    if (modal) modal.classList.add("hidden");

    stopCameraScanner();
}
window.closePassScannerModal = closePassScannerModal;

async function startCameraScanner() {
    const video = document.getElementById("scannerVideo");
    const placeholder = document.getElementById("scannerPlaceholder");
    const laser = document.getElementById("scannerLaser");

    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Camera API not supported in this browser/WebView.");
        }

        // Try environment camera first, then any camera
        try {
            scannerStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
            });
        } catch (e) {
            scannerStream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        if (video) {
            video.srcObject = scannerStream;
            video.classList.remove("hidden");
            if (placeholder) placeholder.classList.add("hidden");
            if (laser) laser.classList.remove("hidden");
            await video.play().catch(() => {});
        }

        scannerFallbackStarted = false;
        scannerHasDecoded = false;
        console.info("[PassScanner] camera stream started", {
            nativeBarcodeDetector: 'BarcodeDetector' in window,
            trackCount: scannerStream?.getVideoTracks().length || 0
        });

        // Try the native detector first. QuaggaJS takes over if it is absent
        // or has not decoded a barcode after a short active scan window.
        startBarcodeDetectionLoop(video);

    } catch (err) {
        console.warn("Camera start failed, falling back to manual/file:", err);
        KambusNotify.notify({
            type: "warning",
            title: t("toast_camera_access"),
            message: t("toast_camera_access_msg")
        });
    }
}
window.startCameraScanner = startCameraScanner;

function startBarcodeDetectionLoop(video) {
    const nativeBarcodeDetectorAvailable = 'BarcodeDetector' in window;
    console.info("[PassScanner] BarcodeDetector availability", nativeBarcodeDetectorAvailable);
    if (!nativeBarcodeDetectorAvailable) {
        startQuaggaFallback(video, "native BarcodeDetector unavailable");
        return;
    }

    try {
        const barcodeDetector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'data_matrix'] });
        console.info("[PassScanner] BarcodeDetector scan loop started");

        if (scannerFallbackTimeout) clearTimeout(scannerFallbackTimeout);
        scannerFallbackTimeout = setTimeout(() => {
            console.info("[PassScanner] native fallback timeout fired", {
                scannerHasDecoded,
                scannerFallbackStarted,
                hasStream: Boolean(scannerStream)
            });
            if (!scannerHasDecoded) startQuaggaFallback(video, "no native decode after 4 seconds");
        }, 4000);
        console.info("[PassScanner] native fallback timeout registered", { timeoutMs: 4000 });

        if (scannerScanInterval) clearInterval(scannerScanInterval);
        scannerScanInterval = setInterval(async () => {
            if (!scannerStream || !video || video.readyState < 2 || isVerifyingPass) return;
            try {
                console.debug("[PassScanner] native detection attempt");
                const barcodes = await barcodeDetector.detect(video);
                console.debug("[PassScanner] native detection result", { count: barcodes?.length || 0 });
                if (barcodes && barcodes.length > 0) {
                    const rawVal = barcodes[0].rawValue;
                    if (rawVal) handleDecodedPass(rawVal);
                }
            } catch (scanErr) {
                console.debug("[PassScanner] native detection frame error", scanErr);
            }
        }, 500);
    } catch (err) {
        console.warn("Barcode detector init error:", err);
        startQuaggaFallback(video, "native BarcodeDetector initialization failed");
    }
}

function stopBarcodeDetectionLoops() {
    console.info("[PassScanner] stopping decoder loops", {
        nativeLoop: Boolean(scannerScanInterval),
        fallbackTimeout: Boolean(scannerFallbackTimeout),
        quaggaLive: isQuaggaLiveScanning
    });
    if (scannerScanInterval) {
        clearInterval(scannerScanInterval);
        scannerScanInterval = null;
    }
    if (scannerFallbackTimeout) {
        clearTimeout(scannerFallbackTimeout);
        scannerFallbackTimeout = null;
    }
}

function handleDecodedPass(rawValue) {
    if (!rawValue || scannerHasDecoded || isVerifyingPass) {
        console.debug("[PassScanner] decoded value ignored", { hasValue: Boolean(rawValue), scannerHasDecoded, isVerifyingPass });
        return;
    }
    console.info("[PassScanner] barcode decoded; sending existing verification request");
    scannerHasDecoded = true;
    stopBarcodeDetectionLoops();
    stopQuaggaLiveScanner();
    void verifyStudentPassBackend(rawValue);
}

function startQuaggaFallback(video, reason = "unspecified") {
    console.info("[PassScanner] startQuaggaFallback called", {
        reason,
        scannerFallbackStarted,
        scannerHasDecoded,
        hasStream: Boolean(scannerStream),
        hasVideo: Boolean(video),
        quaggaAvailable: Boolean(window.Quagga)
    });
    if (scannerFallbackStarted || !scannerStream || !video) return;
    scannerFallbackStarted = true;
    stopBarcodeDetectionLoops();

    if (!window.Quagga) {
        console.warn("QuaggaJS is unavailable; use manual roll-number entry.");
        KambusNotify.notify({
            type: "warning",
            title: t("toast_barcode_scanner_unavailable"),
            message: t("toast_enter_roll_manually")
        });
        return;
    }

    // Quagga LiveStream owns its own camera track, so release the native
    // preview before starting it to avoid two consumers competing for camera focus.
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
    video.srcObject = null;
    video.classList.add("hidden");

    const viewport = document.getElementById("quaggaViewport");
    if (!viewport) return;
    viewport.innerHTML = "";
    viewport.classList.remove("hidden");

    console.info("[PassScanner] starting QuaggaJS LiveStream scanner", { reason });
    window.Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: viewport,
            constraints: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            size: 1600
        },
        numOfWorkers: 2,
        frequency: 10,
        locate: true,
        locator: {
            patchSize: "small",
            halfSample: false
        },
        decoder: { readers: ["code_128_reader", "code_39_reader"] }
    }, error => {
        if (error) {
            console.warn("[PassScanner] QuaggaJS LiveStream initialization failed", error);
            viewport.classList.add("hidden");
            document.getElementById("scannerPlaceholder")?.classList.remove("hidden");
            document.getElementById("scannerLaser")?.classList.add("hidden");
            KambusNotify.notify({
                type: "warning",
                title: t("toast_barcode_scanner_unavailable"),
                message: t("toast_enter_roll_manually")
            });
            return;
        }

        isQuaggaLiveScanning = true;
        quaggaDetectedHandler = result => {
            const code = result?.codeResult?.code;
            console.debug("[PassScanner] QuaggaJS LiveStream detection result", { decoded: Boolean(code) });
            if (code) handleDecodedPass(code);
        };
        window.Quagga.onDetected(quaggaDetectedHandler);
        window.Quagga.start();
        console.info("[PassScanner] QuaggaJS LiveStream scanner started");
    });
}

function stopQuaggaLiveScanner() {
    const viewport = document.getElementById("quaggaViewport");
    if (window.Quagga && quaggaDetectedHandler && typeof window.Quagga.offDetected === "function") {
        window.Quagga.offDetected(quaggaDetectedHandler);
    }
    quaggaDetectedHandler = null;
    if (window.Quagga && isQuaggaLiveScanning) {
        try {
            window.Quagga.stop();
        } catch (error) {
            console.warn("[PassScanner] QuaggaJS stop failed", error);
        }
    }
    isQuaggaLiveScanning = false;
    if (viewport) {
        viewport.innerHTML = "";
        viewport.classList.add("hidden");
    }
}

async function handleQrFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!('BarcodeDetector' in window)) {
        KambusNotify.notify({
            type: "info",
            title: t("toast_pass_image_selected"),
            message: t("toast_pass_image_selected_msg")
        });
        return;
    }

    try {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await img.decode();

        const barcodeDetector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39'] });
        const barcodes = await barcodeDetector.detect(img);

        if (barcodes && barcodes.length > 0) {
            await verifyStudentPassBackend(barcodes[0].rawValue);
        } else {
            KambusNotify.notify({
                type: "warning",
                title: t("toast_qr_not_detected"),
                message: t("toast_qr_not_detected_msg")
            });
        }
    } catch (err) {
        console.warn("QR File decode error:", err);
    }
}
window.handleQrFileUpload = handleQrFileUpload;

function stopCameraScanner() {
    console.info("[PassScanner] camera scanner stopped");
    stopBarcodeDetectionLoops();
    stopQuaggaLiveScanner();
    scannerFallbackStarted = false;
    scannerHasDecoded = false;
    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
        scannerStream = null;
    }
    const video = document.getElementById("scannerVideo");
    const placeholder = document.getElementById("scannerPlaceholder");
    const laser = document.getElementById("scannerLaser");
    if (video) {
        video.srcObject = null;
        video.classList.add("hidden");
    }
    if (placeholder) placeholder.classList.remove("hidden");
    if (laser) laser.classList.add("hidden");
}

async function handleManualPassLookup(event) {
    if (event) event.preventDefault();

    const rollInput = document.getElementById("manualRollInput");
    const rawQuery = rollInput ? rollInput.value.trim().toUpperCase() : "";

    if (!rawQuery) {
        KambusNotify.notify({
            type: "warning",
            title: t("toast_roll_required"),
            message: t("toast_roll_required_msg")
        });
        return;
    }

    await verifyStudentPassBackend(rawQuery, true);
}
window.handleManualPassLookup = handleManualPassLookup;

// REAL BACKEND PASS VERIFICATION
async function verifyStudentPassBackend(queryStr, isManual = false) {
    queryStr = typeof queryStr === "string" ? queryStr.trim() : "";
    if (/^data:image\//i.test(queryStr)) {
        console.error("[PassScanner] refused image frame data as a verification query");
        KambusNotify.notify({
            type: "error",
            title: t("toast_invalid_scanner_val"),
            message: t("toast_invalid_scanner_msg")
        });
        return;
    }
    if (isVerifyingPass) return;
    isVerifyingPass = true;

    const resultCard = document.getElementById("passResultCard");
    const errorCard = document.getElementById("passErrorCard");
    const submitBtn = document.getElementById("verifyPassSubmitBtn");

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = t("checking");
    }

    const token = getToken();
    try {
        console.info("[PassScanner] scan-pass request query:", queryStr, "isManual:", isManual);
        const isJwt = !isManual && (queryStr.match(/\./g) || []).length === 2;
        const payload = {
            latitude: lastPosition ? lastPosition.latitude : null,
            longitude: lastPosition ? lastPosition.longitude : null
        };
        if (isJwt) {
            payload.token = queryStr;
            payload.query = queryStr;
        } else {
            payload.roll_number = queryStr;
            payload.query = queryStr;
        }

        const response = await fetch(`${API_BASE}/driver/scan-pass`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.valid) {
            // SUCCESSFUL PASS VALIDATION
            if (errorCard) errorCard.classList.add("hidden");
            if (resultCard) {
                const nameElem = document.getElementById("passStudentName");
                const rollElem = document.getElementById("passStudentRoll");
                const stopElem = document.getElementById("passStopName");
                const busElem = document.getElementById("passBusNum");
                const timeElem = document.getElementById("passVerifiedTime");
                const badgeElem = document.getElementById("passBadgeStatus");

                if (nameElem) nameElem.textContent = data.student_name || t("student_singular");
                if (rollElem) rollElem.textContent = `Roll: ${data.roll_number || queryStr} • ${data.department || "General"}`;
                if (stopElem) stopElem.textContent = data.stop_name || t("assigned_route");
                if (busElem) busElem.textContent = t("bus_badge", { num: data.bus_number || "—" });
                if (timeElem) timeElem.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                if (badgeElem) {
                    if (data.status === "warning_not_travelling") {
                        badgeElem.className = "text-[11px] font-black tracking-wider uppercase text-warn bg-warn/10 border border-warn/20 px-2.5 py-1 rounded";
                        badgeElem.textContent = t("marked_not_travelling");
                    } else {
                        badgeElem.className = "text-[11px] font-black tracking-wider uppercase text-ok bg-ok/10 border border-ok/20 px-2.5 py-1 rounded";
                        badgeElem.textContent = t("pass_valid_active");
                    }
                }

                resultCard.classList.remove("hidden");
            }

            // Haptic/audio vibration on device if supported
            if (navigator.vibrate) navigator.vibrate(100);

            KambusNotify.notify({
                type: "success",
                title: t("toast_student_verified"),
                message: t("toast_student_verified_msg", {
                    name: data.student_name || t("student_singular"),
                    roll: data.roll_number || queryStr,
                    stop: data.stop_name || ""
                })
            });

        } else {
            // FAILED / INVALID PASS
            const detailMsg = (typeof data?.detail === "string" && data.detail.trim())
                ? data.detail.trim()
                : (Array.isArray(data?.detail) && data.detail[0]?.msg ? data.detail[0].msg : null);
            const displayError = detailMsg || t("student_not_found_assigned");

            if (resultCard) resultCard.classList.add("hidden");
            if (errorCard) {
                const errTitle = document.getElementById("passErrorTitle");
                const errMsg = document.getElementById("passErrorMessage");
                if (errTitle) errTitle.textContent = t("invalid_pass_title");
                if (errMsg) errMsg.textContent = displayError;
                errorCard.classList.remove("hidden");
            }

            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

            KambusNotify.notify({
                type: "error",
                title: t("toast_pass_invalid"),
                message: displayError
            });
        }
    } catch (err) {
        console.error("Pass verification network error:", err);
        if (errorCard) {
            const errMsg = document.getElementById("passErrorMessage");
            if (errMsg) errMsg.textContent = t("network_error");
            errorCard.classList.remove("hidden");
        }
    } finally {
        isVerifyingPass = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = t("verify");
        }
    }
}

// 2. REAL BACKEND ROUTE DETOUR REPORTING
function reportDetour() {
    openDetourModal();
}
window.reportDetour = reportDetour;

function openDetourModal() {
    const modal = document.getElementById("detourModal");
    if (modal) modal.classList.remove("hidden");
}
window.openDetourModal = openDetourModal;

function closeDetourModal() {
    const modal = document.getElementById("detourModal");
    if (modal) modal.classList.add("hidden");
}
window.closeDetourModal = closeDetourModal;

function selectDetourReason(button, reason) {
    currentDetourReason = reason;
    const allButtons = document.querySelectorAll(".detourReasonBtn");
    allButtons.forEach(btn => {
        btn.className = "detourReasonBtn py-2.5 px-3 rounded border border-line bg-surface text-ink font-bold text-left";
    });
    button.className = "detourReasonBtn py-2.5 px-3 rounded border border-warn bg-warn/10 text-warn font-black text-left";
}
window.selectDetourReason = selectDetourReason;

function selectDetourDelay(button, minutes) {
    currentDetourDelay = Number(minutes);
    const allButtons = document.querySelectorAll(".detourDelayBtn");
    allButtons.forEach(btn => {
        btn.className = "detourDelayBtn py-2 rounded border border-line bg-surface text-ink";
    });
    button.className = "detourDelayBtn py-2 rounded border border-warn bg-warn/10 text-warn font-black";
}
window.selectDetourDelay = selectDetourDelay;

async function submitDetourReport() {
    const submitBtn = document.getElementById("submitDetourBtn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = t("broadcasting");
    }

    const token = getToken();
    try {
        const response = await fetch(`${API_BASE}/driver/report-detour`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                reason: currentDetourReason,
                delay_minutes: currentDetourDelay
            })
        });

        const data = await response.json();
        const banner = document.getElementById("activeDetourBanner");
        const textElem = document.getElementById("activeDetourText");

        if (banner && textElem) {
            textElem.textContent = t("active_detour_banner_text", {
                reason: getTranslatedDetourReason(currentDetourReason),
                delay: currentDetourDelay
            });
            banner.classList.remove("hidden");
        }

        closeDetourModal();

        KambusNotify.notify({
            type: "warning",
            title: t("toast_detour_broadcasted"),
            message: data.message || t("active_detour_banner_text", {
                reason: getTranslatedDetourReason(currentDetourReason),
                delay: currentDetourDelay
            })
        });
    } catch (err) {
        console.error("Detour report error:", err);
        closeDetourModal();
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = t("broadcast_detour_btn");
        }
    }
}
window.submitDetourReport = submitDetourReport;

function clearDetourReport() {
    const banner = document.getElementById("activeDetourBanner");
    if (banner) banner.classList.add("hidden");

    KambusNotify.notify({
        type: "info",
        title: t("toast_detour_cleared"),
        message: t("toast_detour_cleared_msg")
    });
}
window.clearDetourReport = clearDetourReport;

// 3. REAL BACKEND EMERGENCY SOS & BREAKDOWN
function triggerEmergencySOS() {
    openSosModal();
}
window.triggerEmergencySOS = triggerEmergencySOS;

function openSosModal() {
    const modal = document.getElementById("sosModal");
    if (modal) modal.classList.remove("hidden");
}
window.openSosModal = openSosModal;

function closeSosModal() {
    const modal = document.getElementById("sosModal");
    if (modal) modal.classList.add("hidden");
}
window.closeSosModal = closeSosModal;

function selectSosType(button, type) {
    currentSosType = type;
    const allButtons = document.querySelectorAll(".sosTypeBtn");
    allButtons.forEach(btn => {
        btn.className = "sosTypeBtn py-2.5 px-3 rounded border border-line bg-surface text-ink font-bold text-left";
    });
    button.className = "sosTypeBtn py-2.5 px-3 rounded border border-danger bg-danger/10 text-danger font-black text-left";
}
window.selectSosType = selectSosType;

async function submitEmergencySos() {
    const submitBtn = document.getElementById("submitSosBtn");
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = t("transmitting_sos");
    }

    const token = getToken();
    try {
        const response = await fetch(`${API_BASE}/driver/emergency-sos`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                incident_type: currentSosType,
                latitude: lastPosition ? lastPosition.latitude : null,
                longitude: lastPosition ? lastPosition.longitude : null
            })
        });

        const data = await response.json();
        const banner = document.getElementById("activeSosBanner");
        const textElem = document.getElementById("activeSosText");

        if (banner && textElem) {
            textElem.textContent = t("active_sos_banner_text", {
                type: getTranslatedSosType(currentSosType)
            });
            banner.classList.remove("hidden");
        }

        closeSosModal();

        KambusNotify.notify({
            type: "error",
            title: t("toast_sos_dispatched"),
            message: data.message || t("toast_sos_dispatched_msg", {
                type: getTranslatedSosType(currentSosType)
            })
        });
    } catch (err) {
        console.error("SOS report error:", err);
        closeSosModal();
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = t("transmit_sos_btn");
        }
    }
}
window.submitEmergencySos = submitEmergencySos;

function cancelEmergencySos() {
    const banner = document.getElementById("activeSosBanner");
    if (banner) banner.classList.add("hidden");

    KambusNotify.notify({
        type: "info",
        title: t("toast_sos_cleared"),
        message: t("toast_sos_cleared_msg")
    });
}
window.cancelEmergencySos = cancelEmergencySos;

// Close modals when clicking background overlay or pressing Escape
document.addEventListener("click", event => {
    const passModal = document.getElementById("passScannerModal");
    const detourModal = document.getElementById("detourModal");
    const sosModal = document.getElementById("sosModal");

    if (event.target === passModal) closePassScannerModal();
    if (event.target === detourModal) closeDetourModal();
    if (event.target === sosModal) closeSosModal();
});

document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    closePassScannerModal();
    closeDetourModal();
    closeSosModal();
});

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        calculateBearingFromCoords,
        resolveTargetBearing,
        smoothBearing,
        computeNavigationCenter,
        applyBearingUpCamera,
        toggleCameraMode,
        updateCameraModeUI,
        toggleTripSummary,
        MIN_SPEED_FOR_DEVICE_BEARING_KMH,
        MIN_DISTANCE_FOR_CALCULATED_BEARING_M,
        BEARING_SMOOTHING_ALPHA,
        TRANSLATIONS,
        setLanguage,
        t,
        getVoiceLangCode,
        refreshAllDynamicTexts,
        applyStaticTranslations,
        getTranslatedDetourReason,
        getTranslatedSosType,
        speakVoiceAnnouncement,
        getCurrentLanguage: () => currentLanguage
    };
}
