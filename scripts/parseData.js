const courses = [
    // Array of JS objects, where each index corresponds
    // to the order they were entered in the first phase of the UI
    {
        subjectCode: "ECS", // data[i].course.subjectCode
        timeMappings: {
            "036B": {
                // Sequence number mapping to meeting times, but sequence number
                // broken up since a common letter indicates same lecTime/lecturer.
                "A": {
                    lecTime: {
                        days: ['t', 'r'],
                        startTime: 1330,
                        endTime: 1600
                    },
                    seqNums: {
                        "1": {
                            disTime: {
                                days: ['m', 'w', 'f'],
                                startTime: 1330,
                                endTime: 1500
                            },
                            labTime: {

                            }
                        },
                        "2": {}
                    }
                },
                "B": {
                    lecTime: {},
                    seqNums: {}
                },
                // some sequence nubmers don't have associated letters
                // so they'll contain times for all meeting types directly
                "1": {
                    lecTime: {
                        days: ['m', 'w', 'f'],
                        startTime: 1330,
                        endTime: 1500
                    },
                    disTime: {},
                    labTime: {}
                }
            }
        },
    },
    {} // second possible class, and so on
];

function parseData(data) {
    // console.log(data);
    for (const course of data) {
        console.log(course.meeting);
    }
}