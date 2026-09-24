import re

with open("app/src/main/assets/admin.js", "r", encoding="utf-8") as f:
    text = f.read()

# 1. FontAwesome icon replacements
fa_map = {
    '<i class="fa-solid fa-route text-slate-400 w-4 text-center"></i>': '<svg class="w-4 h-4 shrink-0 text-ink-muted inline" aria-hidden="true"><use href="icons.svg#icon-route"/></svg>',
    '<i class="fa-solid fa-user-tie text-slate-400 w-4 text-center"></i>': '<svg class="w-4 h-4 shrink-0 text-ink-muted inline" aria-hidden="true"><use href="icons.svg#icon-user-tie"/></svg>',
    '<i class="fa-solid fa-trash-can text-sm"></i>': '<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-trash"/></svg>',
    '<i class="fa-solid fa-triangle-exclamation text-amber-600"></i>': '<svg class="w-4 h-4 shrink-0 text-warn inline mr-1" aria-hidden="true"><use href="icons.svg#icon-alert"/></svg>',
    '<i class="fa-solid fa-pen-to-square text-sm"></i>': '<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-pen"/></svg>',
    '<i class="fa-solid fa-trash-can"></i>': '<svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="icons.svg#icon-trash"/></svg>',
    '<i class="fa-solid fa-map-location-dot"></i> View Road Map': '<svg class="w-4 h-4 shrink-0 inline mr-1" aria-hidden="true"><use href="icons.svg#icon-route"/></svg> View Road Map',
    '<i class="fa-solid fa-triangle-exclamation"></i> CORROBORATED': '<svg class="w-3.5 h-3.5 shrink-0 inline mr-1" aria-hidden="true"><use href="icons.svg#icon-alert"/></svg> CORROBORATED',
    '<i class="fa-solid fa-user-shield text-xs"></i> <span>Super-Admin Detail</span>': '<svg class="w-3.5 h-3.5 shrink-0 inline mr-1" aria-hidden="true"><use href="icons.svg#icon-user-shield"/></svg> <span>Super-Admin Detail</span>',
    'btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send to ${count} Student${count === 1 ? \'\' : \'s\'}`;': 'btn.innerHTML = `<svg class="w-4 h-4 shrink-0 inline mr-1.5" aria-hidden="true"><use href="icons.svg#icon-paper-plane"/></svg> Send to ${count} Student${count === 1 ? \'\' : \'s\'}`;',
    "btn.innerHTML = '<i class=\"fa-solid fa-user-shield w-4 text-center\"></i> <span>Admin Accounts</span>';": "btn.innerHTML = '<svg class=\"w-4 h-4 shrink-0 inline mr-1.5\" aria-hidden=\"true\"><use href=\"icons.svg#icon-user-shield\"/></svg> <span>Admin Accounts</span>';"
}

for old, new in fa_map.items():
    if old in text:
        text = text.replace(old, new)
    else:
        print(f"Warning: pattern not found: {old[:40]}")

# 2. Category labels
text = text.replace('return "🏎️ Rash / Reckless Driving";', 'return "Rash / Reckless Driving";')
text = text.replace('return "⏱️ Severe Delay";', 'return "Severe Delay";')
text = text.replace('return "⚡ Overspeeding";', 'return "Overspeeding";')
text = text.replace('return "🚫 Skipped Scheduled Stop";', 'return "Skipped Scheduled Stop";')
text = text.replace('return "🗣️ Rude / Inappropriate Behavior";', 'return "Rude / Inappropriate Behavior";')
text = text.replace('return "📝 Other Concern";', 'return "Other Concern";')

# 3. Poll votes
text = text.replace('👍 ${yesVotes} Agreed', '${yesVotes} Agreed')
text = text.replace('👎 ${noVotes} Disagreed', '${noVotes} Disagreed')
text = text.replace("${v.vote === 'yes' ? '👍 Agreed (Yes)' : '👎 Disagreed (No)'}", "${v.vote === 'yes' ? 'Agreed (Yes)' : 'Disagreed (No)'}")

# 4. Details / Popups / Labels
text = text.replace('<p>🚌 Assigned:', '<p>Assigned:')
text = text.replace('<p>🛣️ Route:', '<p>Route:')
text = text.replace('document.getElementById("modalDriverPhone").textContent = `📞 ${driver.phone || \'No phone\'}`;', 'document.getElementById("modalDriverPhone").textContent = driver.phone || "No phone";')
text = text.replace("${s.travelling_today ? '✓ Travelling' : '✕ Not Travelling'}", "${s.travelling_today ? 'Travelling' : 'Not Travelling'}")
text = text.replace('👥 ${stop.student_count || 0} students', '${stop.student_count || 0} students')
text = text.replace('&bull; 👥', '&bull; Students:')
text = text.replace('if (display) display.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;', 'if (display) display.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;')
text = text.replace('<span>🚌 Bus ${escapeHtml(bus.bus_number)}</span>', '<span>Bus ${escapeHtml(bus.bus_number)}</span>')
text = text.replace('countDisplay.textContent = `🎯 Affected Students: ${count}`;', 'countDisplay.textContent = `Affected Students: ${count}`;')
text = text.replace('✓ Acknowledged', 'Acknowledged')

