function getTermCode() {
    return new URL(window.location.href).searchParams.get("termCode");
}

if (typeof module !== "undefined") {
    module.exports = { getTermCode };
}
