const PAGE_MESSAGES = {
    GET_SCHEDULE_DATA: "GET_SCHEDULE_DATA",
    SYNC_CREATE_SCHEDULE: "SYNC_CREATE_SCHEDULE",
    SYNC_ADD_COURSE: "SYNC_ADD_COURSE",
    SYNC_REMOVE_SCHEDULE: "SYNC_REMOVE_SCHEDULE",
};

function requestFromPage(type, params) {
    return new Promise((resolve) => {
        const responseType = type + "_RESPONSE";
        function handler(event) {
            if (event.source !== window || event.data.type !== responseType) return;
            window.removeEventListener("message", handler);
            resolve(event.data.data);
        }
        window.addEventListener("message", handler);
        window.postMessage({ type, params });
    });
}
