console.log("InjectedJS: attaching event listener");
window.addEventListener("message", (event) => {
    console.log("InjectedJS: Received a message");
    if (event.source !== window || event.data.type !== "GET_SCHEDULES") return;
    console.log("InjectedJS: Attemtping to send back SCHEDULES_REQUEST message");
    window.postMessage({ type: "SCHEDULES_REQUEST", data: window.Schedules });
});