# 5. Alert icons in admin.js
old_alert_icon = "<span class=\"text-base\">${a.type === 'emergency_sos' ? '🚨' : (a.type === 'detour_alert' ? '🚧' : '🔔')}</span>"
new_alert_icon = '<span class="flex items-center justify-center w-5 h-5">${a.type === "emergency_sos" ? \'<svg class="w-4 h-4 text-danger shrink-0" aria-hidden="true"><use href="icons.svg#icon-alert"/></svg>\' : (a.type === "detour_alert" ? \'<svg class="w-4 h-4 text-warn shrink-0" aria-hidden="true"><use href="icons.svg#icon-route"/></svg>\' : \'<svg class="w-4 h-4 text-navy shrink-0" aria-hidden="true"><use href="icons.svg#icon-bell"/></svg>\')}</span>'
text = text.replace(old_alert_icon, new_alert_icon)

# 6. Search results icons
text = text.replace('data.buses.map(b => `<div onclick="window.KambusAdmin.openBusModal(${b.bus_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-semibold text-slate-800">🚌 Bus ${escapeHtml(b.bus_number)} <span class="font-normal text-slate-500">(${escapeHtml(b.route_name || "No route")})</span></div>`)',
                    'data.buses.map(b => `<div onclick="window.KambusAdmin.openBusModal(${b.bus_id})" class="p-2 hover:bg-bg rounded cursor-pointer text-xs font-semibold text-navy flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-navy shrink-0" aria-hidden="true"><use href="icons.svg#icon-bus"/></svg><span>Bus ${escapeHtml(b.bus_number)}</span><span class="font-normal text-ink-muted">(${escapeHtml(b.route_name || "No route")})</span></div>`)')

text = text.replace('data.drivers.map(d => `<div onclick="window.KambusAdmin.openDriverModal(${d.driver_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-semibold text-slate-800">✈️ Driver: ${escapeHtml(d.name)} <span class="font-normal text-slate-500">(${escapeHtml(d.phone || "No phone")})</span></div>`)',
                    'data.drivers.map(d => `<div onclick="window.KambusAdmin.openDriverModal(${d.driver_id})" class="p-2 hover:bg-bg rounded cursor-pointer text-xs font-semibold text-navy flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-navy shrink-0" aria-hidden="true"><use href="icons.svg#icon-user-tie"/></svg><span>Driver: ${escapeHtml(d.name)}</span><span class="font-normal text-ink-muted">(${escapeHtml(d.phone || "No phone")})</span></div>`)')

text = text.replace('data.students.map(s => `<div onclick="window.KambusAdmin.openAssignStudentModal(${s.student_id}, ${jsArg(s.name)}, ${s.bus_id || "null"}, ${s.stop_id || "null"})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-semibold text-slate-800">🎓 Student: ${escapeHtml(s.name)} (${escapeHtml(s.roll_number)})</div>`)',
                    'data.students.map(s => `<div onclick="window.KambusAdmin.openAssignStudentModal(${s.student_id}, ${jsArg(s.name)}, ${s.bus_id || "null"}, ${s.stop_id || "null"})" class="p-2 hover:bg-bg rounded cursor-pointer text-xs font-semibold text-navy flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-navy shrink-0" aria-hidden="true"><use href="icons.svg#icon-user-graduate"/></svg><span>Student: ${escapeHtml(s.name)} (${escapeHtml(s.roll_number)})</span></div>`)')

text = text.replace('data.routes.map(r => `<div onclick="window.KambusAdmin.previewRouteRoadMap(${r.route_id})" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-semibold text-slate-800">🛣️ Route: ${escapeHtml(r.name)}</div>`)',
                    'data.routes.map(r => `<div onclick="window.KambusAdmin.previewRouteRoadMap(${r.route_id})" class="p-2 hover:bg-bg rounded cursor-pointer text-xs font-semibold text-navy flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-navy shrink-0" aria-hidden="true"><use href="icons.svg#icon-route"/></svg><span>Route: ${escapeHtml(r.name)}</span></div>`)')

text = text.replace('data.stops.map(st => `<div onclick="window.KambusAdmin.showSection(\'stops\')" class="p-2 hover:bg-slate-50 rounded cursor-pointer text-xs font-semibold text-slate-800">📍 Stop: ${escapeHtml(st.name)}</div>`)',
                    'data.stops.map(st => `<div onclick="window.KambusAdmin.showSection(\'stops\')" class="p-2 hover:bg-bg rounded cursor-pointer text-xs font-semibold text-navy flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-navy shrink-0" aria-hidden="true"><use href="icons.svg#icon-map-pin"/></svg><span>Stop: ${escapeHtml(st.name)}</span></div>`)')

# 7. Toasts
text = text.replace('showToast("error", data.title || "🚨 URGENT EMERGENCY SOS", data.message);', 'showToast("error", data.title || "URGENT EMERGENCY SOS", data.message);')
text = text.replace('showToast("warning", data.title || "⚠️ Route Detour Reported", data.message);', 'showToast("warning", data.title || "Route Detour Reported", data.message);')

# 8. College marker in admin.js
text = text.replace(
    """html: `<div style="background:#E11D48;color:#fff;border-radius:12px;padding:5px 10px;font-size:11px;font-weight:900;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏫 KITSW College</div>`""",
    """html: `<div style="background:var(--navy);color:#fff;border-radius:4px;padding:4px 8px;font-size:11px;font-weight:600;border:1px solid #fff;display:flex;align-items:center;gap:4px;"><svg style="width:14px;height:14px;color:#fff;" aria-hidden="true"><use href="icons.svg#icon-user-graduate"/></svg><span>KITSW College</span></div>`"""
)

with open("app/src/main/assets/admin.js", "w", encoding="utf-8") as f:
    f.write(text)

print("admin.js updated successfully.")
