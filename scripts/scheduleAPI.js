function createSchedule(termCode, scheduleName) {
    return fetch("createSchedule.cfm?Term=" + termCode +
        "&Schedule=" + encodeURIComponent(scheduleName) + "&ShowDebug=0")
        .then(r => r.json());
}

function addCourseToSchedule(termCode, scheduleName, crn) {
    return fetch("addCourseToSchedule.cfm?Term=" + termCode +
        "&Schedule=" + encodeURIComponent(scheduleName) +
        "&CourseID=" + crn + "&ShowDebug=0")
        .then(r => r.json());
}

function removeSchedule(termCode, scheduleName) {
    return fetch("removeSchedule.cfm?Term=" + termCode +
        "&Schedule=" + encodeURIComponent(scheduleName) + "&ShowDebug=0")
        .then(r => r.json());
}

async function createScheduleAndSync(termCode, scheduleName) {
    const res = await createSchedule(termCode, scheduleName);
    if (res.Success) {
        await requestFromPage(PAGE_MESSAGES.SYNC_CREATE_SCHEDULE, { name: scheduleName, termCode });
    }
    return res;
}

async function addCourseAndSync(termCode, scheduleName, crn, courseData) {
    const res = await addCourseToSchedule(termCode, scheduleName, crn);
    if (res.Success) {
        // Use provided courseData, or fetch it if not provided
        if (!courseData) {
            const searchData = await search(String(crn), "", userPidm, termCode);
            if (searchData && searchData.length > 0) courseData = searchData[0];
        }
        if (courseData) {
            await requestFromPage(PAGE_MESSAGES.SYNC_ADD_COURSE, { courseData });
        }
    }
    return res;
}

async function removeScheduleAndSync(termCode, scheduleName) {
    const res = await removeSchedule(termCode, scheduleName);
    if (res.Success) {
        await requestFromPage(PAGE_MESSAGES.SYNC_REMOVE_SCHEDULE, { name: scheduleName });
    }
    return res;
}
