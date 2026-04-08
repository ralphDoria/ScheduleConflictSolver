// Self-contained Friends Modal component for ScheduleConflictSolver
// Usage: scsFriendsModal.init(container), scsFriendsModal.open(), scsFriendsModal.close()

const scsFriendsModal = (() => {
    let overlay = null;
    let modalEl = null;
    let loginView = null;
    let contentView = null;
    let userBar = null;
    let requestsGrid = null;
    let friendsGrid = null;
    let initialized = false;
    let currentUser = null;

    function sendToBackground(msg) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(msg, resolve);
        });
    }

    function injectCSS() {
        if (document.getElementById("scs-friends-modal-styles")) return;
        const style = document.createElement("style");
        style.id = "scs-friends-modal-styles";
        style.textContent = `
            #scs-friends-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.45); z-index: 15000; display: flex; align-items: center; justify-content: center; border-radius: inherit; }
            #scs-friends-overlay.scs-friends-hidden { display: none; }
            #scs-friends-modal { background: #fff; border-radius: 8px; width: 400px; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); font-family: sans-serif; font-size: 13px; }
            .scs-friends-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #CCD4E0; }
            .scs-friends-title { font-weight: bold; font-size: 16px; }
            .scs-friends-close { background: none; border: none; font-size: 20px; cursor: pointer; color: #888; padding: 0 4px; line-height: 1; }
            .scs-friends-close:hover { color: #333; }
            .scs-friends-login { padding: 30px 16px; text-align: center; }
            .scs-friends-login p { color: #555; margin-bottom: 16px; font-size: 13px; }
            .scs-friends-google-btn { padding: 8px 20px; font-size: 13px; cursor: pointer; background: #fff; border: 1px solid #CCD4E0; border-radius: 4px; color: #333; display: inline-flex; align-items: center; gap: 8px; }
            .scs-friends-google-btn:hover { background: #f5f5f5; }
            .scs-friends-login-error { color: #c44; font-size: 11px; margin-top: 10px; }
            .scs-friends-user-bar { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: #f7f9fc; border-bottom: 1px solid #eee; font-size: 11px; color: #555; }
            .scs-friends-logout { background: none; border: none; color: #c44; cursor: pointer; font-size: 11px; }
            .scs-friends-logout:hover { text-decoration: underline; }
            .scs-friends-section { padding: 12px 16px; }
            .scs-friends-section-title { font-weight: bold; font-size: 13px; color: #555; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #eee; }
            .scs-friends-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .scs-friends-empty { grid-column: 1 / -1; text-align: center; color: #888; font-style: italic; padding: 10px; font-size: 12px; }
            .scs-friend-card { border: 1px solid #CCD4E0; border-radius: 6px; padding: 10px; background: #f9fafb; }
            .scs-friend-card-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
            .scs-friend-name { font-weight: 600; font-size: 12px; }
            .scs-friend-arrow { font-size: 10px; color: #888; transition: transform 0.2s; }
            .scs-friend-card.scs-friend-expanded .scs-friend-arrow { transform: rotate(180deg); }
            .scs-request-actions { display: flex; gap: 6px; margin-top: 8px; }
            .scs-request-accept { flex: 1; padding: 4px; font-size: 11px; cursor: pointer; background: #4a9e5c; color: #fff; border: none; border-radius: 3px; }
            .scs-request-accept:hover { background: #3d8a4e; }
            .scs-request-decline { flex: 1; padding: 4px; font-size: 11px; cursor: pointer; background: #c44; color: #fff; border: none; border-radius: 3px; }
            .scs-request-decline:hover { background: #a33; }
            .scs-friend-courses { margin-top: 8px; border-top: 1px solid #eee; padding-top: 6px; }
            .scs-friend-courses.scs-friend-courses-hidden { display: none; }
            .scs-friend-course-item { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 11px; }
            .scs-friend-course-add { background: none; border: none; font-size: 16px; color: #5a7fa8; cursor: pointer; padding: 0 4px; line-height: 1; }
            .scs-friend-course-add:hover { color: #3d6a8f; }
        `;
        document.head.appendChild(style);
    }

    function showLoginView() {
        loginView.style.display = "";
        contentView.style.display = "none";
        userBar.style.display = "none";
    }

    function showContentView(user) {
        loginView.style.display = "none";
        contentView.style.display = "";
        userBar.style.display = "";
        userBar.querySelector(".scs-friends-user-email").textContent = user.email;
    }

    function buildModal() {
        overlay = document.createElement("div");
        overlay.id = "scs-friends-overlay";
        overlay.className = "scs-friends-hidden";

        modalEl = document.createElement("div");
        modalEl.id = "scs-friends-modal";

        // Header
        const header = document.createElement("div");
        header.className = "scs-friends-header";
        header.innerHTML = `
            <span class="scs-friends-title">Friends</span>
            <button class="scs-friends-close">&times;</button>
        `;
        modalEl.appendChild(header);

        // Login view (shown when not authenticated)
        loginView = document.createElement("div");
        loginView.className = "scs-friends-login";
        loginView.innerHTML = `
            <p>Sign in to connect with friends and see their courses</p>
            <button class="scs-friends-google-btn">Sign in with Google</button>
            <div class="scs-friends-login-error" style="display: none;"></div>
        `;
        modalEl.appendChild(loginView);

        // User bar (shown when authenticated)
        userBar = document.createElement("div");
        userBar.className = "scs-friends-user-bar";
        userBar.style.display = "none";
        userBar.innerHTML = `
            <span>Signed in as <strong class="scs-friends-user-email"></strong></span>
            <button class="scs-friends-logout">Sign out</button>
        `;
        modalEl.appendChild(userBar);

        // Content view (requests + friends, shown when authenticated)
        contentView = document.createElement("div");
        contentView.style.display = "none";

        // Requests section
        const requestsSection = document.createElement("div");
        requestsSection.className = "scs-friends-section";
        requestsSection.innerHTML = '<div class="scs-friends-section-title">Requests</div>';
        requestsGrid = document.createElement("div");
        requestsGrid.id = "scs-friends-requests";
        requestsGrid.className = "scs-friends-grid";
        requestsGrid.innerHTML = '<div class="scs-friends-empty">No pending requests</div>';
        requestsSection.appendChild(requestsGrid);
        contentView.appendChild(requestsSection);

        // Friends section
        const friendsSection = document.createElement("div");
        friendsSection.className = "scs-friends-section";
        friendsSection.innerHTML = '<div class="scs-friends-section-title">Friends</div>';
        friendsGrid = document.createElement("div");
        friendsGrid.id = "scs-friends-list";
        friendsGrid.className = "scs-friends-grid";
        friendsGrid.innerHTML = '<div class="scs-friends-empty">No friends added yet</div>';
        friendsSection.appendChild(friendsGrid);
        contentView.appendChild(friendsSection);

        modalEl.appendChild(contentView);
        overlay.appendChild(modalEl);

        // --- Event handlers ---

        // Close on backdrop click
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                overlay.classList.add("scs-friends-hidden");
            }
        });

        // Close on X button
        header.querySelector(".scs-friends-close").addEventListener("click", () => {
            overlay.classList.add("scs-friends-hidden");
        });

        // Close on Escape
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !overlay.classList.contains("scs-friends-hidden")) {
                overlay.classList.add("scs-friends-hidden");
            }
        });

        // Google sign-in
        loginView.querySelector(".scs-friends-google-btn").addEventListener("click", async () => {
            const btn = loginView.querySelector(".scs-friends-google-btn");
            const errorEl = loginView.querySelector(".scs-friends-login-error");
            btn.textContent = "Signing in...";
            btn.disabled = true;
            errorEl.style.display = "none";

            const result = await sendToBackground({ type: "SCS_AUTH_LOGIN" });
            if (result && result.loggedIn) {
                currentUser = result.user;
                showContentView(currentUser);
            } else {
                errorEl.textContent = result?.error || "Sign-in failed. Please try again.";
                errorEl.style.display = "";
            }
            btn.textContent = "Sign in with Google";
            btn.disabled = false;
        });

        // Sign out
        userBar.querySelector(".scs-friends-logout").addEventListener("click", async () => {
            await sendToBackground({ type: "SCS_AUTH_LOGOUT" });
            currentUser = null;
            showLoginView();
        });

        // Friend card dropdown toggle
        friendsGrid.addEventListener("click", (e) => {
            const cardHeader = e.target.closest(".scs-friend-card-header");
            if (cardHeader) {
                const card = cardHeader.closest(".scs-friend-card");
                card.classList.toggle("scs-friend-expanded");
                const courses = card.querySelector(".scs-friend-courses");
                if (courses) courses.classList.toggle("scs-friend-courses-hidden");
                return;
            }

            const addBtn = e.target.closest(".scs-friend-course-add");
            if (addBtn) {
                const courseName = addBtn.closest(".scs-friend-course-item").querySelector("span").textContent;
                console.log("[SCS Friends] Add course:", courseName);
            }
        });

        // Request accept/decline
        requestsGrid.addEventListener("click", (e) => {
            const acceptBtn = e.target.closest(".scs-request-accept");
            if (acceptBtn) {
                const name = acceptBtn.closest(".scs-friend-card").querySelector(".scs-friend-name").textContent;
                console.log("[SCS Friends] Accept request from:", name);
                return;
            }
            const declineBtn = e.target.closest(".scs-request-decline");
            if (declineBtn) {
                const name = declineBtn.closest(".scs-friend-card").querySelector(".scs-friend-name").textContent;
                console.log("[SCS Friends] Decline request from:", name);
            }
        });
    }

    return {
        init(container) {
            if (initialized) return;
            injectCSS();
            buildModal();
            (container || document.body).appendChild(overlay);
            initialized = true;
        },

        async open() {
            if (!initialized) return;
            overlay.classList.remove("scs-friends-hidden");

            // Check auth state
            const result = await sendToBackground({ type: "SCS_AUTH_CHECK" });
            if (result && result.loggedIn) {
                currentUser = result.user;
                showContentView(currentUser);
            } else {
                currentUser = null;
                showLoginView();
            }
        },

        close() {
            if (!initialized) return;
            overlay.classList.add("scs-friends-hidden");
        },

        setRequests(requests) {
            if (!requestsGrid) return;
            if (!requests || requests.length === 0) {
                requestsGrid.innerHTML = '<div class="scs-friends-empty">No pending requests</div>';
                return;
            }
            requestsGrid.innerHTML = requests.map(r => `
                <div class="scs-friend-card scs-request-card">
                    <div class="scs-friend-name">${r.name}</div>
                    <div class="scs-request-actions">
                        <button class="scs-request-accept">Accept</button>
                        <button class="scs-request-decline">Decline</button>
                    </div>
                </div>
            `).join("");
        },

        setFriends(friends) {
            if (!friendsGrid) return;
            if (!friends || friends.length === 0) {
                friendsGrid.innerHTML = '<div class="scs-friends-empty">No friends added yet</div>';
                return;
            }
            friendsGrid.innerHTML = friends.map(f => {
                const coursesHTML = (f.courses || []).map(c =>
                    `<div class="scs-friend-course-item"><span>${c}</span><button class="scs-friend-course-add" title="Add to slot">+</button></div>`
                ).join("");
                return `
                    <div class="scs-friend-card">
                        <div class="scs-friend-card-header">
                            <span class="scs-friend-name">${f.name}</span>
                            <span class="scs-friend-arrow">&#9662;</span>
                        </div>
                        <div class="scs-friend-courses scs-friend-courses-hidden">
                            ${coursesHTML || '<div style="font-size:11px;color:#888;font-style:italic;">No courses</div>'}
                        </div>
                    </div>
                `;
            }).join("");
        },

        getUser() {
            return currentUser;
        }
    };
})();
