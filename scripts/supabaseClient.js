// Supabase REST API helper for ScheduleConflictSolver
// Loaded via importScripts in background.js

const SUPABASE_URL = "https://qfbfwukccesajdrsjako.supabase.co";
const SUPABASE_KEY = "sb_publishable_M6Bz3qoglk8hWTm6Kq5IOA_nVvbj82y";

async function supabaseRest(path, { method = "GET", body = null, headers = {} } = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${path}`;
    const res = await fetch(url, {
        method,
        headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            ...headers
        },
        body: body ? JSON.stringify(body) : null
    });
    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
}

async function upsertUser(email, name, picture) {
    return supabaseRest("users", {
        method: "POST",
        body: { email, name, picture: picture || "" },
        headers: {
            "Prefer": "resolution=merge-duplicates,return=representation"
        }
    });
}

async function checkUserExists(email) {
    const data = await supabaseRest(`users?email=eq.${encodeURIComponent(email)}&select=email`);
    return data && data.length > 0;
}

async function syncCourses(email, courseNames) {
    // Delete existing courses
    await supabaseRest(`user_courses?user_email=eq.${encodeURIComponent(email)}`, {
        method: "DELETE"
    });
    // Insert new courses
    if (courseNames.length > 0) {
        const rows = courseNames.map(c => ({ user_email: email, course_name: c }));
        await supabaseRest("user_courses", {
            method: "POST",
            body: rows,
            headers: { "Prefer": "return=representation" }
        });
    }
}

async function sendFriendRequest(fromEmail, toEmail) {
    try {
        await supabaseRest("friend_requests", {
            method: "POST",
            body: { from_email: fromEmail, to_email: toEmail, status: "pending" },
            headers: { "Prefer": "return=representation" }
        });
        return { ok: true };
    } catch (err) {
        if (err.message && err.message.includes("duplicate")) {
            // Check if previously declined — if so, reset to pending
            const existing = await supabaseRest(
                `friend_requests?from_email=eq.${encodeURIComponent(fromEmail)}&to_email=eq.${encodeURIComponent(toEmail)}&select=status`
            );
            if (existing && existing.length > 0 && existing[0].status === "declined") {
                await supabaseRest(
                    `friend_requests?from_email=eq.${encodeURIComponent(fromEmail)}&to_email=eq.${encodeURIComponent(toEmail)}`,
                    {
                        method: "PATCH",
                        body: { status: "pending" },
                        headers: { "Prefer": "return=representation" }
                    }
                );
                return { ok: true };
            }
            return { ok: false, error: "Request already sent" };
        }
        throw err;
    }
}

async function getPendingRequests(email) {
    // Get pending requests sent TO this user, with sender info
    const requests = await supabaseRest(
        `friend_requests?to_email=eq.${encodeURIComponent(email)}&status=eq.pending&select=from_email,users!friend_requests_from_email_fkey(name,email)`
    );
    return (requests || []).map(r => ({
        name: r.users?.name || r.from_email,
        email: r.from_email
    }));
}

async function respondToRequest(fromEmail, toEmail, accept) {
    await supabaseRest(
        `friend_requests?from_email=eq.${encodeURIComponent(fromEmail)}&to_email=eq.${encodeURIComponent(toEmail)}`,
        {
            method: "PATCH",
            body: { status: accept ? "accepted" : "declined" },
            headers: { "Prefer": "return=representation" }
        }
    );
}

async function searchUsers(query, excludeEmail) {
    const encoded = encodeURIComponent(`*${query}*`);
    const excludeParam = excludeEmail ? `&email=neq.${encodeURIComponent(excludeEmail)}` : "";
    return supabaseRest(
        `users?or=(name.ilike.${encoded},email.ilike.${encoded})${excludeParam}&limit=5&select=name,email`
    );
}

async function removeFriend(email, friendEmail) {
    // Delete the accepted request in either direction
    await Promise.all([
        supabaseRest(
            `friend_requests?from_email=eq.${encodeURIComponent(email)}&to_email=eq.${encodeURIComponent(friendEmail)}&status=eq.accepted`,
            { method: "DELETE" }
        ),
        supabaseRest(
            `friend_requests?from_email=eq.${encodeURIComponent(friendEmail)}&to_email=eq.${encodeURIComponent(email)}&status=eq.accepted`,
            { method: "DELETE" }
        )
    ]);
}

async function getFriends(email) {
    // Get all accepted requests where user is either side
    const [asSender, asReceiver] = await Promise.all([
        supabaseRest(`friend_requests?from_email=eq.${encodeURIComponent(email)}&status=eq.accepted&select=to_email`),
        supabaseRest(`friend_requests?to_email=eq.${encodeURIComponent(email)}&status=eq.accepted&select=from_email`)
    ]);

    const friendEmails = [
        ...(asSender || []).map(r => r.to_email),
        ...(asReceiver || []).map(r => r.from_email)
    ];

    if (friendEmails.length === 0) return [];

    // Fetch friend info and courses in parallel
    const friends = await Promise.all(friendEmails.map(async (friendEmail) => {
        const [userInfo, courses] = await Promise.all([
            supabaseRest(`users?email=eq.${encodeURIComponent(friendEmail)}&select=name,email`),
            supabaseRest(`user_courses?user_email=eq.${encodeURIComponent(friendEmail)}&select=course_name`)
        ]);
        const user = userInfo?.[0] || { name: friendEmail, email: friendEmail };
        return {
            name: user.name,
            email: user.email,
            courses: (courses || []).map(c => c.course_name)
        };
    }));

    return friends;
}
