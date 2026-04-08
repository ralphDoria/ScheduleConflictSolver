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
    let searchInput = null;
    let searchResults = null;
    let initialized = false;
    let currentUser = null;
    let currentFriendEmails = new Set();
    let pollTimer = null;

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(() => loadFriendsData(), 5000);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    // --- Search debounce & LRU cache ---
    let friendSearchTimer = null;
    const SEARCH_CACHE_MAX = 20;
    const searchCache = new Map();

    function cacheLookup(query) {
        const key = query.toLowerCase();
        if (!searchCache.has(key)) return null;
        const val = searchCache.get(key);
        searchCache.delete(key);
        searchCache.set(key, val);
        return val;
    }

    function cacheStore(query, data) {
        const key = query.toLowerCase();
        searchCache.delete(key);
        searchCache.set(key, data);
        if (searchCache.size > SEARCH_CACHE_MAX) {
            const firstKey = searchCache.keys().next().value;
            searchCache.delete(firstKey);
        }
    }

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
            .scs-friends-search-wrap { position: relative; padding: 12px 16px 4px; }
            .scs-friends-search-input { width: 100%; padding: 6px 8px; font-size: 12px; border: 1px solid #CCD4E0; border-radius: 4px; outline: none; box-sizing: border-box; }
            .scs-friends-search-input:focus { border-color: #5a7fa8; }
            .scs-friends-search-results { position: absolute; left: 16px; right: 16px; background: #fff; border: 1px solid #CCD4E0; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); max-height: 200px; overflow-y: auto; z-index: 10; display: none; }
            .scs-friends-search-item { padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f0f0f0; }
            .scs-friends-search-item:last-child { border-bottom: none; }
            .scs-friends-search-item-info { flex: 1; min-width: 0; }
            .scs-friends-search-item-name { font-weight: 600; font-size: 12px; }
            .scs-friends-search-item-email { font-size: 11px; color: #888; }
            .scs-friends-search-item-action { flex-shrink: 0; margin-left: 8px; }
            .scs-friends-add-friend-btn { background: none; border: 1px solid #5a7fa8; color: #5a7fa8; border-radius: 4px; padding: 3px 8px; font-size: 11px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
            .scs-friends-add-friend-btn:hover { background: #5a7fa8; color: #fff; }
            .scs-friends-add-friend-btn:disabled { opacity: 0.6; cursor: default; }
            .scs-friends-already-friend { font-size: 11px; color: #4a9e5c; font-style: italic; }
            .scs-friends-search-item-status { font-size: 11px; margin-left: 8px; flex-shrink: 0; }
            .scs-friends-search-item-status.scs-status-ok { color: #4a9e5c; }
            .scs-friends-search-item-status.scs-status-err { color: #c44; }
            .scs-friends-search-msg { font-size: 11px; padding: 8px 10px; color: #888; font-style: italic; }
            .scs-friends-confirm-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.35); z-index: 20; display: flex; align-items: center; justify-content: center; border-radius: inherit; }
            .scs-friends-confirm { background: #fff; border-radius: 6px; padding: 20px; width: 260px; box-shadow: 0 4px 16px rgba(0,0,0,0.25); text-align: center; font-size: 13px; }
            .scs-friends-confirm p { margin: 0 0 16px; color: #333; }
            .scs-friends-confirm-actions { display: flex; gap: 8px; justify-content: center; }
            .scs-friends-confirm-yes { padding: 6px 16px; font-size: 12px; cursor: pointer; background: #c44; color: #fff; border: none; border-radius: 4px; }
            .scs-friends-confirm-yes:hover { background: #a33; }
            .scs-friends-confirm-no { padding: 6px 16px; font-size: 12px; cursor: pointer; background: #fff; color: #333; border: 1px solid #CCD4E0; border-radius: 4px; }
            .scs-friends-confirm-no:hover { background: #f5f5f5; }
            .scs-friends-section { padding: 12px 16px; }
            .scs-friends-section-title { font-weight: bold; font-size: 13px; color: #555; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #eee; }
            .scs-friends-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .scs-friends-empty { grid-column: 1 / -1; text-align: center; color: #888; font-style: italic; padding: 10px; font-size: 12px; }
            .scs-friend-card { border: 1px solid #CCD4E0; border-radius: 6px; padding: 10px; background: #f9fafb; }
            .scs-friend-card-header { display: flex; align-items: center; cursor: pointer; }
            .scs-friend-unfriend { background: none; border: none; font-size: 13px; color: #c44; cursor: pointer; padding: 0 6px 0 0; line-height: 1; opacity: 0.6; }
            .scs-friend-unfriend:hover { opacity: 1; }
            .scs-friend-name { font-weight: 600; font-size: 12px; flex: 1; }
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

    async function loadFriendsData() {
        if (!currentUser) return;
        const [reqResult, friendResult] = await Promise.all([
            sendToBackground({ type: "SCS_GET_REQUESTS", email: currentUser.email }),
            sendToBackground({ type: "SCS_GET_FRIENDS", email: currentUser.email })
        ]);
        if (reqResult && reqResult.ok) {
            setRequests(reqResult.requests);
        }
        if (friendResult && friendResult.ok) {
            currentFriendEmails = new Set(friendResult.friends.map(f => f.email));
            setFriends(friendResult.friends);
        }
    }

    function setRequests(requests) {
        if (!requestsGrid) return;
        if (!requests || requests.length === 0) {
            requestsGrid.innerHTML = '<div class="scs-friends-empty">No pending requests</div>';
            return;
        }
        requestsGrid.innerHTML = requests.map(r => `
            <div class="scs-friend-card scs-request-card" data-email="${r.email || ""}">
                <div class="scs-friend-name">${r.name}</div>
                <div class="scs-request-actions">
                    <button class="scs-request-accept">Accept</button>
                    <button class="scs-request-decline">Decline</button>
                </div>
            </div>
        `).join("");
    }

    function setFriends(friends) {
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
                <div class="scs-friend-card" data-email="${f.email}">
                    <div class="scs-friend-card-header">
                        <button class="scs-friend-unfriend" title="Unfriend">&#10005;</button>
                        <span class="scs-friend-name">${f.name}</span>
                        <span class="scs-friend-arrow">&#9662;</span>
                    </div>
                    <div class="scs-friend-courses scs-friend-courses-hidden">
                        ${coursesHTML || '<div style="font-size:11px;color:#888;font-style:italic;">No courses</div>'}
                    </div>
                </div>
            `;
        }).join("");
    }

    // --- Friend search ---

    function hideSearchResults() {
        searchResults.style.display = "none";
    }

    function showSearchResults() {
        searchResults.style.display = "block";
    }

    function renderSearchResults(users) {
        if (!users || users.length === 0) {
            searchResults.innerHTML = '<div class="scs-friends-search-msg">No users found</div>';
            showSearchResults();
            return;
        }
        searchResults.innerHTML = users.map(u => {
            const isFriend = currentFriendEmails.has(u.email);
            const actionHTML = isFriend
                ? '<span class="scs-friends-already-friend">Friends</span>'
                : '<button class="scs-friends-add-friend-btn" title="Send friend request">&#43; Add</button>';
            return `
                <div class="scs-friends-search-item" data-email="${u.email}">
                    <div class="scs-friends-search-item-info">
                        <div class="scs-friends-search-item-name">${u.name}</div>
                        <div class="scs-friends-search-item-email">${u.email}</div>
                    </div>
                    <div class="scs-friends-search-item-action">${actionHTML}</div>
                </div>
            `;
        }).join("");
        showSearchResults();
    }

    async function doFriendSearch(query) {
        if (!query || query.length < 2) {
            hideSearchResults();
            return;
        }

        // Check cache
        const cached = cacheLookup(query);
        if (cached !== null) {
            renderSearchResults(cached);
            return;
        }

        // Show searching indicator
        searchResults.innerHTML = '<div class="scs-friends-search-msg">Searching...</div>';
        showSearchResults();

        const result = await sendToBackground({
            type: "SCS_SEARCH_USERS",
            query: query,
            excludeEmail: currentUser?.email
        });

        if (result && result.ok) {
            cacheStore(query, result.users);
            renderSearchResults(result.users);
        } else {
            searchResults.innerHTML = '<div class="scs-friends-search-msg">Search failed</div>';
            showSearchResults();
        }
    }

    function debounceFriendSearch() {
        if (friendSearchTimer) clearTimeout(friendSearchTimer);
        friendSearchTimer = setTimeout(() => {
            doFriendSearch(searchInput.value.trim());
        }, 400);
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

        // Login view
        loginView = document.createElement("div");
        loginView.className = "scs-friends-login";
        loginView.innerHTML = `
            <p>Sign in to connect with friends and see their courses</p>
            <button class="scs-friends-google-btn">Sign in with Google</button>
            <div class="scs-friends-login-error" style="display: none;"></div>
        `;
        modalEl.appendChild(loginView);

        // User bar
        userBar = document.createElement("div");
        userBar.className = "scs-friends-user-bar";
        userBar.style.display = "none";
        userBar.innerHTML = `
            <span>Signed in as <strong class="scs-friends-user-email"></strong></span>
            <button class="scs-friends-logout">Sign out</button>
        `;
        modalEl.appendChild(userBar);

        // Content view
        contentView = document.createElement("div");
        contentView.style.display = "none";

        // Search bar
        const searchWrap = document.createElement("div");
        searchWrap.className = "scs-friends-search-wrap";
        searchWrap.innerHTML = `
            <input type="text" placeholder="Search by name or email" class="scs-friends-search-input">
        `;
        searchResults = document.createElement("div");
        searchResults.className = "scs-friends-search-results";
        searchWrap.appendChild(searchResults);
        contentView.appendChild(searchWrap);
        searchInput = searchWrap.querySelector(".scs-friends-search-input");

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
                stopPolling();
                overlay.classList.add("scs-friends-hidden");
            }
        });

        // Close on X button
        header.querySelector(".scs-friends-close").addEventListener("click", () => {
            stopPolling();
            overlay.classList.add("scs-friends-hidden");
        });

        // Close on Escape
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !overlay.classList.contains("scs-friends-hidden")) {
                stopPolling();
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
                document.dispatchEvent(new CustomEvent("scs-friends-authenticated", { detail: { user: currentUser } }));
                loadFriendsData();
                startPolling();
            } else {
                errorEl.textContent = result?.error || "Sign-in failed. Please try again.";
                errorEl.style.display = "";
            }
            btn.textContent = "Sign in with Google";
            btn.disabled = false;
        });

        // Sign out
        userBar.querySelector(".scs-friends-logout").addEventListener("click", async () => {
            stopPolling();
            await sendToBackground({ type: "SCS_AUTH_LOGOUT" });
            currentUser = null;
            showLoginView();
        });

        // Friend search — debounced input
        searchInput.addEventListener("input", () => {
            if (searchInput.value.trim().length < 2) {
                hideSearchResults();
                if (friendSearchTimer) clearTimeout(friendSearchTimer);
                return;
            }
            debounceFriendSearch();
        });

        // Hide dropdown on blur (delay to allow click on result)
        searchInput.addEventListener("blur", () => {
            setTimeout(() => hideSearchResults(), 200);
        });

        // Re-show results on focus if there's text
        searchInput.addEventListener("focus", () => {
            if (searchInput.value.trim().length >= 2 && searchResults.children.length > 0) {
                showSearchResults();
            }
        });

        // Click add button in search results → send friend request
        searchResults.addEventListener("click", async (e) => {
            const addBtn = e.target.closest(".scs-friends-add-friend-btn");
            if (!addBtn) return;

            const item = addBtn.closest(".scs-friends-search-item");
            const toEmail = item.dataset.email;

            addBtn.disabled = true;
            addBtn.textContent = "Sending...";

            const result = await sendToBackground({
                type: "SCS_SEND_FRIEND_REQUEST",
                fromEmail: currentUser.email,
                toEmail: toEmail
            });

            const actionDiv = item.querySelector(".scs-friends-search-item-action");
            if (result && result.ok) {
                actionDiv.innerHTML = '<span class="scs-friends-search-item-status scs-status-ok">Request sent!</span>';
            } else {
                actionDiv.innerHTML = `<span class="scs-friends-search-item-status scs-status-err">${result?.error || "Failed"}</span>`;
            }
        });

        // Friend card interactions: unfriend, dropdown toggle, course add
        friendsGrid.addEventListener("click", async (e) => {
            // Unfriend button — show confirmation
            const unfriendBtn = e.target.closest(".scs-friend-unfriend");
            if (unfriendBtn) {
                e.stopPropagation();
                const card = unfriendBtn.closest(".scs-friend-card");
                const friendEmail = card.dataset.email;
                const friendName = card.querySelector(".scs-friend-name").textContent;

                const confirmOverlay = document.createElement("div");
                confirmOverlay.className = "scs-friends-confirm-overlay";
                confirmOverlay.innerHTML = `
                    <div class="scs-friends-confirm">
                        <p>Unfriend <strong>${friendName}</strong>?</p>
                        <div class="scs-friends-confirm-actions">
                            <button class="scs-friends-confirm-no">Cancel</button>
                            <button class="scs-friends-confirm-yes">Unfriend</button>
                        </div>
                    </div>
                `;
                modalEl.appendChild(confirmOverlay);

                confirmOverlay.querySelector(".scs-friends-confirm-no").addEventListener("click", () => {
                    confirmOverlay.remove();
                });

                confirmOverlay.querySelector(".scs-friends-confirm-yes").addEventListener("click", async () => {
                    confirmOverlay.querySelector(".scs-friends-confirm-yes").disabled = true;
                    confirmOverlay.querySelector(".scs-friends-confirm-yes").textContent = "Removing...";
                    await sendToBackground({
                        type: "SCS_REMOVE_FRIEND",
                        email: currentUser.email,
                        friendEmail: friendEmail
                    });
                    currentFriendEmails.delete(friendEmail);
                    card.remove();
                    confirmOverlay.remove();
                    if (friendsGrid.children.length === 0) {
                        friendsGrid.innerHTML = '<div class="scs-friends-empty">No friends added yet</div>';
                    }
                });

                return;
            }

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
                document.dispatchEvent(new CustomEvent("scs-add-course-to-slot", { detail: { courseName } }));
            }
        });

        // Request accept/decline
        requestsGrid.addEventListener("click", async (e) => {
            const acceptBtn = e.target.closest(".scs-request-accept");
            if (acceptBtn) {
                const card = acceptBtn.closest(".scs-friend-card");
                const fromEmail = card.dataset.email;
                acceptBtn.disabled = true;
                await sendToBackground({
                    type: "SCS_RESPOND_REQUEST",
                    fromEmail: fromEmail,
                    toEmail: currentUser.email,
                    accept: true
                });
                card.remove();
                if (requestsGrid.children.length === 0) {
                    requestsGrid.innerHTML = '<div class="scs-friends-empty">No pending requests</div>';
                }
                loadFriendsData();
                return;
            }
            const declineBtn = e.target.closest(".scs-request-decline");
            if (declineBtn) {
                const card = declineBtn.closest(".scs-friend-card");
                const fromEmail = card.dataset.email;
                declineBtn.disabled = true;
                await sendToBackground({
                    type: "SCS_RESPOND_REQUEST",
                    fromEmail: fromEmail,
                    toEmail: currentUser.email,
                    accept: false
                });
                card.remove();
                if (requestsGrid.children.length === 0) {
                    requestsGrid.innerHTML = '<div class="scs-friends-empty">No pending requests</div>';
                }
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
                document.dispatchEvent(new CustomEvent("scs-friends-authenticated", { detail: { user: currentUser } }));
                loadFriendsData();
                startPolling();
            } else {
                currentUser = null;
                showLoginView();
            }
        },

        close() {
            if (!initialized) return;
            stopPolling();
            overlay.classList.add("scs-friends-hidden");
        },

        getUser() {
            return currentUser;
        }
    };
})();
