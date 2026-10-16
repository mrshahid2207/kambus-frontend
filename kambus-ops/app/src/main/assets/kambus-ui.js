// KAMBUS UI: Accessible toast, bottom-sheet and confirmation system
// Strictly Palette C design tokens, 4px radius, 1px hairlines, no emoji.
(function () {
  "use strict";

  let toastTimer = null;

  function ensureContainers() {
    if (!document.getElementById("kambusIconsHolder")) {
      fetch("icons.svg")
        .then(r => r.text())
        .then(svg => {
          const div = document.createElement("div");
          div.id = "kambusIconsHolder";
          div.style.display = "none";
          div.innerHTML = svg;
          document.body.insertBefore(div, document.body.firstChild);
        })
        .catch(() => {});
    }

    let region = document.getElementById("kambusToastRegion");
    if (!region) {
      region = document.createElement("div");
      region.id = "kambusToastRegion";
      region.style.cssText = "position:fixed;bottom:16px;left:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;align-items:center;";
      document.body.appendChild(region);
    }

    let backdrop = document.getElementById("kambusSheetBackdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.id = "kambusSheetBackdrop";
      backdrop.className = "kambus-sheet-backdrop hidden";
      backdrop.innerHTML = '<div id="kambusSheet" class="kambus-sheet" role="dialog" aria-modal="true"></div>';
      document.body.appendChild(backdrop);
    }
  }

  function notify(options) {
    if (typeof options === "string") options = { message: options };
    ensureContainers();
    const region = document.getElementById("kambusToastRegion");
    if (!region) return { dismiss: () => {} };

    const type = (options.type === "error" || options.type === "danger") ? "danger" : (options.type === "warning" || options.type === "warn") ? "warn" : "ok";
    const duration = options.duration || 4000;

    const toast = document.createElement("div");
    toast.className = "kambus-toast toast-" + type;
    toast.style.cssText = "pointer-events:auto;max-width:480px;width:100%;margin:0 auto;";

    const titleText = options.title ? '<strong style="display:block;font-size:14px;font-weight:600;color:var(--navy);">' + escapeText(options.title) + '</strong>' : "";
    const msgText = '<span style="display:block;font-size:12px;color:var(--ink);">' + escapeText(options.message || "") + '</span>';

    toast.innerHTML = '<div style="flex:1;">' + titleText + msgText + '</div>' +
      '<button type="button" aria-label="Dismiss" style="min-width:32px;min-height:32px;padding:0;background:none;border:none;color:var(--ink-muted);font-size:18px;cursor:pointer;line-height:1;">×</button>';

    const dismiss = () => {
      if (!toast.isConnected) return;
      toast.style.opacity = "0";
      toast.style.transform = "translateY(12px)";
      setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector("button").addEventListener("click", dismiss);
    region.appendChild(toast);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }

    return { dismiss };
  }

  function escapeText(str) {
    const p = document.createElement("p");
    p.textContent = str == null ? "" : String(str);
    return p.innerHTML;
  }

  function showSheet(htmlContent) {
    ensureContainers();
    const backdrop = document.getElementById("kambusSheetBackdrop");
    const sheet = document.getElementById("kambusSheet");
    if (!backdrop || !sheet) return;

    sheet.innerHTML = htmlContent;
    backdrop.classList.remove("hidden");
  }

  function closeSheet() {
    const backdrop = document.getElementById("kambusSheetBackdrop");
    if (backdrop) {
      backdrop.classList.add("hidden");
    }
  }

  function confirmDialog(options) {
    let title = "Confirm";
    let message = "Are you sure?";
    let confirmText = "Confirm";
    let cancelText = "Cancel";
    let isDanger = false;

    if (typeof options === "string") {
      message = options;
    } else if (options && typeof options === "object") {
      title = options.title || title;
      message = options.message || message;
      confirmText = options.confirmText || confirmText;
      cancelText = options.cancelText || cancelText;
      isDanger = Boolean(options.danger);
    }

    return new Promise(resolve => {
      const heading = title ? '<h3 style="margin:0 0 8px 0;font-size:16px;font-weight:600;color:var(--navy);">' + escapeText(title) + '</h3>' : "";
      const body = '<p style="margin:0 0 20px 0;font-size:14px;color:var(--ink);line-height:20px;">' + escapeText(message) + '</p>';
      const confirmBg = isDanger ? "var(--danger)" : "var(--navy)";
      const actions = '<div style="display:flex;gap:12px;">' +
        '<button id="kambusConfirmCancel" type="button" style="flex:1;height:44px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:4px;font-weight:600;cursor:pointer;">' + escapeText(cancelText) + '</button>' +
        '<button id="kambusConfirmOk" type="button" style="flex:1;height:44px;background:' + confirmBg + ';color:#fff;border:1px solid var(--line);border-radius:4px;font-weight:600;cursor:pointer;">' + escapeText(confirmText) + '</button>' +
        '</div>';

      showSheet(heading + body + actions);

      const cancelBtn = document.getElementById("kambusConfirmCancel");
      const okBtn = document.getElementById("kambusConfirmOk");

      if (cancelBtn) {
        cancelBtn.onclick = () => {
          closeSheet();
          resolve(false);
        };
      }
      if (okBtn) {
        okBtn.focus();
        okBtn.onclick = () => {
          closeSheet();
          resolve(true);
        };
      }
    });
  }

  function alertDialog(title, message) {
    if (!message && title) {
      message = title;
      title = "";
    }
    return new Promise(resolve => {
      const heading = title ? '<h3 style="margin:0 0 8px 0;font-size:16px;font-weight:600;color:var(--navy);">' + escapeText(title) + '</h3>' : "";
      const body = '<p style="margin:0 0 16px 0;font-size:14px;color:var(--ink);line-height:20px;">' + escapeText(message) + '</p>';
      const btn = '<button id="kambusAlertOk" type="button" style="width:100%;height:44px;background:var(--navy);color:#fff;border:1px solid var(--line);border-radius:4px;font-weight:600;cursor:pointer;">OK</button>';
      showSheet(heading + body + btn);

      const okBtn = document.getElementById("kambusAlertOk");
      if (okBtn) {
        okBtn.focus();
        okBtn.onclick = () => {
          closeSheet();
          resolve();
        };
      }
    });
  }

  function promptDialog(message, defaultValue) {
    return new Promise(resolve => {
      const body = '<p style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:var(--navy);">' + escapeText(message) + '</p>';
      const input = '<input id="kambusPromptInput" type="text" value="' + escapeText(defaultValue || "") + '" style="width:100%;height:44px;border:1px solid var(--line);border-radius:4px;padding:8px 12px;margin-bottom:16px;box-sizing:border-box;font-size:14px;" />';
      const actions = '<div style="display:flex;gap:12px;">' +
        '<button id="kambusPromptCancel" type="button" style="flex:1;height:44px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:4px;font-weight:600;cursor:pointer;">Cancel</button>' +
        '<button id="kambusPromptOk" type="button" style="flex:1;height:44px;background:var(--navy);color:#fff;border:1px solid var(--line);border-radius:4px;font-weight:600;cursor:pointer;">Submit</button>' +
        '</div>';
      showSheet(body + input + actions);

      const inputEl = document.getElementById("kambusPromptInput");
      const cancelBtn = document.getElementById("kambusPromptCancel");
      const okBtn = document.getElementById("kambusPromptOk");

      if (inputEl) inputEl.focus();
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          closeSheet();
          resolve(null);
        };
      }
      if (okBtn) {
        okBtn.onclick = () => {
          const val = inputEl ? inputEl.value : "";
          closeSheet();
          resolve(val);
        };
      }
    });
  }

  window.KambusNotify = {
    notify: notify,
    confirm: confirmDialog
  };

  window.KambusUI = {
    toast: (msg, type, dur) => notify({ message: msg, type: type, duration: dur }),
    sheet: showSheet,
    closeSheet: closeSheet,
    alert: alertDialog,
    confirm: confirmDialog,
    prompt: promptDialog
  };

  window.alert = function (msg) {
    alertDialog("", String(msg));
  };
  window.confirm = function (msg) {
    return confirmDialog(String(msg));
  };
  window.prompt = function (msg, def) {
    return promptDialog(String(msg), def);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureContainers);
  } else {
    ensureContainers();
  }
})();
