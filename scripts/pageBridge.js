const PAGE_MESSAGES = {
    GET_SCHEDULE_DATA: "GET_SCHEDULE_DATA",
};

const PAGE_RESPONSES = {
    GET_SCHEDULE_DATA: "GET_SCHEDULE_DATA_RESPONSE",
};

function requestFromPage(type) {
    return new Promise((resolve) => {
        const responseType = type + "_RESPONSE";
        function handler(event) {
            if (event.source !== window || event.data.type !== responseType) return;
            window.removeEventListener("message", handler);
            resolve(event.data.data);
        }
        window.addEventListener("message", handler);
        window.postMessage({ type });
    });
}
