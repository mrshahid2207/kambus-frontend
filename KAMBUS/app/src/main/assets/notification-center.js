(function () {

    const API_BASE = "https://kambus-backend.onrender.com";
    let open = false;

    const escape = value =>
        String(value ?? "").replace(/[&<>"']/g, c =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            })[c]
        );

    function timeAgo(value) {
        const then = new Date(value).getTime();
        if (!Number.isFinite(then)) return "";
        const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
        if (seconds < 45) return "Just now";
        if (seconds < 3600) return Math.round(seconds / 60) + " min ago";
        if (seconds < 86400) return Math.round(seconds / 3600) + " h ago";
        if (seconds < 604800) return Math.round(seconds / 86400) + " d ago";
        return new Date(then).toLocaleDateString();
    }

    async function request(path, options = {}) {

        const token = localStorage.getItem("kambus_token");

        if (!token) {
            throw Error("Session expired. Please login again.");
        }

        const response = await fetch(API_BASE + path, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
                ...(options.headers || {})
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw Error(
                data.detail || "Notifications are unavailable."
            );
        }

        return data;
    }


    function mount() {

        if (document.getElementById("kambusNotificationCenter")) {
            return;
        }

        const shell = document.createElement("div");

        shell.id = "kambusNotificationCenter";

        shell.innerHTML = `
            <section id="kambusNotificationPanel" hidden>

                <header>
                    <strong>Notifications</strong>

                    <button id="kambusReadAll" type="button">
                        Mark all read
                    </button>
                </header>

                <div id="kambusNotificationList" aria-busy="true">
                    <div class="kambus-skeleton-row"><i></i><i></i></div>
                    <div class="kambus-skeleton-row"><i></i><i></i></div>
                    <div class="kambus-skeleton-row"><i></i><i></i></div>
                </div>

            </section>
        `;

        document.body.appendChild(shell);


        // TOP BELL FROM STUDENT DASHBOARD
        const topBell =
            document.getElementById("notificationBell");

        const panel =
            document.getElementById(
                "kambusNotificationPanel"
            );


        if (topBell && panel) {

            topBell.addEventListener("click", async () => {

                open = !open;

                panel.hidden = !open;

                if (open) {
                    await refresh();
                }

            });

        }


        const readAll =
            document.getElementById("kambusReadAll");


        if (readAll) {

            readAll.addEventListener("click", async () => {

                try {

                    await request(
                        "/notifications/read-all",
                        {
                            method: "PATCH"
                        }
                    );

                    await refresh();

                } catch (error) {

                    console.error(
                        "Notification read-all error:",
                        error
                    );

                }

            });

        }

    }


    async function refresh() {

        try {

            const data =
                await request(
                    "/notifications?limit=30"
                );


            // USE EXISTING TOP BADGE (RED DOT)
            const badge =
                document.getElementById(
                    "notificationBadge"
                );

            if (badge) {
                const hasUnread = Boolean(data && data.unread_count && data.unread_count > 0);
                badge.hidden = !hasUnread;
                if (hasUnread) {
                    badge.classList.remove("hidden");
                } else {
                    badge.classList.add("hidden");
                }
                badge.textContent = "";
            }


            const list =
                document.getElementById(
                    "kambusNotificationList"
                );


            if (!list) {
                return;
            }


            list.removeAttribute("aria-busy");

            if (data.notifications.length) {

                list.innerHTML =
                    data.notifications
                        .map(n => `
                            <button
                                class="kambus-notification-item ${
                                    n.is_read ? "" : "is-unread"
                                }"
                                data-id="${n.id}"
                            >

                                <strong>
                                    ${escape(n.title)}
                                </strong>

                                <span>
                                    ${escape(n.message)}
                                </span>

                                <small>
                                    ${timeAgo(n.created_at)}
                                </small>

                            </button>
                        `)
                        .join("");

            } else {

                list.innerHTML =
                    '<div class="kambus-notification-empty"><div class="kambus-notification-empty__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></div><strong>You\'re all caught up</strong><span>New alerts will appear here.</span></div>';

            }


            list
                .querySelectorAll("[data-id]")
                .forEach(item => {

                    item.addEventListener(
                        "click",
                        async () => {

                            try {

                                await request(
                                    `/notifications/${item.dataset.id}/read`,
                                    {
                                        method: "PATCH"
                                    }
                                );

                                await refresh();

                            } catch (error) {

                                console.error(
                                    "Notification read error:",
                                    error
                                );

                            }

                        }
                    );

                });


        } catch (error) {

            console.error(
                "Notification refresh error:",
                error
            );

            const list =
                document.getElementById(
                    "kambusNotificationList"
                );

            if (list) {
                list.removeAttribute("aria-busy");
                const note = document.createElement("p");
                note.className = "kambus-notification-empty";
                note.textContent = error.message;
                list.replaceChildren(note);
            }

        }

    }


    document.addEventListener(
        "DOMContentLoaded",
        () => {

            mount();

            refresh();

            window.setInterval(
                refresh,
                30000
            );

        }
    );


    window.KambusNotificationCenter = {
        refresh
    };

})();