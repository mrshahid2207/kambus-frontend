import re

with open("app/src/main/assets/student.js", "r", encoding="utf-8") as f:
    text = f.read()

# 1. ETA Banner and Status
text = text.replace(
    'etaElement.className = isLive\n        ? "text-emerald-600 font-bold ml-1 text-xs"\n        : "text-slate-500 font-bold ml-1 text-xs";',
    'etaElement.className = isLive ? "text-ok font-semibold ml-1 text-xs" : "text-ink-muted font-semibold ml-1 text-xs";'
)
text = text.replace(
    'dotElement.innerHTML = `\n                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>\n                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>\n            `;',
    'dotElement.innerHTML = `<span class="relative inline-flex rounded-full h-2 w-2 bg-ok animate-pulse"></span>`;'
)
text = text.replace(
    'dotElement.innerHTML = `\n                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-slate-400"></span>\n            `;',
    'dotElement.innerHTML = `<span class="relative inline-flex rounded-full h-2 w-2 bg-line"></span>`;'
)

# 2. Remove emojis from banner and popups
text = text.replace('setEtaBanner("🚌 Bus on the way"', 'setEtaBanner("Bus on the way"')
text = text.replace('`🛑 Bus waiting at ${assignedStop.name}`', '`Bus waiting at ${assignedStop.name}`')
text = text.replace('setEtaBanner(`🛑 Bus waiting at', 'setEtaBanner(`Bus waiting at')
text = text.replace('setEtaBanner("📍 Location updating"', 'setEtaBanner("Location updating"')
text = text.replace('<strong>📍 ${COLLEGE_LOCATION.name}</strong>', '<strong>${COLLEGE_LOCATION.name}</strong>')
text = text.replace('<strong>🚌 Assigned Bus</strong>', '<strong>Assigned Bus</strong>')
text = text.replace('"<br><strong class=\\"text-rose-600\\">🛑 Waiting at stop</strong>"', '"<br><strong class=\\"text-danger\\">Waiting at stop</strong>"')
text = text.replace('title: data.title || "🚨 Emergency SOS Alert"', 'title: data.title || "Emergency SOS Alert"')
text = text.replace('title: data.title || "⚠️ Route Detour Alert"', 'title: data.title || "Route Detour Alert"')
text = text.replace('<span>📍 Temporary Stop Active</span>', '<span>Temporary Stop Active</span>')
text = text.replace('<span>⏳ Temporary Stop Scheduled</span>', '<span>Temporary Stop Scheduled</span>')
text = text.replace('isTemp ? "📍 Temporary Pickup Stop" : "📍 Your Assigned Stop"', 'isTemp ? "Temporary Pickup Stop" : "Your Assigned Stop"')
text = text.replace('<span style="color:white;font-size:19px;">🚌</span>', '<svg style="width:16px;height:16px;color:white;" aria-hidden="true"><use href="icons.svg#icon-bus"/></svg>')

# 3. Status boxes tokens in temporary stop
text = text.replace(
    'statusBox.className = "rounded-xl border border-purple-200 bg-purple-50 p-2.5 text-xs text-purple-900";',
    'statusBox.className = "rounded border border-ok/20 bg-ok/10 p-2 text-xs text-ok";'
)
text = text.replace('text-purple-700', 'text-ok')
text = text.replace('text-purple-900', 'text-ok font-semibold')
text = text.replace(
    'statusBox.className = "rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900";',
    'statusBox.className = "rounded border border-warn/20 bg-warn/10 p-2 text-xs text-warn";'
)
text = text.replace('text-amber-700', 'text-warn')
text = text.replace('text-amber-900', 'text-warn font-semibold')

# 4. Missed Bus Button UI
text = text.replace(
    'button.className = "py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2";',
    'button.className = "py-2.5 px-3 bg-surface hover:bg-bg border border-line rounded text-xs font-semibold text-navy flex items-center justify-center gap-1.5 transition-colors";'
)
text = text.replace(
    'button.innerHTML = `<i class="fa-solid fa-bus-slash text-rose-600"></i><span>Missed Bus</span>`;',
    'button.innerHTML = `<svg class="w-3.5 h-3.5 text-danger shrink-0" aria-hidden="true"><use href="icons.svg#icon-bus-slash"/></svg><span>Missed Bus</span>`;'
)
text = text.replace(
    'submit.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i><span>Finding bus…</span>`;',
    'submit.innerHTML = `<svg class="w-4 h-4 shrink-0 animate-spin" aria-hidden="true"><use href="icons.svg#icon-spinner"/></svg><span>Finding bus…</span>`;'
)
text = text.replace(
    'submit.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i><span>Find My Alternative Bus</span>`;',
    'submit.innerHTML = `<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-wand"/></svg><span>Find My Alternative Bus</span>`;'
)

# 5. Temporary stop check route banner (Point 1 requirement)
old_route_check_block = '''        temporaryStopRouteCheck = data;
        const result = document.getElementById("temporaryRouteCheckResult");
        if (result) {
            result.className = data.on_route
                ? "rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-800"
                : data.candidate_buses?.length
                    ? "rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800"
                    : "rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-800";
            result.textContent = data.message;
        }'''

