window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const { type, params } = event.data;

    switch (type) {
        case "GET_SCHEDULE_DATA":
            window.postMessage({
                type: "GET_SCHEDULE_DATA_RESPONSE",
                data: { schedules: window.Schedules, currentScheduleName: window.ThisScheduleName }
            });
            break;

        case "SYNC_CREATE_SCHEDULE": {
            try {
                var name = params.name;

                // Add to Schedules array
                Schedules[Schedules.length] = {"Name": name, "SelectedList": {}, "MESSAGES": []};

                // Copy registered/waitlisted courses into new schedule's SelectedList
                for (var key in CourseDetails) {
                    var cd = CourseDetails[key];
                    if (cd.REGISTRATION_STATUS == 'Registered' || cd.REGISTRATION_STATUS == 'Waitlisted') {
                        Schedules[Schedules.length - 1].SelectedList[key] = {
                            "ShowCourseItemDetails": 0,
                            "PLANNED_STATUS": "",
                            "STORED_REGISTRATION_STATUS": cd.REGISTRATION_STATUS,
                            "UNITS": UCD.SAOT.formatUnits(cd.REGISTERED_UNITS),
                            "GRADE_MODE_CODE": cd.REGISTERED_GRADE_MODE_CODE,
                            "SWAPPED_IN": "",
                            "SWAPPED_OUT": "",
                            "ConsentOfInstructorCRN": cd.CRN,
                            "MESSAGES": []
                        };
                    }
                }

                // Switch active view to the new schedule
                adjustContainerDisplay('', '', encodeURIComponent(name));

                // Add to schedule dropdown menus
                $(".schedule-list").each(function() {
                    var DividerElement = $(this).children(".divider")[0];
                    if (DividerElement != null) {
                        var NewElement = document.createElement("li");
                        NewElement.innerHTML = '<a href="javascript:adjustContainerDisplay(\'\',\'\',\'' +
                            encodeURIComponent(name).replace(/'/g, "\\'") +
                            '\',\'SavedScheduleMenuTrigger1Text\',null,1);">' +
                            name.replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</a>';
                        this.insertBefore(NewElement, DividerElement);
                    }
                });

                window.postMessage({ type: "SYNC_CREATE_SCHEDULE_RESPONSE", data: { success: true } });
            } catch (err) {
                console.error("SYNC_CREATE_SCHEDULE error:", err);
                window.postMessage({ type: "SYNC_CREATE_SCHEDULE_RESPONSE", data: { success: false, error: String(err) } });
            }
            break;
        }

        case "SYNC_ADD_COURSE": {
            try {
                var c = params.courseData;
                var crn = c.course.passedCrn || c.course.crn;
                var key = "t" + crn;
                var subjectCode = c.course.subjectCode;
                var courseNumber = c.course.courseNum;

                // State update A — CourseDetails
                if (typeof CourseDetails[key] === 'undefined') {
                    CourseDetails[key] = {
                        "ID": crn,
                        "CRN": crn,
                        "DSPCRN": c.course.dspCrn || crn,
                        "TITLE": c.course.title || "",
                        "TITLE_SHORT": c.course.titleShort || c.course.shortDesc || "",
                        "SUBJECT_CODE": subjectCode,
                        "COURSE_NUMBER": courseNumber,
                        "SECTION_NUMBER": c.course.seqNum || "",
                        "DESCRIPTION": c.course.description || "",
                        "PREREQUISITES": c.course.prerequisites || "",
                        "CROSS_LISTING": c.course.crossListing || "",
                        "CREDIT_LIMITATION": c.course.creditLimitation || "",
                        "UNITS": UCD.SAOT.formatUnits(c.course.creditHoursLow || 0),
                        "UNIT_CHOICES": c.course.isVariableUnit == 1
                            ? {"MINIMUM": c.course.creditHoursLow, "MAXIMUM": c.course.creditHoursHigh, "STEP": 0.5}
                            : null,
                        "GRADE_MODE_CODE": c.course.gradeModeCode || "",
                        "GRADE_MODE_CHOICES": null,
                        "GE2CREDIT": c.course.ge2Credit || "",
                        "GE3CREDIT": c.course.ge3Credit || "",
                        "FINAL_EXAM_STARTDATE": null,
                        "DROP_DATE": null,
                        "CREDIT_HOURS_LOW": c.course.creditHoursLow || 0,
                        "CREDIT_HOURS_HIGH": c.course.creditHoursHigh || 0,
                        "COURSE_MATERIALS_TERM": c.course.courseMaterialsTerm || "",
                        "ALLOWED_DROP_DESC": c.course.allowedDropDesc || "",
                        "BLEND_WAIT_COUNT": c.course.blendWaitCount || 0,
                        "BLEND_SEATS_AVAIL": c.course.blendSeatsAvail || 0,
                        "COURSE_DEPT_SPECIFIC_NOTES_DATA": c.course.deptNotes || "",
                        "COURSE_SUBJECT_SPECIFIC_NOTES_DATA": c.course.subjectNotes || "",
                        "COURSE_SPECIFIC_NOTES_DATA": c.course.courseNotes || "",
                        "INSTRUCTORS": [],
                        "MEETINGS": [],
                        "REGISTRATION_STATUS": "",
                        "CanRegister": 1,
                        "CONSENT_OF_INSTRUCTOR_REQUIRED": c.course.consentRequired || 0,
                        "MESSAGES": [],
                        "CHANGES": []
                    };
                }

                // State update B — SavedForLaterCourses
                var sflKey = "t" + subjectCode + "_" + courseNumber;
                if (typeof SavedForLaterCourses[sflKey] === 'undefined') {
                    SavedForLaterCourses[sflKey] = {
                        "SUBJECT_CODE": subjectCode,
                        "COURSE_NUMBER": courseNumber,
                        "ID": subjectCode + "_" + courseNumber,
                        "TITLE": c.course.title || "",
                        "TITLE_SHORT": c.course.titleShort || c.course.shortDesc || "",
                        "DESCRIPTION": c.course.description || "",
                        "PREREQUISITES": c.course.prerequisites || "",
                        "CREDIT_LIMITATION": c.course.creditLimitation || "",
                        "UNITS": UCD.SAOT.formatUnits(c.course.creditHoursLow || 0),
                        "UNIT_CHOICES": c.course.isVariableUnit == 1
                            ? {"MINIMUM": c.course.creditHoursLow, "MAXIMUM": c.course.creditHoursHigh, "STEP": 0.5}
                            : null,
                        "GE2CREDIT": c.course.ge2Credit || "",
                        "GE3CREDIT": c.course.ge3Credit || "",
                        "CREDIT_HOURS_LOW": c.course.creditHoursLow || 0,
                        "CREDIT_HOURS_HIGH": c.course.creditHoursHigh || 0,
                        "COURSE_DEPT_SPECIFIC_NOTES_DATA": c.course.deptNotes || "",
                        "COURSE_SUBJECT_SPECIFIC_NOTES_DATA": c.course.subjectNotes || "",
                        "GRADE_MODE_CODE": c.course.gradeModeCode || "",
                        "SECTIONS": [crn],
                        "ShowCourseItemDetails": 0,
                        "StoredAllSections": 1,
                        "ShowCourseSections": 1,
                        "MESSAGES": []
                    };
                } else {
                    var sections = SavedForLaterCourses[sflKey].SECTIONS;
                    if (sections.indexOf(crn) === -1) {
                        sections.push(crn);
                    }
                }

                // State update C — Schedules[ThisScheduleIndex].SelectedList
                var selKey = "t" + crn;
                if (typeof Schedules[ThisScheduleIndex].SelectedList[selKey] === 'undefined') {
                    Schedules[ThisScheduleIndex].SelectedList[selKey] = {
                        "ShowCourseItemDetails": 0,
                        "PLANNED_STATUS": "Add",
                        "UNITS": UCD.SAOT.formatUnits(c.course.creditHoursLow || 0),
                        "GRADE_MODE_CODE": c.course.gradeModeCode || "",
                        "SWAPPED_IN": "",
                        "SWAPPED_OUT": "",
                        "ConsentOfInstructorCRN": "",
                        "MESSAGES": []
                    };
                }

                // UI update
                buildScheduleDisplays();

                window.postMessage({ type: "SYNC_ADD_COURSE_RESPONSE", data: { success: true } });
            } catch (err) {
                console.error("SYNC_ADD_COURSE error:", err);
                window.postMessage({ type: "SYNC_ADD_COURSE_RESPONSE", data: { success: false, error: String(err) } });
            }
            break;
        }

        case "SYNC_REMOVE_SCHEDULE": {
            try {
                var name = params.name;

                if (Schedules[ThisScheduleIndex].Name.toLowerCase() === "schedule 1") {
                    Schedules[ThisScheduleIndex].SelectedList = {};
                } else {
                    Schedules.splice(ThisScheduleIndex, 1);
                    if (ThisScheduleIndex > Schedules.length - 1) {
                        ThisScheduleIndex = Schedules.length - 1;
                    }
                }

                // Switch view to now-active schedule
                adjustContainerDisplay('', '', encodeURIComponent(Schedules[ThisScheduleIndex].Name),
                    'SavedScheduleMenuTrigger1Text', null, 1);

                // Rebuild dropdown menus
                buildScheduleListings();

                window.postMessage({ type: "SYNC_REMOVE_SCHEDULE_RESPONSE", data: { success: true } });
            } catch (err) {
                console.error("SYNC_REMOVE_SCHEDULE error:", err);
                window.postMessage({ type: "SYNC_REMOVE_SCHEDULE_RESPONSE", data: { success: false, error: String(err) } });
            }
            break;
        }
    }
});
