const { to24Hour } = require("../scripts/parseCustomTimeBlocks");

describe("to24Hour", () => {
    test("converts 12:00 AM to 0", () => {
        expect(to24Hour(12, 0, "AM")).toBe(0);
    });

    test("converts 12:30 AM to 30", () => {
        expect(to24Hour(12, 30, "AM")).toBe(30);
    });

    test("converts 12:00 PM to 1200", () => {
        expect(to24Hour(12, 0, "PM")).toBe(1200);
    });

    test("converts 12:30 PM to 1230", () => {
        expect(to24Hour(12, 30, "PM")).toBe(1230);
    });

    test("converts 1:00 PM to 1300", () => {
        expect(to24Hour(1, 0, "PM")).toBe(1300);
    });

    test("converts 11:59 AM to 1159", () => {
        expect(to24Hour(11, 59, "AM")).toBe(1159);
    });

    test("converts 11:59 PM to 2359", () => {
        expect(to24Hour(11, 59, "PM")).toBe(2359);
    });

    test("converts 1:00 AM to 100", () => {
        expect(to24Hour(1, 0, "AM")).toBe(100);
    });
});
