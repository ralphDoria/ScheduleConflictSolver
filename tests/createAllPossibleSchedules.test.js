const {
    flattenSlot,
    meetingPairConflicts,
    meetingsConflict,
    createAllPossibleSchedules
} = require("../scripts/createAllPossibleSchedules");

// Helper to build a course slot in the parsed format
function makeSlot(subjectCode, courseNums) {
    return { subjectCode, courseNums };
}

function makeSection(lectureGroup, meetings) {
    return { lectureGroup, meetings };
}

function makeMeeting(type, days, startTime, endTime) {
    return { type, days, startTime, endTime };
}

describe("meetingPairConflicts", () => {
    test("returns true for overlapping times on the same day", () => {
        const a = makeMeeting("LEC", ["M"], 1000, 1100);
        const b = makeMeeting("LEC", ["M"], 1030, 1130);
        expect(meetingPairConflicts(a, b)).toBe(true);
    });

    test("returns false for non-overlapping times on the same day", () => {
        const a = makeMeeting("LEC", ["M"], 1000, 1100);
        const b = makeMeeting("LEC", ["M"], 1100, 1200);
        expect(meetingPairConflicts(a, b)).toBe(false);
    });

    test("returns false for overlapping times on different days", () => {
        const a = makeMeeting("LEC", ["M"], 1000, 1100);
        const b = makeMeeting("LEC", ["T"], 1000, 1100);
        expect(meetingPairConflicts(a, b)).toBe(false);
    });

    test("detects conflict when one meeting contains another", () => {
        const a = makeMeeting("LEC", ["W"], 900, 1200);
        const b = makeMeeting("DIS", ["W"], 1000, 1100);
        expect(meetingPairConflicts(a, b)).toBe(true);
    });

    test("detects conflict across shared days in multi-day meetings", () => {
        const a = makeMeeting("LEC", ["M", "W", "F"], 1000, 1100);
        const b = makeMeeting("DIS", ["W"], 1030, 1130);
        expect(meetingPairConflicts(a, b)).toBe(true);
    });
});

describe("meetingsConflict", () => {
    test("returns true if any pair conflicts", () => {
        const meetingsA = [
            makeMeeting("LEC", ["M", "W"], 1000, 1100),
            makeMeeting("DIS", ["F"], 1400, 1500)
        ];
        const meetingsB = [
            makeMeeting("LEC", ["T", "R"], 900, 1000),
            makeMeeting("DIS", ["W"], 1030, 1130)
        ];
        expect(meetingsConflict(meetingsA, meetingsB)).toBe(true);
    });

    test("returns false if no pairs conflict", () => {
        const meetingsA = [
            makeMeeting("LEC", ["M", "W"], 1000, 1100)
        ];
        const meetingsB = [
            makeMeeting("LEC", ["T", "R"], 1000, 1100)
        ];
        expect(meetingsConflict(meetingsA, meetingsB)).toBe(false);
    });
});

describe("flattenSlot", () => {
    test("flattens a slot with one course number and multiple sections", () => {
        const slot = makeSlot("ECS", {
            "036B": {
                "A01": makeSection("A", [makeMeeting("LEC", ["M"], 1000, 1100)]),
                "A02": makeSection("A", [makeMeeting("LEC", ["M"], 1000, 1100)])
            }
        });

        const options = flattenSlot(slot);
        expect(options).toHaveLength(2);
        expect(options[0].subjectCode).toBe("ECS");
        expect(options[0].courseNum).toBe("036B");
        expect(options[0].seqNum).toBe("A01");
        expect(options[1].seqNum).toBe("A02");
    });

    test("flattens a slot with multiple course numbers", () => {
        const slot = makeSlot("ECS", {
            "036B": {
                "001": makeSection(null, [makeMeeting("LEC", ["M"], 1000, 1100)])
            },
            "036C": {
                "001": makeSection(null, [makeMeeting("LEC", ["T"], 1000, 1100)])
            }
        });

        const options = flattenSlot(slot);
        expect(options).toHaveLength(2);
        expect(options.map(o => o.courseNum)).toEqual(["036B", "036C"]);
    });
});

