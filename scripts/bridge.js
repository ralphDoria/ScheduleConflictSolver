window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data.type === "GET_SCHEDULE_DATA") {
        window.postMessage({
            type: "GET_SCHEDULE_DATA_RESPONSE",
            data: { schedules: window.Schedules, currentScheduleName: window.ThisScheduleName }
        });
    }
});
