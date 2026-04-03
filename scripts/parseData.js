// Parses the API response array for a single course slot into a structured
// object suitable for schedule combination algorithms.
//
// Input:  array of section objects from the host site API
// Output: {
//     subjectCode,
//     courseNums: {
//         [courseNum]: {
//             [seqNum]: { lectureGroup, meetings: [{ type, days, startTime, endTime }] }
//         }
//     }
// }

function parseCourseSlot(data) {
    if (!data || data.length === 0) return null;

    const subjectCode = data[0].course.subjectCode;
    const courseNums = {};

    for (const entry of data) {
        const courseNum = entry.course.courseNum;
        const seqNum = entry.course.seqNum;

        if (!courseNums[courseNum]) {
            courseNums[courseNum] = {};
        }

        const meetings = entry.meeting.map(m => ({
            type: m.type,
            days: m.daysString.split(""),
            startTime: parseInt(m.startTime),
            endTime: parseInt(m.endTime)
        }));

        const finalMeeting = parseFinalExam(entry.finalExam);
        if (finalMeeting) meetings.push(finalMeeting);

        courseNums[courseNum][seqNum] = {
            lectureGroup: extractLectureGroup(seqNum),
            meetings
        };
    }

    return { subjectCode, courseNums };
}

// Parses a finalExam object into a meeting.
// Input:  { examDate: "June, 05 2026 10:30:00" }
// Output: { type: "FINAL", days: ["2026-06-05"], startTime: 1030, endTime: 1230 }
const FINAL_DURATION_MINUTES = 120;

const MONTH_MAP = {
    "january": "01", "february": "02", "march": "03", "april": "04",
    "may": "05", "june": "06", "july": "07", "august": "08",
    "september": "09", "october": "10", "november": "11", "december": "12"
};

function parseFinalExam(finalExam) {
    if (!finalExam || !finalExam.examDate) return null;

    // Format: "June, 05 2026 10:30:00"
    const match = finalExam.examDate.match(/^(\w+),\s*(\d{2})\s+(\d{4})\s+(\d{1,2}):(\d{2}):\d{2}$/);
    if (!match) return null;

    const monthStr = match[1].toLowerCase();
    const day = match[2];
    const year = match[3];
    const hours = parseInt(match[4]);
    const minutes = parseInt(match[5]);

    const month = MONTH_MAP[monthStr];
    if (!month) return null;

    const dateStr = year + "-" + month + "-" + day;
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + FINAL_DURATION_MINUTES;

    const startTime = Math.floor(startMinutes / 60) * 100 + (startMinutes % 60);
    const endTime = Math.floor(endMinutes / 60) * 100 + (endMinutes % 60);

    return { type: "FINAL", days: [dateStr], startTime, endTime };
}

// Extracts the letter prefix from a sequence number, if any.
// "A01" -> "A", "B02" -> "B", "001" -> null
function extractLectureGroup(seqNum) {
    const match = seqNum.match(/^([A-Za-z]+)/);
    return match ? match[1] : null;
}

if (typeof module !== "undefined") {
    module.exports = { parseCourseSlot, extractLectureGroup, parseFinalExam };
}
