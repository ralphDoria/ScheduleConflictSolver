function flattenSingleSlot(slot) {
    const options = [];
    for (const [courseNum, seqNums] of Object.entries(slot.courseNums)) {
        for (const [seqNum, info] of Object.entries(seqNums)) {
            options.push({
                subjectCode: slot.subjectCode,
                courseNum,
                seqNum,
                lectureGroup: info.lectureGroup,
                meetings: info.meetings
            });
        }
    }
    return options;
}

function flattenSlot(slot) {
    if (Array.isArray(slot)) {
        return slot.flatMap(flattenSingleSlot);
    }
    return flattenSingleSlot(slot);
}

function meetingPairConflicts(a, b) {
    return a.days.some(d => b.days.includes(d))
        && a.startTime < b.endTime
        && b.startTime < a.endTime;
}

function meetingsConflict(meetingsA, meetingsB) {
    for (const a of meetingsA) {
        for (const b of meetingsB) {
            if (meetingPairConflicts(a, b)) return true;
        }
    }
    return false;
}

function createAllPossibleSchedules(courseSlots) {
    const slotOptions = courseSlots.map(flattenSlot);
    const results = [];

    function conflictsWithSelected(meetings, selected) {
        for (const entry of selected) {
            if (meetingsConflict(meetings, entry.meetings)) return true;
        }
        return false;
    }

    function backtrack(slotIndex, selected) {
        if (slotIndex === slotOptions.length) {
            results.push(selected.map(s => ({
                subjectCode: s.subjectCode,
                courseNum: s.courseNum,
                seqNum: s.seqNum
            })));
            return;
        }

        const options = slotOptions[slotIndex];
        const conflictedGroups = new Set();

        for (const option of options) {
            const groupKey = option.lectureGroup
                ? option.courseNum + ":" + option.lectureGroup
                : null;

            // Lecture group pruning
            if (groupKey) {
                if (conflictedGroups.has(groupKey)) continue;

                const lecMeetings = option.meetings.filter(m => m.type === "LEC");
                if (lecMeetings.length > 0 && conflictsWithSelected(lecMeetings, selected)) {
                    conflictedGroups.add(groupKey);
                    continue;
                }
            }

            // Full conflict check
            if (conflictsWithSelected(option.meetings, selected)) continue;

            selected.push(option);
            backtrack(slotIndex + 1, selected);
            selected.pop();
        }
    }

    backtrack(0, []);
    return results;
}

if (typeof module !== "undefined") {
    module.exports = { flattenSlot, flattenSingleSlot, meetingPairConflicts, meetingsConflict, createAllPossibleSchedules };
}
