const VoiceAnnouncer = (() => {
    let enabled = true;
    let lastAnnouncedStopId = null;
    let lastAnnouncedWaitKey = null;
    let currentPriority = 0;

    const PRIORITY = { PROXIMITY: 1, WAIT_REQUEST: 2 };

    function hasAndroidBridge() {
        return typeof window.AndroidTTS !== "undefined" && typeof window.AndroidTTS.speak === "function";
    }

    function hasBrowserSpeech() {
        return "speechSynthesis" in window;
    }

    function isCurrentlySpeaking() {
        if (hasAndroidBridge() && typeof window.AndroidTTS.isSpeaking === "function") {
            try {
                return !!window.AndroidTTS.isSpeaking();
            } catch (e) {
                return false;
            }
        }
        if (hasBrowserSpeech()) {
            return window.speechSynthesis.speaking;
        }
        return false;
    }

    function cancelSpeech() {
        if (hasAndroidBridge() && typeof window.AndroidTTS.stop === "function") {
            try {
                window.AndroidTTS.stop();
            } catch (e) {}
        }
        if (hasBrowserSpeech()) {
            window.speechSynthesis.cancel();
        }
    }

    function speak(text, priority) {
        if (!enabled) return;

        if (!hasAndroidBridge() && !hasBrowserSpeech()) {
            return;
        }

        if (priority === PRIORITY.WAIT_REQUEST) {
            cancelSpeech();
        } else if (currentPriority === PRIORITY.WAIT_REQUEST && isCurrentlySpeaking()) {
            return;
        }

        currentPriority = priority;

        if (hasAndroidBridge()) {
            try {
                window.AndroidTTS.speak(text);
            } catch (e) {}

            const approxWords = text.split(/\s+/).length;
            const approxDurationMs = Math.max(1200, (approxWords / 2.5) * 1000);
            setTimeout(() => {
                if (currentPriority === priority) currentPriority = 0;
            }, approxDurationMs);
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.lang = "en-IN";
        utterance.onend = () => { if (currentPriority === priority) currentPriority = 0; };
        utterance.onerror = () => { if (currentPriority === priority) currentPriority = 0; };

        window.speechSynthesis.speak(utterance);
    }

    function checkProximityAnnouncement(stopId, name, studentCount, distToNext) {
        const ANNOUNCE_DISTANCE_M = 400;
        if (distToNext > ANNOUNCE_DISTANCE_M) return;
        if (stopId === lastAnnouncedStopId) return;

        const count = Number(studentCount) || 0;
        if (count === 0) {
            speak(`No need to stop at ${name}, no student coming in bus`, PRIORITY.PROXIMITY);
        } else {
            speak(`Next stop ${name}, ${count} ${count === 1 ? "student" : "students"}`, PRIORITY.PROXIMITY);
        }
        lastAnnouncedStopId = stopId;
    }

    function checkWaitRequestAnnouncement(group) {
        const key = group.students?.[0]?.request_id || `${group.stop_name}-${group.minutes}`;
        if (key === lastAnnouncedWaitKey) return;

        const minutes = Number(group.minutes) || 1;
        speak(`${group.stop_name || "Stop"} stop, bus will stop for ${minutes} ${minutes === 1 ? "min" : "mins"}`, PRIORITY.WAIT_REQUEST);
        lastAnnouncedWaitKey = key;
    }

    function resetWaitDedup() {
        lastAnnouncedWaitKey = null;
    }

    function setEnabled(value) {
        enabled = value;
        if (!value) cancelSpeech();
    }

    return {
        checkProximityAnnouncement,
        checkWaitRequestAnnouncement,
        resetWaitDedup,
        setEnabled,
    };
})();