describe("createAllPossibleSchedules", () => {
    test("returns all combinations when nothing conflicts", () => {
        const slots = [
            makeSlot("ECS", {
                "036B": {
                    "001": makeSection(null, [makeMeeting("LEC", ["M", "W", "F"], 800, 900)])
                }
            }),
            makeSlot("PHY", {
                "009B": {
                    "A01": makeSection("A", [makeMeeting("LEC", ["T", "R"], 1000, 1100)]),
                    "A02": makeSection("A", [makeMeeting("LEC", ["T", "R"], 1000, 1100)])
                }
            })
        ];

        const results = createAllPossibleSchedules(slots);
        expect(results).toHaveLength(2);
        expect(results[0]).toEqual([
            { subjectCode: "ECS", courseNum: "036B", seqNum: "001" },
            { subjectCode: "PHY", courseNum: "009B", seqNum: "A01" }
        ]);
        expect(results[1]).toEqual([
            { subjectCode: "ECS", courseNum: "036B", seqNum: "001" },
            { subjectCode: "PHY", courseNum: "009B", seqNum: "A02" }
        ]);
    });

    test("excludes combinations with conflicts", () => {
        const slots = [
            makeSlot("ECS", {
                "036B": {
                    "001": makeSection(null, [makeMeeting("LEC", ["M", "W"], 1000, 1100)])
                }
            }),
            makeSlot("PHY", {
                "009B": {
                    "A01": makeSection("A", [
                        makeMeeting("LEC", ["T", "R"], 900, 1000),
                        makeMeeting("DIS", ["M"], 1030, 1130) // conflicts with ECS LEC
                    ]),
                    "B01": makeSection("B", [
                        makeMeeting("LEC", ["T", "R"], 1400, 1500),
                        makeMeeting("DIS", ["F"], 1400, 1500) // no conflict
                    ])
                }
            })
        ];

        const results = createAllPossibleSchedules(slots);
        expect(results).toHaveLength(1);
        expect(results[0][1].seqNum).toBe("B01");
    });

    test("returns empty array when all combinations conflict", () => {
        const slots = [
            makeSlot("ECS", {
                "036B": {
                    "001": makeSection(null, [makeMeeting("LEC", ["M"], 1000, 1100)])
                }
            }),
            makeSlot("PHY", {
                "009B": {
                    "001": makeSection(null, [makeMeeting("LEC", ["M"], 1000, 1100)])
                }
            })
        ];

        const results = createAllPossibleSchedules(slots);
        expect(results).toHaveLength(0);
    });

    test("handles single course slot", () => {
        const slots = [
            makeSlot("ECS", {
                "036B": {
                    "001": makeSection(null, [makeMeeting("LEC", ["M"], 1000, 1100)]),
                    "002": makeSection(null, [makeMeeting("LEC", ["T"], 1000, 1100)])
                }
            })
        ];

        const results = createAllPossibleSchedules(slots);
        expect(results).toHaveLength(2);
    });

    test("lecture group pruning skips sections sharing a conflicting lecture", () => {
        // Slot 1: ECS on Monday 10-11
        // Slot 2: PHY group A lectures on Monday 10-11 (conflicts), group B on Tuesday
        // A01 and A02 share the same conflicting lecture — both should be pruned
        const slots = [
            makeSlot("ECS", {
                "036B": {
                    "001": makeSection(null, [makeMeeting("LEC", ["M"], 1000, 1100)])
                }
            }),
            makeSlot("PHY", {
                "009B": {
                    "A01": makeSection("A", [
                        makeMeeting("LEC", ["M"], 1000, 1100),
                        makeMeeting("DIS", ["W"], 1400, 1500)
                    ]),
                    "A02": makeSection("A", [
                        makeMeeting("LEC", ["M"], 1000, 1100),
                        makeMeeting("DIS", ["R"], 1400, 1500)
                    ]),
                    "B01": makeSection("B", [
                        makeMeeting("LEC", ["T"], 1000, 1100),
                        makeMeeting("DIS", ["W"], 1600, 1700)
                    ])
                }
            })
        ];

        const results = createAllPossibleSchedules(slots);
        // Only B01 should survive
        expect(results).toHaveLength(1);
        expect(results[0][1].seqNum).toBe("B01");
    });

    test("handles three course slots", () => {
        const slots = [
            makeSlot("ECS", {
                "036B": {
                    "001": makeSection(null, [makeMeeting("LEC", ["M"], 800, 900)])
                }
            }),
            makeSlot("PHY", {
                "009B": {
                    "001": makeSection(null, [makeMeeting("LEC", ["T"], 1000, 1100)])
                }
            }),
            makeSlot("MAT", {
                "021A": {
                    "001": makeSection(null, [makeMeeting("LEC", ["W"], 1200, 1300)]),
                    "002": makeSection(null, [makeMeeting("LEC", ["R"], 1200, 1300)])
                }
            })
        ];

        const results = createAllPossibleSchedules(slots);
        expect(results).toHaveLength(2);
    });

    test("handles multiple course numbers within a slot", () => {
        // Searching "ECS 1" might return ECS 010, ECS 012, etc.
        const slots = [
            makeSlot("ECS", {
                "010": {
                    "001": makeSection(null, [makeMeeting("LEC", ["M"], 1000, 1100)])
                },
                "012": {
                    "001": makeSection(null, [makeMeeting("LEC", ["M"], 1400, 1500)])
                }
            }),
            makeSlot("PHY", {
                "009B": {
                    "001": makeSection(null, [makeMeeting("LEC", ["T"], 1000, 1100)])
                }
            })
        ];

        const results = createAllPossibleSchedules(slots);
        // Both ECS options work since PHY is on a different day
        expect(results).toHaveLength(2);
    });

    test("handles array-format slot (multi-subject-code slot)", () => {
        // Slot 1 has two different subject codes from two search queries
        const slots = [
            [
                makeSlot("ECS", {
                    "036B": {
                        "001": makeSection(null, [makeMeeting("LEC", ["M", "W"], 1000, 1100)])
                    }
                }),
                makeSlot("PHI", {
                    "022": {
                        "001": makeSection(null, [makeMeeting("LEC", ["T", "R"], 1000, 1100)])
                    }
                })
            ],
            makeSlot("MAT", {
                "021A": {
                    "001": makeSection(null, [makeMeeting("LEC", ["F"], 900, 1000)])
                }
            })
        ];

        const results = createAllPossibleSchedules(slots);
        // ECS and PHI are alternatives in the same slot; both compatible with MAT
        expect(results).toHaveLength(2);
        expect(results[0][0].subjectCode).toBe("ECS");
        expect(results[1][0].subjectCode).toBe("PHI");
        expect(results[0][1].subjectCode).toBe("MAT");
    });

    test("array-format slot with conflicts filters correctly", () => {
        const slots = [
            [
                makeSlot("ECS", {
                    "036B": {
                        "001": makeSection(null, [makeMeeting("LEC", ["M"], 1000, 1100)])
                    }
                }),
                makeSlot("PHI", {
                    "022": {
                        "001": makeSection(null, [makeMeeting("LEC", ["T"], 1000, 1100)])
                    }
                })
            ],
            makeSlot("MAT", {
                "021A": {
                    "001": makeSection(null, [makeMeeting("LEC", ["M"], 1000, 1100)]) // conflicts with ECS
                }
            })
        ];

        const results = createAllPossibleSchedules(slots);
        // Only PHI + MAT should work; ECS conflicts with MAT
        expect(results).toHaveLength(1);
        expect(results[0][0].subjectCode).toBe("PHI");
    });

    test("excludes combinations with overlapping final exams", () => {
        const slots = [
            makeSlot("ECS", {
                "036B": {
                    "001": makeSection(null, [
                        makeMeeting("LEC", ["M", "W"], 1000, 1100),
                        makeMeeting("FINAL", ["2026-06-05"], 1030, 1230)
                    ])
                }
            }),
            makeSlot("PHY", {
                "009B": {
                    "A01": makeSection("A", [
                        makeMeeting("LEC", ["T", "R"], 1400, 1500),
                        makeMeeting("FINAL", ["2026-06-05"], 1100, 1300) // overlaps with ECS final
                    ]),
                    "B01": makeSection("B", [
                        makeMeeting("LEC", ["T", "R"], 1600, 1700),
                        makeMeeting("FINAL", ["2026-06-08"], 1030, 1230) // different date, no conflict
                    ])
                }
            })
        ];

        const results = createAllPossibleSchedules(slots);
        // A01 final overlaps with ECS final; only B01 should survive
        expect(results).toHaveLength(1);
        expect(results[0][1].seqNum).toBe("B01");
    });

    test("finals on same weekday but different dates do not conflict", () => {
        const slots = [
            makeSlot("ECS", {
                "036B": {
                    "001": makeSection(null, [
                        makeMeeting("LEC", ["M"], 1000, 1100),
                        makeMeeting("FINAL", ["2026-06-05"], 1030, 1230)
                    ])
                }
            }),
            makeSlot("PHY", {
                "009B": {
                    "001": makeSection(null, [
                        makeMeeting("LEC", ["T"], 1000, 1100),
                        makeMeeting("FINAL", ["2026-06-12"], 1030, 1230) // same time, different date
                    ])
                }
            })
        ];

        const results = createAllPossibleSchedules(slots);
        expect(results).toHaveLength(1);
    });
});
