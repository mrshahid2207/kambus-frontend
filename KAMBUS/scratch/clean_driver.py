import re

with open("app/src/main/assets/driver.js", "r", encoding="utf-8") as f:
    content = f.read()

# Emojis in logs & comments
content = content.replace("⚠️", "[WARN]")
content = content.replace("❌", "[ERROR]")
content = content.replace("🟢 Sending", "Sending")
content = content.replace("• 👥 ", "• ")

# College icon on map
old_college_icon = """    // 2. Plot College Marker
    const collegeIcon = L.divIcon({
        className: "",
        html: `
            <div style="
                width: 34px; height: 34px;
                border-radius: 10px;
                background: #059669;
                color: #ffffff;
                border: 3px solid #ffffff;
                display: flex; align-items: center; justify-content: center;
                font-size: 15px;
                box-shadow: 0 3px 8px rgba(0,0,0,0.25);
            ">
                🏫
            </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
    });"""

new_college_icon = """    // 2. Plot College Marker
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
    });"""
content = content.replace(old_college_icon, new_college_icon)

# Bus icon on map
old_bus_icon = """            html: `
                <div style="position: relative; width: 40px; height: 40px;">
                    <div class="bus-pulse-ring" style="
                        position: absolute; inset: -5px;
                        border-radius: 50%;
                        background: rgba(79, 70, 229, 0.35);
                    "></div>
                    <div style="
                        position: relative;
                        width: 40px; height: 40px;
                        border-radius: 50%;
                        background: #4F46E5;
                        color: white;
                        border: 3px solid white;
                        display: flex; align-items: center; justify-content: center;
                        font-size: 18px;
                        box-shadow: 0 3px 10px rgba(0,0,0,0.3);
                    ">
                        🚌
                    </div>
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20]"""

new_bus_icon = """            html: `
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
            iconAnchor: [18, 18]"""
content = content.replace(old_bus_icon, new_bus_icon)

# Non-token colors in status
content = content.replace('bg-amber-500', 'bg-warn')
content = content.replace('text-amber-600', 'text-warn')
content = content.replace('bg-emerald-500', 'bg-ok')
content = content.replace('text-emerald-600', 'text-ok')
content = content.replace('bg-indigo-400', 'bg-brand')
content = content.replace('bg-emerald-400', 'bg-ok')
content = content.replace('bg-amber-400', 'bg-warn')

# QR pass verification badge
content = content.replace(
    'text-amber-800 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg',
    'text-warn bg-warn/10 border border-warn/20 px-2.5 py-1 rounded'
)
content = content.replace(
    'text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg',
    'text-ok bg-ok/10 border border-ok/20 px-2.5 py-1 rounded'
)

# Detour reason & delay buttons
content = content.replace(
    'btn.className = "detourReasonBtn py-2.5 px-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-left";',
    'btn.className = "detourReasonBtn py-2.5 px-3 rounded border border-line bg-surface text-ink font-bold text-left";'
)
content = content.replace(
    'button.className = "detourReasonBtn py-2.5 px-3 rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 font-black text-left";',
    'button.className = "detourReasonBtn py-2.5 px-3 rounded border border-warn bg-warn/10 text-warn font-black text-left";'
)
content = content.replace(
    'btn.className = "detourDelayBtn py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700";',
    'btn.className = "detourDelayBtn py-2 rounded border border-line bg-surface text-ink";'
)
content = content.replace(
    'button.className = "detourDelayBtn py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 font-black";',
    'button.className = "detourDelayBtn py-2 rounded border border-warn bg-warn/10 text-warn font-black";'
)

# SOS type buttons
content = content.replace(
    'btn.className = "sosTypeBtn py-2.5 px-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-left";',
    'btn.className = "sosTypeBtn py-2.5 px-3 rounded border border-line bg-surface text-ink font-bold text-left";'
)
content = content.replace(
    'button.className = "sosTypeBtn py-2.5 px-3 rounded-2xl border border-rose-300 bg-rose-50 text-rose-900 font-black text-left";',
    'button.className = "sosTypeBtn py-2.5 px-3 rounded border border-danger bg-danger/10 text-danger font-black text-left";'
)

with open("app/src/main/assets/driver.js", "w", encoding="utf-8") as f:
    f.write(content)

print("driver.js cleaned successfully")