new_route_check_block = '''        temporaryStopRouteCheck = data;
        const result = document.getElementById("temporaryRouteCheckResult");
        if (result) {
            result.classList.remove("hidden");
            if (data.on_route) {
                result.className = "flex items-center justify-center gap-2 py-2 px-3 rounded text-xs font-semibold mx-auto w-full text-center border border-ok/20 bg-ok/10 text-ok";
                result.innerHTML = `<svg class="w-4 h-4 shrink-0 text-ok" aria-hidden="true"><use href="icons.svg#icon-check"/></svg><span>${escapeTemporaryStopText(data.message || "Selected stop is on your assigned bus route")}</span>`;
            } else {
                result.className = "flex items-center justify-center gap-2 py-2 px-3 rounded text-xs font-semibold mx-auto w-full text-center border border-danger/20 bg-danger/10 text-danger";
                result.innerHTML = `<svg class="w-4 h-4 shrink-0 text-danger" aria-hidden="true"><use href="icons.svg#icon-xmark"/></svg><span>${escapeTemporaryStopText(data.message || "Selected stop is not on your assigned bus route")}</span>`;
            }
        }'''

if old_route_check_block in text:
    text = text.replace(old_route_check_block, new_route_check_block)
    print("Replaced route check block successfully.")
else:
    print("WARNING: old_route_check_block not found exactly!")

# 6. Temporary stop submit buttons and icons
text = text.replace(
    'submit.innerHTML = `<i class="fa-solid fa-check"></i><span>${escapeTemporaryStopText(label)}</span>`;',
    'submit.innerHTML = `<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-check"/></svg><span>${escapeTemporaryStopText(label)}</span>`;'
)
text = text.replace(
    'submit.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i><span>Saving…</span>`;',
    'submit.innerHTML = `<svg class="w-4 h-4 shrink-0 animate-spin" aria-hidden="true"><use href="icons.svg#icon-spinner"/></svg><span>Saving…</span>`;'
)
text = text.replace(
    'submit.innerHTML = `<i class="fa-solid fa-lock"></i><span>Step 2: Complete Step 1 First</span>`;',
    'submit.innerHTML = `<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-lock"/></svg><span>Step 2: Complete Step 1 First</span>`;'
)

# 7. Candidate buses styling & empty message
text = text.replace(
    'container.innerHTML = `<div class="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-800">\n            No bus is currently available for this location. You cannot submit a temporary stop change here.\n        </div>`;',
    'container.innerHTML = `<div class="flex items-center justify-center gap-2 py-2 px-3 rounded text-xs font-semibold mx-auto w-full text-center border border-danger/20 bg-danger/10 text-danger"><svg class="w-4 h-4 shrink-0 text-danger" aria-hidden="true"><use href="icons.svg#icon-xmark"/></svg><span>No bus is currently available for this location. You cannot submit a temporary stop change here.</span></div>`;'
)
text = text.replace(
    '<label class="block rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700">',
    '<label class="block rounded border border-line bg-bg py-2 px-2.5 text-xs text-navy">'
)
text = text.replace(
    '<span class="font-bold text-slate-900">${escapeTemporaryStopText(candidate.bus_number)}</span>${candidate.is_own_bus ? " <span class=\\"text-emerald-700 font-bold\\">• Your Assigned Bus</span>" : ""}${candidate.is_recommended ? " <span class=\\"text-indigo-700\\">• Recommended</span>" : ""}',
    '<span class="font-bold text-navy">${escapeTemporaryStopText(candidate.bus_number)}</span>${candidate.is_own_bus ? " <span class=\\"text-ok font-semibold\\">• Your Assigned Bus</span>" : ""}${candidate.is_recommended ? " <span class=\\"text-brand font-semibold\\">• Recommended</span>" : ""}'
)

# 8. Address hint / lat lng density pass
text = text.replace(
    'if (addrEl) addrEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)} (loading address…)`;',
    'if (addrEl) addrEl.textContent = "Selected Map Location (resolving address…)";'
)
text = text.replace(
    ': `${lat.toFixed(5)}, ${lng.toFixed(5)}`;',
    ': "Selected Map Location";'
)
# Pin marker style tokens
text = text.replace(
    'background:#6366f1;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px #0004;',
    'background:var(--navy);border:2px solid #FFFFFF;border-radius:50% 50% 50% 0;transform:rotate(-45deg);'
)

# 9. All routes reference modal
text = text.replace('class="rounded-lg border border-slate-200 bg-white p-2"', 'class="rounded border border-line bg-surface p-2"')
text = text.replace('text-slate-800', 'text-navy')
text = text.replace('text-slate-500', 'text-ink-muted')
text = text.replace('text-rose-500', 'text-danger')

with open("app/src/main/assets/student.js", "w", encoding="utf-8") as f:
    f.write(text)

print("student.js updated successfully.")
