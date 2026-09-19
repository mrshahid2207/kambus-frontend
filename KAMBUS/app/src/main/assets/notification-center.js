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

                <div id="kambusNotificationList">
                    Loading…
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
                                    ${new Date(
                                        n.created_at
                                    ).toLocaleString()}
                                </small>

                            </button>
                        `)
                        .join("");

            } else {

                list.innerHTML =
                    '<p class="kambus-notification-empty">No notifications yet.</p>';

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
                list.textContent = error.message;
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