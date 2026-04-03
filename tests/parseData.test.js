const { parseCourseSlot, extractLectureGroup } = require("../scripts/parseData");

describe("extractLectureGroup", () => {
    test("extracts letter prefix from sequence number", () => {
        expect(extractLectureGroup("A01")).toBe("A");
        expect(extractLectureGroup("B02")).toBe("B");
    });

    test("returns null for numeric-only sequence numbers", () => {
        expect(extractLectureGroup("001")).toBeNull();
        expect(extractLectureGroup("123")).toBeNull();
    });

    test("handles multi-letter prefixes", () => {
        expect(extractLectureGroup("AB01")).toBe("AB");
    });
});

describe("parseCourseSlot", () => {
    test("returns null for empty or null input", () => {
        expect(parseCourseSlot(null)).toBeNull();
        expect(parseCourseSlot([])).toBeNull();
    });

    test("parses a single section correctly", () => {
        const data = [
            {
                course: { subjectCode: "ECS", courseNum: "036B", seqNum: "001" },
                meeting: [
                    { type: "LEC", daysString: "MWF", startTime: "1410", endTime: "1500" },
                    { type: "DIS", daysString: "F", startTime: "1510", endTime: "1600" }
                ]
            }
        ];

        const result = parseCourseSlot(data);

        expect(result.subjectCode).toBe("ECS");
        expect(result.courseNums["036B"]["001"]).toEqual({
            lectureGroup: null,
            meetings: [
                { type: "LEC", days: ["M", "W", "F"], startTime: 1410, endTime: 1500 },
                { type: "DIS", days: ["F"], startTime: 1510, endTime: 1600 }
            ]
        });
    });

    test("groups multiple sections under the same course number", () => {
        const data = [
            {
                course: { subjectCode: "PHY", courseNum: "009B", seqNum: "A01" },
                meeting: [
                    { type: "LEC", daysString: "TR", startTime: "1030", endTime: "1150" },
                    { type: "DIS", daysString: "R", startTime: "1610", endTime: "1700" }
                ]
            },
            {
                course: { subjectCode: "PHY", courseNum: "009B", seqNum: "A02" },
                meeting: [
                    { type: "LEC", daysString: "TR", startTime: "1030", endTime: "1150" },
                    { type: "DIS", daysString: "R", startTime: "1810", endTime: "1900" }
                ]
            }
        ];

        const result = parseCourseSlot(data);

        expect(result.subjectCode).toBe("PHY");
        expect(Object.keys(result.courseNums["009B"])).toEqual(["A01", "A02"]);
        expect(result.courseNums["009B"]["A01"].lectureGroup).toBe("A");
        expect(result.courseNums["009B"]["A02"].lectureGroup).toBe("A");
    });

    test("handles multiple course numbers within one subject", () => {
        const data = [
            {
                course: { subjectCode: "ECS", courseNum: "036B", seqNum: "001" },
                meeting: [
                    { type: "LEC", daysString: "MWF", startTime: "1410", endTime: "1500" }
                ]
            },
            {
                course: { subjectCode: "ECS", courseNum: "036C", seqNum: "001" },
                meeting: [
                    { type: "LEC", daysString: "TR", startTime: "0900", endTime: "1020" }
                ]
            }
        ];

        const result = parseCourseSlot(data);

        expect(result.subjectCode).toBe("ECS");
        expect(Object.keys(result.courseNums)).toEqual(["036B", "036C"]);
    });

    test("parses days string into character array", () => {
        const data = [
            {
                course: { subjectCode: "ECS", courseNum: "036B", seqNum: "001" },
                meeting: [
                    { type: "LEC", daysString: "TR", startTime: "1000", endTime: "1100" }
                ]
            }
        ];

        const result = parseCourseSlot(data);
        expect(result.courseNums["036B"]["001"].meetings[0].days).toEqual(["T", "R"]);
    });

    test("parses time strings into integers", () => {
        const data = [
            {
                course: { subjectCode: "ECS", courseNum: "036B", seqNum: "001" },
                meeting: [
                    { type: "LEC", daysString: "M", startTime: "0800", endTime: "0920" }
                ]
            }
        ];

        const result = parseCourseSlot(data);
        const meeting = result.courseNums["036B"]["001"].meetings[0];
        expect(meeting.startTime).toBe(800);
        expect(meeting.endTime).toBe(920);
    });
});
