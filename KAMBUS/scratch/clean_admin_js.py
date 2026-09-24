import re

with open("app/src/main/assets/admin.js", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Toast
old_toast = """        const toast = document.createElement("div");
        toast.className = `fixed bottom-5 right-5 z-[9999] max-w-sm w-full p-4 rounded-2xl shadow-xl border flex items-start gap-3 transition-all duration-300 transform translate-y-2 opacity-0 ${
            type === "error"
                ? "bg-rose-950 text-rose-100 border-rose-800"
                : type === "warning"
                ? "bg-amber-950 text-amber-100 border-amber-800"
                : type === "success"
                ? "bg-emerald-950 text-emerald-100 border-emerald-800"
                : "bg-slate-900 text-slate-100 border-slate-700"
        }`;

        const icon = type === "error" ? "🚨" : type === "warning" ? "⚠️" : type === "success" ? "✅" : "🔔";

        toast.innerHTML = `
            <span class="text-xl">${icon}</span>
            <div class="flex-1 min-w-0">
                <h4 class="text-xs font-black tracking-wide">${escapeHtml(title)}</h4>
                <p class="text-xs text-slate-300 mt-0.5 leading-relaxed">${escapeHtml(message)}</p>
            </div>
            <button class="text-slate-400 hover:text-white" onclick="this.parentElement.remove()">✕</button>
        `;"""

new_toast = """        const toast = document.createElement("div");
        toast.className = `fixed bottom-5 right-5 z-[9999] max-w-sm w-full p-4 rounded border flex items-start gap-3 transition-all duration-300 transform translate-y-2 opacity-0 ${
            type === "error"
                ? "bg-surface text-danger border-danger"
                : type === "warning"
                ? "bg-surface text-warn border-warn"
                : type === "success"
                ? "bg-surface text-ok border-ok"
                : "bg-surface text-ink border-line"
        }`;

        const iconSymbol = type === "error" ? "icon-alert" : type === "warning" ? "icon-alert" : type === "success" ? "icon-check" : "icon-bell";

        toast.innerHTML = `
            <svg class="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true"><use href="icons.svg#${iconSymbol}"/></svg>
            <div class="flex-1 min-w-0">
                <h4 class="text-xs font-black tracking-wide text-ink">${escapeHtml(title)}</h4>
                <p class="text-xs text-ink-muted mt-0.5 leading-relaxed">${escapeHtml(message)}</p>
            </div>
            <button class="text-ink-muted hover:text-ink w-5 h-5 flex items-center justify-center shrink-0" onclick="this.parentElement.remove()">
                <svg class="w-3.5 h-3.5"><use href="icons.svg#icon-xmark"/></svg>
            </button>
        `;"""
content = content.replace(old_toast, new_toast)

# 2. Recent alerts in dashboard
old_alert_icon = """<span class="text-sm">${alert.type === 'emergency_sos' ? '🚨' : '⚠️'}</span>"""
new_alert_icon = """<span class="w-4 h-4 shrink-0 flex items-center justify-center">${alert.type === 'emergency_sos' ? '<svg class="w-4 h-4 text-danger"><use href="icons.svg#icon-alert"/></svg>' : '<svg class="w-4 h-4 text-warn"><use href="icons.svg#icon-alert"/></svg>'}</span>"""
content = content.replace(old_alert_icon, new_alert_icon)

# 3. Bus list & Bus modal
old_bus_transit_badge = """                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black ${bus.trip_status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
                            ${bus.trip_status === 'active' ? '🟢 IN TRANSIT' : 'IDLE'}
                        </span>"""
new_bus_transit_badge = """                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${bus.trip_status === 'active' ? 'bg-ok/10 text-ok' : 'bg-surface text-ink-muted border border-line'}">
                            ${bus.trip_status === 'active' ? '<span class="w-1.5 h-1.5 rounded-full bg-ok inline-block shrink-0"></span>IN TRANSIT' : 'IDLE'}
                        </span>"""
content = content.replace(old_bus_transit_badge, new_bus_transit_badge)

old_bus_students = """                    <span class="text-slate-500 font-bold">
                        👥 <strong>${bus.student_count}</strong> students (${bus.travelling_today_count} today)
                    </span>"""
new_bus_students = """                    <span class="text-ink-muted font-bold inline-flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-users"/></svg>
                        <span><strong>${bus.student_count}</strong> students (${bus.travelling_today_count} today)</span>
                    </span>"""
content = content.replace(old_bus_students, new_bus_students)

old_bus_modal_badge = """            const badge = document.getElementById("modalBusStatusBadge");
            if (badge) {
                badge.className = `px-2.5 py-1 rounded-full text-xs font-black ${bus.trip_status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`;
                badge.textContent = bus.trip_status === 'active' ? "🟢 IN TRANSIT" : "IDLE";
            }"""
new_bus_modal_badge = """            const badge = document.getElementById("modalBusStatusBadge");
            if (badge) {
                badge.className = `px-2.5 py-1 rounded-full text-xs font-black inline-flex items-center gap-1.5 ${bus.trip_status === 'active' ? 'bg-ok/10 text-ok' : 'bg-surface text-ink-muted border border-line'}`;
                badge.innerHTML = bus.trip_status === 'active' ? '<span class="w-1.5 h-1.5 rounded-full bg-ok inline-block shrink-0"></span>IN TRANSIT' : 'IDLE';
            }"""
content = content.replace(old_bus_modal_badge, new_bus_modal_badge)

content = content.replace('`📞 ${bus.driver_phone}`', 'bus.driver_phone')

# 4. Driver list
old_driver_status = """                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black ${d.is_online ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
                            ${d.is_online ? '🟢 ONLINE' : 'OFFLINE'}
                        </span>"""
new_driver_status = """                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${d.is_online ? 'bg-ok/10 text-ok' : 'bg-surface text-ink-muted border border-line'}">
                            ${d.is_online ? '<span class="w-1.5 h-1.5 rounded-full bg-ok inline-block shrink-0"></span>ONLINE' : 'OFFLINE'}
                        </span>"""
content = content.replace(old_driver_status, new_driver_status)

old_driver_phone = """<p>📞 <strong>${escapeHtml(d.phone || '-')}</strong></p>"""
new_driver_phone = """<p class="inline-flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-phone"/></svg> <strong>${escapeHtml(d.phone || '-')}</strong></p>"""
content = content.replace(old_driver_phone, new_driver_phone)

# 5. Map college markers
old_map_college_1 = """            // Add College Pin
            const collegeIcon = L.divIcon({
                className: "",
                html: `<div style="background:#E11D48;color:#fff;border-radius:12px;padding:5px 10px;font-size:11px;font-weight:900;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3)">🏫 KITSW College</div>`,
                iconSize: [110, 28]
            });"""
new_map_college_1 = """            // Add College Pin
            const collegeIcon = L.divIcon({
                className: "",
                html: `<div style="background:var(--navy);color:#fff;border-radius:4px;padding:4px 8px;font-size:11px;font-weight:700;border:1px solid var(--line);display:flex;align-items:center;gap:4px;"><svg style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;"><use href="icons.svg#icon-kambus"/></svg> KITSW College</div>`,
                iconSize: [110, 24]
            });"""
content = content.replace(old_map_college_1, new_map_college_1)

old_map_college_2 = """            const collegeIcon = L.divIcon({
                className: "",
                html: `<div style="background:#E11D48;color:#fff;border-radius:12px;padding:5px 10px;font-size:11px;font-weight:900;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3)">🏫 KITSW College</div>`,
                iconSize: [110, 28]
            });"""
new_map_college_2 = """            const collegeIcon = L.divIcon({
                className: "",
                html: `<div style="background:var(--navy);color:#fff;border-radius:4px;padding:4px 8px;font-size:11px;font-weight:700;border:1px solid var(--line);display:flex;align-items:center;gap:4px;"><svg style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;"><use href="icons.svg#icon-kambus"/></svg> KITSW College</div>`,
                iconSize: [110, 24]
            });"""
content = content.replace(old_map_college_2, new_map_college_2)

# 6. Global search item prefixes
content = content.replace(
    '`<div onclick="window.KambusAdmin.openBusModal(${b.bus_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900">🚌 Bus ${escapeHtml(b.bus_number)} (${escapeHtml(b.driver_name || \'No driver\')}) &rarr;</div>`',
    '`<div onclick="window.KambusAdmin.openBusModal(${b.bus_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900 flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-bus"/></svg><span>Bus ${escapeHtml(b.bus_number)} (${escapeHtml(b.driver_name || \'No driver\')}) &rarr;</span></div>`'
)

content = content.replace(
    '`<div onclick="window.KambusAdmin.openDriverModal(${d.driver_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900">👨‍✈️ ${escapeHtml(d.name)} (${escapeHtml(d.driver_code)}) &rarr;</div>`',
    '`<div onclick="window.KambusAdmin.openDriverModal(${d.driver_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900 flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-user-tie"/></svg><span>${escapeHtml(d.name)} (${escapeHtml(d.driver_code)}) &rarr;</span></div>`'
)

content = content.replace(
    '`<div onclick="window.KambusAdmin.openAssignStudentModal(${s.student_id}, ${jsArg(s.name)}, ${s.bus_id || \'null\'}, ${s.stop_id || \'null\'})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900">👨‍🎓 ${escapeHtml(s.name)} - ${escapeHtml(s.roll_number)} (${escapeHtml(s.bus_number ? \'Bus \' + s.bus_number : \'No bus\')}) &rarr;</div>`',
    '`<div onclick="window.KambusAdmin.openAssignStudentModal(${s.student_id}, ${jsArg(s.name)}, ${s.bus_id || \'null\'}, ${s.stop_id || \'null\'})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900 flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-user-graduate"/></svg><span>${escapeHtml(s.name)} - ${escapeHtml(s.roll_number)} (${escapeHtml(s.bus_number ? \'Bus \' + s.bus_number : \'No bus\')}) &rarr;</span></div>`'
)

content = content.replace(
    '`<div onclick="window.KambusAdmin.previewRouteRoadMap(${r.route_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900">🛣️ ${escapeHtml(r.name)} (${r.stops_count} stops) &rarr;</div>`',
    '`<div onclick="window.KambusAdmin.previewRouteRoadMap(${r.route_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900 flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-route"/></svg><span>${escapeHtml(r.name)} (${r.stops_count} stops) &rarr;</span></div>`'
)

content = content.replace(
    '`<div onclick="window.KambusAdmin.showSection(\'stops\')" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900">📍 ${escapeHtml(st.name)} (Route: ${escapeHtml(st.route_name || \'-\')}) &rarr;</div>`',
    '`<div onclick="window.KambusAdmin.showSection(\'stops\')" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-bold text-slate-900 flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-ink-muted shrink-0"><use href="icons.svg#icon-map-pin"/></svg><span>${escapeHtml(st.name)} (Route: ${escapeHtml(st.route_name || \'-\')}) &rarr;</span></div>`'
)

# 7. Convert rounded-2xl and rounded-xl to rounded
content = re.sub(r'\brounded-(?:xl|2xl|3xl)\b', 'rounded', content)

# 8. Convert remaining non-token color classes
color_replacements = [
    ('bg-indigo-50', 'bg-brand/10'),
    ('bg-indigo-100', 'bg-brand/10'),
    ('text-indigo-900', 'text-navy'),
    ('text-indigo-800', 'text-brand'),
    ('text-indigo-700', 'text-brand'),
    ('border-indigo-100', 'border-brand/20'),
    ('border-indigo-200', 'border-brand/20'),
    ('bg-emerald-50/50', 'bg-ok/10'),
    ('bg-emerald-50', 'bg-ok/10'),
    ('bg-emerald-100', 'bg-ok/10'),
    ('bg-emerald-500', 'bg-ok'),
    ('text-emerald-800', 'text-ok'),
    ('text-emerald-700', 'text-ok'),
    ('text-emerald-600', 'text-ok'),
    ('border-emerald-200', 'border-ok/20'),
    ('border-emerald-300', 'border-ok/20'),
    ('bg-amber-50', 'bg-warn/10'),
    ('bg-amber-100', 'bg-warn/10'),
    ('text-amber-900', 'text-warn'),
    ('text-amber-800', 'text-warn'),
    ('border-amber-200', 'border-warn/20'),
    ('border-amber-300', 'border-warn/20'),
    ('bg-rose-50/10', 'bg-danger/10'),
    ('bg-rose-50', 'bg-danger/10'),
    ('bg-rose-100', 'bg-danger/10'),
    ('bg-rose-600', 'bg-danger'),
    ('text-rose-900', 'text-danger'),
    ('text-rose-800', 'text-danger'),
    ('text-rose-700', 'text-danger'),
    ('text-rose-600', 'text-danger'),
    ('text-rose-500', 'text-danger'),
    ('border-rose-200', 'border-danger/20'),
    ('border-rose-300', 'border-danger/20'),
    ('bg-purple-50', 'bg-brand/10'),
    ('bg-purple-100', 'bg-brand/10'),
    ('text-purple-700', 'text-brand'),
    ('text-purple-800', 'text-brand'),
]

for old, new in color_replacements:
    content = content.replace(old, new)

with open("app/src/main/assets/admin.js", "w", encoding="utf-8") as f:
    f.write(content)

print("admin.js cleaned successfully")
