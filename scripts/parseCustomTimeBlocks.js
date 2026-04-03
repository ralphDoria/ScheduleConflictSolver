// Reads all custom timeblock entries from the DOM and converts them
// into meeting objects usable by the schedule algorithm.
//
// Output: [{ type: "TIMEBLOCK", days: ["M", "W"], startTime: 1300, endTime: 1400 }, ...]

function parseCustomTimeBlocks() {
    const entries = document.querySelectorAll("#scs-tb-entries .scs-tb-entry");
    const timeblocks = [];

    entries.forEach(entry => {
        const days = Array.from(entry.querySelectorAll(".scs-tb-day.scs-tb-day-active"))
            .map(d => d.dataset.day);

        if (days.length === 0) return;

        const timeGroups = entry.querySelectorAll(".scs-tb-time-group");
        const times = Array.from(timeGroups).map(g => {
            const h = parseInt(g.querySelector(".scs-tb-hour").value) || 12;
            const m = parseInt(g.querySelector(".scs-tb-min").value) || 0;
            const ampm = g.querySelector(".scs-tb-ampm-active").dataset.val;
            return to24Hour(h, m, ampm);
        });

        if (times.length < 2) return;

        timeblocks.push({
            type: "TIMEBLOCK",
            days: days,
            startTime: times[0],
            endTime: times[1]
        });
    });

    return timeblocks;
}

// Converts 12-hour time to military integer.
// to24Hour(12, 0, "AM") -> 0
// to24Hour(12, 30, "PM") -> 1230
// to24Hour(1, 0, "PM") -> 1300
// to24Hour(11, 59, "AM") -> 1159
function to24Hour(hour, minute, ampm) {
    let h = hour;
    if (ampm === "AM" && h === 12) h = 0;
    else if (ampm === "PM" && h !== 12) h += 12;
    return h * 100 + minute;
}

if (typeof module !== "undefined") {
    module.exports = { parseCustomTimeBlocks, to24Hour };
}
