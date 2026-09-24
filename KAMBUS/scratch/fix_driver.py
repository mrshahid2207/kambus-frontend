with open("app/src/main/assets/driver.js", "r", encoding="utf-8") as f:
    text = f.read()

# 1. startTripIcon SVG
text = text.replace(
    'if (startIcon) startIcon.className = "fa-solid fa-circle-notch fa-spin text-3xl mb-0.5";',
    'if (startIcon) {\n        startIcon.className = "w-4 h-4 animate-spin shrink-0";\n        startIcon.innerHTML = \'<use href="icons.svg#icon-spinner"/>\';\n    }'
)
text = text.replace(
    'if (startIcon) startIcon.className = "fa-solid fa-play text-3xl mb-0.5";',
    'if (startIcon) {\n        startIcon.className = "w-4 h-4 shrink-0";\n        startIcon.innerHTML = \'<use href="icons.svg#icon-play"/>\';\n    }'
)

# 2. passedElem and skipBtn
text = text.replace(
    'if (passedElem) passedElem.innerHTML = `<i class="fa-solid fa-check"></i> ${passedCount} passed`;',
    'if (passedElem) passedElem.innerHTML = `<svg class="w-3.5 h-3.5 text-ok shrink-0 inline mr-1" aria-hidden="true"><use href="icons.svg#icon-check"/></svg>${passedCount} passed`;'
)
text = text.replace(
    'skipBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-xs"></i>`;',
    'skipBtn.innerHTML = `<svg class="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true"><use href="icons.svg#icon-spinner"/></svg>`;'
)
text = text.replace(
    'skipBtn.innerHTML = `<i class="fa-solid fa-forward-step text-[10px]"></i> <span>SKIP</span>`;',
    'skipBtn.innerHTML = `<svg class="w-3 h-3 shrink-0" aria-hidden="true"><use href="icons.svg#icon-forward-step"/></svg><span>SKIP</span>`;'
)

# 3. Remove user-facing emojis
text = text.replace('studentsElem.textContent = `👥 ${count} expected`;', 'studentsElem.textContent = `${count} students expected`;')
text = text.replace('if (remainingElem) remainingElem.textContent = `○ ${remainingCount} remaining`;', 'if (remainingElem) remainingElem.textContent = `${remainingCount} remaining`;')
text = text.replace("nextElem.textContent = currentNextStop ? `● Next: ${currentNextStop.name}` : `● To College`;", "nextElem.textContent = currentNextStop ? `Next: ${currentNextStop.name}` : `To College`;")
text = text.replace('stop.student_count ? ` • 👥 ${stop.student_count} expected` : ""', 'stop.student_count ? ` • ${stop.student_count} expected` : ""')
text = text.replace("countdownElem.textContent = \"Auto-accepted ✓\";", 'countdownElem.textContent = "Auto-accepted";')
text = text.replace('badgeElem.textContent = "⚠️ MARKED NOT TRAVELLING";', 'badgeElem.textContent = "MARKED NOT TRAVELLING";')
text = text.replace('badgeElem.textContent = "✓ PASS VALID & ACTIVE";', 'badgeElem.textContent = "PASS VALID & ACTIVE";')
text = text.replace('title: "Student Verified ✓",', 'title: "Student Verified",')
text = text.replace('textElem.textContent = `🚧 Active Detour: ${currentDetourReason} (+${currentDetourDelay} min delay)`;', 'textElem.textContent = `Active Detour: ${currentDetourReason} (+${currentDetourDelay} min delay)`;')
text = text.replace('textElem.textContent = `🚨 SOS ACTIVE: ${currentSosType} — Authorities & Dispatch Alerted`;', 'textElem.textContent = `SOS ACTIVE: ${currentSosType} — Authorities & Dispatch Alerted`;')
text = text.replace("${isPassed ? '✓' : (stopOrder || '•')}", "${isPassed ? '•' : (stopOrder || '•')}")

# 4. College icon in driver.js
text = text.replace(
    """    const collegeIcon = L.divIcon({
        className: "",
        html: `
            <div style="
                width: 32px; height: 32px;
                border-radius: 8px;
                background: #059669;
                color: #ffffff;
                border: 2px solid #ffffff;
                display: flex; align-items: center; justify-content: center;
                font-size: 16px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            ">
                🏫
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });""",
    """    const collegeIcon = L.divIcon({
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
                <svg style="width:16px;height:16px;color:#ffffff;" aria-hidden="true"><use href="icons.svg#icon-user-graduate"/></svg>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });"""
)

# 5. Bus icon in driver map popup
text = text.replace('<span style="font-size:16px;">🚌</span>', '<svg style="width:16px;height:16px;display:inline-block;" aria-hidden="true"><use href="icons.svg#icon-bus"/></svg>')

with open("app/src/main/assets/driver.js", "w", encoding="utf-8") as f:
    f.write(text)

print("driver.js updated successfully.")
