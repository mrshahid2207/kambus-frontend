(function () {
    "use strict";

    const TYPES = {
        success: { icon: "✓", title: "Success", duration: 3600 },
        error: { icon: "!", title: "Something went wrong", duration: 5600 },
        warning: { icon: "!", title: "Attention needed", duration: 4400 },
        info: { icon: "i", title: "KAMBUS update", duration: 3600 }
    };

    function region() {
        let element = document.querySelector(".kambus-toast-region");
        if (!element) {
            element = document.createElement("div");
            element.className = "kambus-toast-region";
            element.setAttribute("aria-live", "polite");
            element.setAttribute("aria-atomic", "true");
            document.body.appendChild(element);
        }
        return element;
    }

    function notify(options) {
        if (typeof options === "string") options = { message: options };
        const config = Object.assign({}, TYPES[options.type] || TYPES.info, options);
        const toast = document.createElement("article");
        toast.className = `kambus-toast kambus-toast--${config.type || "info"}`;
        toast.setAttribute("role", config.type === "error" ? "alert" : "status");
        toast.innerHTML = `<div class="kambus-toast__icon" aria-hidden="true">${config.icon}</div><div class="kambus-toast__content"><strong class="kambus-toast__title"></strong><p class="kambus-toast__message"></p></div><button class="kambus-toast__dismiss" type="button" aria-label="Dismiss notification">×</button>`;
        toast.querySelector(".kambus-toast__title").textContent = config.title;
        toast.querySelector(".kambus-toast__message").textContent = config.message || "";
        const dismiss = () => {
            if (!toast.isConnected) return;
            toast.classList.remove("is-visible");
            toast.classList.add("is-leaving");
            window.setTimeout(() => toast.remove(), 230);
        };
        toast.querySelector(".kambus-toast__dismiss").addEventListener("click", dismiss);
        region().appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("is-visible"));
        if (config.duration !== 0) window.setTimeout(dismiss, config.duration);
        return { dismiss };
    }

    function confirm(options) {
        const config = Object.assign({ title: "Are you sure?", message: "This action cannot be undone.", confirmText: "Confirm", cancelText: "Cancel", danger: false }, options || {});
        return new Promise((resolve) => {
            const modal = document.createElement("div");
            modal.className = `kambus-confirmation${config.danger ? " kambus-confirmation--danger" : ""}`;
            modal.setAttribute("role", "dialog");
            modal.setAttribute("aria-modal", "true");
            modal.setAttribute("aria-labelledby", "kambus-confirm-title");
            modal.innerHTML = `<div class="kambus-confirmation__card"><div class="kambus-confirmation__icon" aria-hidden="true">!</div><h2 class="kambus-confirmation__title" id="kambus-confirm-title"></h2><p class="kambus-confirmation__message"></p><div class="kambus-confirmation__actions"><button class="kambus-confirmation__button kambus-confirmation__cancel" type="button"></button><button class="kambus-confirmation__button kambus-confirmation__approve" type="button"></button></div></div>`;
            modal.querySelector(".kambus-confirmation__title").textContent = config.title;
            modal.querySelector(".kambus-confirmation__message").textContent = config.message;
            const cancel = modal.querySelector(".kambus-confirmation__cancel");
            const approve = modal.querySelector(".kambus-confirmation__approve");
            cancel.textContent = config.cancelText;
            approve.textContent = config.confirmText;
            const close = (answer) => {
                modal.classList.remove("is-visible");
                window.setTimeout(() => modal.remove(), 210);
                resolve(answer);
            };
            cancel.addEventListener("click", () => close(false));
            approve.addEventListener("click", () => close(true));
            modal.addEventListener("click", (event) => { if (event.target === modal) close(false); });
            modal.addEventListener("keydown", (event) => { if (event.key === "Escape") close(false); });
            document.body.appendChild(modal);
            requestAnimationFrame(() => { modal.classList.add("is-visible"); cancel.focus(); });
        });
    }

    window.KambusNotify = { notify, confirm };
}());
