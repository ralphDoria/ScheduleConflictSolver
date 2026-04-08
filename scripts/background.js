// Background service worker for ScheduleConflictSolver
// Handles Google OAuth and Supabase API calls

importScripts("supabaseClient.js");

const CLIENT_ID = "8666715098-tia8b1vo55dnjvf3i0ekpu1ec6l1c5tl.apps.googleusercontent.com";
const REDIRECT_URL = chrome.identity.getRedirectURL();
const SCOPES = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
];

function buildAuthURL() {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URL,
        response_type: "token",
        scope: SCOPES.join(" "),
        prompt: "consent"
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SCS_AUTH_CHECK") {
        chrome.storage.local.get("scsUser", (result) => {
            if (result.scsUser) {
                sendResponse({ loggedIn: true, user: result.scsUser });
            } else {
                sendResponse({ loggedIn: false });
            }
        });
        return true;
    }

    if (msg.type === "SCS_AUTH_LOGIN") {
        chrome.identity.launchWebAuthFlow({ url: buildAuthURL(), interactive: true })
            .then((responseUrl) => {
                const url = new URL(responseUrl);
                const hash = url.hash.substring(1);
                const params = new URLSearchParams(hash);
                const accessToken = params.get("access_token");

                if (!accessToken) {
                    sendResponse({ loggedIn: false, error: "No access token received" });
                    return;
                }

                return fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
                    headers: { Authorization: "Bearer " + accessToken }
                })
                    .then(r => r.json())
                    .then(async (info) => {
                        const user = {
                            name: info.name || info.email,
                            email: info.email,
                            picture: info.picture || "",
                            token: accessToken
                        };
                        // Upsert user in Supabase
                        try {
                            await upsertUser(user.email, user.name, user.picture);
                        } catch (e) {
                            console.warn("[SCS] Failed to upsert user:", e);
                        }
                        chrome.storage.local.set({ scsUser: user }, () => {
                            sendResponse({ loggedIn: true, user });
                        });
                    });
            })
            .catch(err => {
                sendResponse({ loggedIn: false, error: err.message || "Login cancelled" });
            });
        return true;
    }

    if (msg.type === "SCS_AUTH_LOGOUT") {
        chrome.storage.local.get("scsUser", (result) => {
            const token = result.scsUser?.token;
            if (token) {
                fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
                    .finally(() => {
                        chrome.storage.local.remove("scsUser", () => {
                            sendResponse({ loggedIn: false });
                        });
                    });
            } else {
                chrome.storage.local.remove("scsUser", () => {
                    sendResponse({ loggedIn: false });
                });
            }
        });
        return true;
    }

    if (msg.type === "SCS_SYNC_COURSES") {
        syncCourses(msg.email, msg.courses)
            .then(() => sendResponse({ ok: true }))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    if (msg.type === "SCS_SEND_FRIEND_REQUEST") {
        (async () => {
            try {
                if (msg.fromEmail === msg.toEmail) {
                    sendResponse({ ok: false, error: "Can't add yourself" });
                    return;
                }
                const exists = await checkUserExists(msg.toEmail);
                if (!exists) {
                    sendResponse({ ok: false, error: "User not found" });
                    return;
                }
                const result = await sendFriendRequest(msg.fromEmail, msg.toEmail);
                sendResponse(result);
            } catch (err) {
                sendResponse({ ok: false, error: err.message });
            }
        })();
        return true;
    }

    if (msg.type === "SCS_GET_REQUESTS") {
        getPendingRequests(msg.email)
            .then(requests => sendResponse({ ok: true, requests }))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    if (msg.type === "SCS_RESPOND_REQUEST") {
        respondToRequest(msg.fromEmail, msg.toEmail, msg.accept)
            .then(() => sendResponse({ ok: true }))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    if (msg.type === "SCS_SEARCH_USERS") {
        searchUsers(msg.query, msg.excludeEmail)
            .then(users => sendResponse({ ok: true, users: users || [] }))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    if (msg.type === "SCS_REMOVE_FRIEND") {
        removeFriend(msg.email, msg.friendEmail)
            .then(() => sendResponse({ ok: true }))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    if (msg.type === "SCS_GET_FRIENDS") {
        getFriends(msg.email)
            .then(friends => sendResponse({ ok: true, friends }))
            .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
    }
});
