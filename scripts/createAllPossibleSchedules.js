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

function conflictsWithTimeblocks(meetings, timeblocks) {
    for (const meeting of meetings) {
        for (const tb of timeblocks) {
            if (meetingPairConflicts(meeting, tb)) return true;
        }
    }
    return false;
}

function createAllPossibleSchedules(courseSlots, timeblocks) {
    if (!timeblocks) timeblocks = [];
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
                seqNum: s.seqNum,
                meetings: s.meetings
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
                if (lecMeetings.length > 0) {
                    if (conflictsWithTimeblocks(lecMeetings, timeblocks) || conflictsWithSelected(lecMeetings, selected)) {
                        conflictedGroups.add(groupKey);
                        continue;
                    }
                }
            }

            // Timeblock conflict check
            if (conflictsWithTimeblocks(option.meetings, timeblocks)) continue;

            // Full conflict check against selected
            if (conflictsWithSelected(option.meetings, selected)) continue;

            selected.push(option);
            backtrack(slotIndex + 1, selected);
            selected.pop();
        }
    }

    backtrack(0, []);
    return results;
}

const SCS_MAX_COMBINATIONS = 500;

function createAllCombinations(courseSlots) {
    const slotOptions = courseSlots.map(flattenSlot);
    const results = [];

    function backtrack(slotIndex, selected) {
        if (results.length >= SCS_MAX_COMBINATIONS) return;
        if (slotIndex === slotOptions.length) {
            results.push(selected.map(s => ({
                subjectCode: s.subjectCode,
                courseNum: s.courseNum,
                seqNum: s.seqNum,
                meetings: s.meetings
            })));
            return;
        }

        for (const option of slotOptions[slotIndex]) {
            if (results.length >= SCS_MAX_COMBINATIONS) return;
            selected.push(option);
            backtrack(slotIndex + 1, selected);
            selected.pop();
        }
    }

    backtrack(0, []);
    return results;
}

if (typeof module !== "undefined") {
    module.exports = { flattenSlot, flattenSingleSlot, meetingPairConflicts, meetingsConflict, conflictsWithTimeblocks, createAllPossibleSchedules, createAllCombinations };
}
