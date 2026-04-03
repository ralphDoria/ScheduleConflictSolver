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

        courseNums[courseNum][seqNum] = {
            lectureGroup: extractLectureGroup(seqNum),
            meetings: entry.meeting.map(m => ({
                type: m.type,
                days: m.daysString.split(""),
                startTime: parseInt(m.startTime),
                endTime: parseInt(m.endTime)
            }))
        };
    }

    return { subjectCode, courseNums };
}

// Extracts the letter prefix from a sequence number, if any.
// "A01" -> "A", "B02" -> "B", "001" -> null
function extractLectureGroup(seqNum) {
    const match = seqNum.match(/^([A-Za-z]+)/);
    return match ? match[1] : null;
}
