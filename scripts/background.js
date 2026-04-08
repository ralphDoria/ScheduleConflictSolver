// Background service worker for ScheduleConflictSolver
// Handles Google OAuth via chrome.identity

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
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError || !token) {
                sendResponse({ loggedIn: false, error: chrome.runtime.lastError?.message || "Login cancelled" });
                return;
            }

            fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
                headers: { Authorization: "Bearer " + token }
            })
                .then(r => r.json())
                .then(info => {
                    const user = {
                        name: info.name || info.email,
                        email: info.email,
                        picture: info.picture || "",
                        token: token
                    };
                    chrome.storage.local.set({ scsUser: user }, () => {
                        sendResponse({ loggedIn: true, user });
                    });
                })
                .catch(err => {
                    sendResponse({ loggedIn: false, error: err.message });
                });
        });
        return true;
    }

    if (msg.type === "SCS_AUTH_LOGOUT") {
        chrome.storage.local.get("scsUser", (result) => {
            const token = result.scsUser?.token;
            if (token) {
                chrome.identity.removeCachedAuthToken({ token }, () => {
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
});
