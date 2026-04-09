console.log("Hello from ScheduleConflictSolver");

let userPidm = 0;
const termCode = getTermCode();

getPidm().then(pidm => {
    console.log(pidm);
    userPidm = pidm;
});

// Inject bridge script into page world to access host-page variables
const bridgeScript = document.createElement("script");
bridgeScript.src = chrome.runtime.getURL("scripts/bridge.js");
document.documentElement.appendChild(bridgeScript);

async function getCurrentScheduleCourseNames(thisScheduleName, schedules) {
    const schedule = schedules.find(s => s.Name === thisScheduleName);
    if (!schedule) {
        console.warn("[SCS Import] Schedule not found:", thisScheduleName);
        return [];
    }

    const crns = [];
    for (const value of Object.values(schedule.SelectedList)) {
        crns.push(value.ConsentOfInstructorCRN);
    }

    if (crns.length === 0) {
        console.warn("[SCS Import] No CRNs found in schedule:", thisScheduleName);
        return [];
    }

    const results = await Promise.all(
        crns.map(crn => search(String(crn), "", userPidm, termCode).catch(err => {
            console.error("[SCS Import] Search failed for CRN:", crn, err);
            return null;
        }))
    );

    const courseNames = results
        .filter(data => data && data.length > 0)
        .map(data => data[0].course.shortDesc);

    console.log("[SCS Import] Found", courseNames.length, "courses from", crns.length, "CRNs:", courseNames);
    return courseNames;
}

// Temporary test function — call from console: testScheduleBridge()
async function testScheduleBridge() {
    const name = "ScheduleBob Test 2";
    const crns = ["48590", "48591"]; // replace with real CRNs

    const createRes = await createScheduleAndSync(termCode, name);
    console.log("Create:", createRes);

    for (const crn of crns) {
        const addRes = await addCourseAndSync(termCode, name, crn);
        console.log("Add course:", crn, addRes);
    }

    // const removeRes = await removeScheduleAndSync(termCode, name);
    // console.log("Remove:", removeRes);
}
// testScheduleBridge();

// Getting left container and injecting our own html within it
let div_leftContainer = document.getElementById("LeftContainer");
if (div_leftContainer == null) {
    window.addEventListener("load", () => {
        div_leftContainer = document.getElementById("LeftContainer");
    });
}

if (div_leftContainer != null) {
    fetch(chrome.runtime.getURL("html-files/main-panel.html"))
        .then(r => r.text())
        .then(html => {
            html = html.replace(/src="\.\.\/images\//g, `src="${chrome.runtime.getURL('images/')}`);
            div_leftContainer.insertAdjacentHTML("afterbegin", html);

            // State
            let scsCurrentPhase = 1;
            let parsedSlots = []; // array of parseCourseSlot results, indexed by row

            // --- Search cache (LRU, 20 entries) ---
            const SCS_CACHE_MAX = 20;
            const searchCache = new Map(); // key = lowercase query, value = raw API data array

            function scsCacheLookup(query) {
                const key = query.toLowerCase();
                if (!searchCache.has(key)) return null;
                // Move to end for LRU
                const val = searchCache.get(key);
                searchCache.delete(key);
                searchCache.set(key, val);
                return val;
            }

            function scsCacheStore(query, data) {
                const key = query.toLowerCase();
                searchCache.delete(key); // remove if exists to refresh position
                searchCache.set(key, data);
                if (searchCache.size > SCS_CACHE_MAX) {
                    // Delete oldest entry (first key)
                    const firstKey = searchCache.keys().next().value;
                    searchCache.delete(firstKey);
                }
            }

            // --- Per-row debounce & abort ---
            const rowDebounceTimers = {}; // rowIndex -> timeout ID
            const rowAbortControllers = {}; // rowIndex -> AbortController

            // --- Loading overlay ---

            const scsOverlay = document.getElementById("scs-loading-overlay");
            function scsShowLoading() { scsOverlay.classList.add("scs-loading-active"); }
            function scsHideLoading() { scsOverlay.classList.remove("scs-loading-active"); }

            // --- Row creation ---

            function scsCreateInputEntry() {
                const div = document.createElement("div");
                div.className = "scs-multi-input";
                div.innerHTML = `
                    <button class="scs-multi-remove" title="Remove query" style="display: none;">&#128465;</button>
                    <input type="text" placeholder="e.g. CSE 101 or Sandoval or Software">
                `;
                return div;
            }

            function scsUpdateMultiRemoveButtons(container) {
                const entries = container.querySelectorAll(".scs-multi-input");
                entries.forEach(entry => {
                    const btn = entry.querySelector(".scs-multi-remove");
                    btn.style.display = entries.length > 1 ? "" : "none";
                });
            }

            function scsCreateRow() {
                const tr = document.createElement("tr");
                tr.className = "scs-course-row";
                tr.innerHTML = `
                    <td class="scs-row-num" style="padding: 2px 4px; text-align: center; font-size: 11px; color: #888;"></td>
                    <td class="scs-delete-col" style="padding: 2px; text-align: center;">
                        <button class="scs-remove-btn" style="cursor: pointer; background: none; border: none; font-size: 14px; color: #888;" title="Remove">&#128465;</button>
                    </td>
                    <td class="scs-course-cell" style="padding: 2px;"></td>
                    <td class="scs-checkbox-col" style="padding: 2px; text-align: center;"><input type="checkbox" style="margin: 0;"></td>
                    <td class="scs-checkbox-col" style="padding: 2px; text-align: center;"><input type="checkbox" style="margin: 0;"></td>
                    <td class="scs-checkbox-col" style="padding: 2px; text-align: center;"><input type="checkbox" style="margin: 0;"></td>
                `;
                const cell = tr.querySelector(".scs-course-cell");
                const container = document.createElement("div");
                container.className = "scs-multi-container";
                container.appendChild(scsCreateInputEntry());
                const addBtn = document.createElement("button");
                addBtn.className = "scs-multi-add";
                addBtn.title = "Add another query to this slot";
                addBtn.innerHTML = "+";
                container.appendChild(addBtn);
                cell.appendChild(container);

                // Add slot results div below input
                const resultsDiv = document.createElement("div");
                resultsDiv.className = "scs-slot-results";
                cell.appendChild(resultsDiv);

                return tr;
            }

            function scsUpdateRowNumbers() {
                document.querySelectorAll("#scs-course-rows .scs-row-num").forEach((td, i) => {
                    td.textContent = i + 1;
                });
            }

            const SCS_MAX_ROWS = 19;

            function scsUpdateRemoveButtons() {
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                const removeBtns = document.querySelectorAll("#scs-course-rows .scs-remove-btn");
                removeBtns.forEach(btn => {
                    btn.disabled = rows.length <= 2;
                    btn.style.opacity = rows.length <= 2 ? "0.3" : "1";
                    btn.style.cursor = rows.length <= 2 ? "default" : "pointer";
                });
                // Disable add button at max rows
                const addBtn = document.getElementById("scs-add-btn");
                addBtn.disabled = rows.length >= SCS_MAX_ROWS;
                addBtn.style.opacity = rows.length >= SCS_MAX_ROWS ? "0.3" : "1";
                addBtn.style.cursor = rows.length >= SCS_MAX_ROWS ? "default" : "pointer";
            }

            // --- Validation ---

            function scsGetRowsWithResults() {
                // Returns row indices that have at least one checked section
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                const filled = [];
                rows.forEach((row, i) => {
                    const checked = row.querySelectorAll('.scs-slot-results input[type="checkbox"]:checked');
                    if (checked.length > 0) {
                        filled.push(i);
                    }
                });
                return filled;
            }

            function scsValidatePhase1() {
                const actionBtn = document.getElementById("scs-nav-action");
                const tooltip = document.getElementById("scs-fwd-tooltip");
                if (scsCurrentPhase === 1) {
                    const filled = scsGetRowsWithResults();
                    const valid = filled.length >= 2;
                    actionBtn.disabled = !valid;
                    actionBtn.classList.toggle("scs-nav-ready", valid);
                    tooltip.textContent = valid ? "" : "You need search results with selected sections for at least 2 slots.";
                }
            }

            // --- Render slot results ---

            function scsRenderSlotResults(rowIndex, parsedSlot) {
                const row = document.querySelectorAll("#scs-course-rows .scs-course-row")[rowIndex];
                if (!row) return;
                const resultsDiv = row.querySelector(".scs-slot-results");
                if (!resultsDiv) return;

                const slotList = !parsedSlot ? [] : Array.isArray(parsedSlot) ? [parsedSlot] : // already single
                    (parsedSlot.subjectCode ? [parsedSlot] : parsedSlot); // normalize

                // Handle array-of-parsed (multi-subject) vs single
                const normalizedList = !parsedSlot ? [] :
                    Array.isArray(parsedSlot) && parsedSlot.length > 0 && parsedSlot[0].subjectCode ? parsedSlot :
                    parsedSlot.subjectCode ? [parsedSlot] : [];

                if (normalizedList.length === 0 || normalizedList.every(s => Object.keys(s.courseNums).length === 0)) {
                    resultsDiv.innerHTML = '<span class="scs-slot-no-results">No courses found</span>';
                    scsValidatePhase1();
                    return;
                }

                const catalogBase = "https://catalog.ucdavis.edu/courses-subject-code/";

                let cardsHTML = "";
                for (const parsed of normalizedList) {
                    const subjectCode = parsed.subjectCode;
                    for (const courseNum of Object.keys(parsed.courseNums)) {
                        const label = subjectCode + " " + courseNum;
                        const seqNums = Object.keys(parsed.courseNums[courseNum]);
                        let dropdownHTML = '<div class="scs-section-dropdown">';
                        for (const seqNum of seqNums) {
                            dropdownHTML += `<label class="scs-section-item"><input type="checkbox" checked data-row="${rowIndex}" data-subject-code="${subjectCode}" data-course-num="${courseNum}" data-seq-num="${seqNum}"> ${seqNum}</label>`;
                        }
                        dropdownHTML += '</div>';
                        cardsHTML += `<span class="scs-course-card" data-row="${rowIndex}" data-subject-code="${subjectCode}" data-course-num="${courseNum}"><span class="scs-toggle-btn scs-toggle-on" data-course-num="${courseNum}" data-row="${rowIndex}"><a class="scs-card-info" href="${catalogBase}${subjectCode.toLowerCase()}/" target="_blank" title="Additional course info">?</a><span class="scs-card-label">${label}</span><span class="scs-card-dropdown-arrow">&#9662;</span></span>${dropdownHTML}</span>`;
                    }
                }
                const summaryHTML = `<p class="scs-slot-summary" data-row="${rowIndex}"></p>`;
                resultsDiv.innerHTML = cardsHTML + summaryHTML;

                scsUpdateSlotSummary(rowIndex);
                scsValidatePhase1();
            }

            // --- Search as you type ---

            function scsSearchRow(rowIndex) {
                const row = document.querySelectorAll("#scs-course-rows .scs-course-row")[rowIndex];
                if (!row) return;

                const inputs = row.querySelectorAll(".scs-multi-input input[type='text']");
                const queries = Array.from(inputs)
                    .map(inp => inp.value.trim())
                    .filter(q => q.length >= 3);

                const resultsDiv = row.querySelector(".scs-slot-results");

                if (queries.length === 0) {
                    // Clear results
                    resultsDiv.innerHTML = "";
                    parsedSlots[rowIndex] = null;
                    scsValidatePhase1();
                    return;
                }

                // Abort previous request for this row
                if (rowAbortControllers[rowIndex]) {
                    rowAbortControllers[rowIndex].abort();
                }
                const controller = new AbortController();
                rowAbortControllers[rowIndex] = controller;

                // Show searching indicator
                resultsDiv.innerHTML = '<span class="scs-slot-searching">Searching...</span>';

                // Check cache for each query, fetch only misses
                const promises = queries.map(q => {
                    const cached = scsCacheLookup(q);
                    if (cached !== null) return Promise.resolve(cached);
                    return search(q, "", userPidm, termCode, controller.signal)
                        .then(data => {
                            if (data) scsCacheStore(q, data);
                            return data;
                        });
                });

                Promise.all(promises).then(results => {
                    // Check if this request was aborted (a newer one replaced it)
                    if (controller.signal.aborted) return;

                    // Parse and merge results (same logic as old scsEnterPhase2)
                    const parsedList = results
                        .filter(data => data && data.length > 0)
                        .map(data => parseCourseSlot(data))
                        .filter(p => p !== null);

                    if (parsedList.length === 0) {
                        parsedSlots[rowIndex] = null;
                        scsRenderSlotResults(rowIndex, null);
                        return;
                    }

                    const subjectCodes = new Set(parsedList.map(p => p.subjectCode));
                    if (subjectCodes.size === 1) {
                        // Merge courseNums into a single object
                        const merged = { subjectCode: parsedList[0].subjectCode, courseNums: {} };
                        parsedList.forEach(p => {
                            for (const [cn, seqs] of Object.entries(p.courseNums)) {
                                if (!merged.courseNums[cn]) merged.courseNums[cn] = {};
                                Object.assign(merged.courseNums[cn], seqs);
                            }
                        });
                        parsedSlots[rowIndex] = merged;
                    } else {
                        // Different subject codes — store as array
                        parsedSlots[rowIndex] = parsedList;
                    }

                    scsRenderSlotResults(rowIndex, parsedSlots[rowIndex]);
                }).catch(err => {
                    if (err.name === "AbortError") return;
                    console.error("Search error for row", rowIndex, err);
                    resultsDiv.innerHTML = '<span class="scs-slot-no-results">Search failed</span>';
                });
            }

            function scsDebounceSearchRow(rowIndex) {
                if (rowDebounceTimers[rowIndex]) {
                    clearTimeout(rowDebounceTimers[rowIndex]);
                }
                rowDebounceTimers[rowIndex] = setTimeout(() => {
                    scsSearchRow(rowIndex);
                }, 400);
            }

            function scsGetRowIndex(element) {
                const row = element.closest(".scs-course-row");
                if (!row) return -1;
                const rows = Array.from(document.querySelectorAll("#scs-course-rows .scs-course-row"));
                return rows.indexOf(row);
            }

            // --- Phase 2 slot summary & card toggle (unchanged) ---

            function scsUpdateSlotSummary(rowIndex) {
                const summary = document.querySelector(`.scs-slot-summary[data-row="${rowIndex}"]`);
                if (!summary) return;
                const slot = parsedSlots[rowIndex];
                if (!slot) return;

                const checkedBoxes = document.querySelectorAll(`.scs-section-dropdown input[type="checkbox"][data-row="${rowIndex}"]:checked`);
                // Group by subjectCode + courseNum
                const included = {};
                checkedBoxes.forEach(cb => {
                    const key = cb.dataset.subjectCode + " " + cb.dataset.courseNum;
                    if (!included[key]) included[key] = [];
                    included[key].push(cb.dataset.seqNum);
                });

                const parts = [];
                for (const [courseLabel, seqNums] of Object.entries(included)) {
                    parts.push(courseLabel + " (" + seqNums.join(", ") + ")");
                }

                if (parts.length > 0) {
                    summary.textContent = "Included: " + parts.join("; ");
                    summary.className = "scs-slot-summary";
                } else {
                    summary.textContent = "No courses selected for this slot";
                    summary.className = "scs-slot-summary scs-slot-no-results";
                }
            }

            function scsUpdateCardToggle(card) {
                const courseNum = card.dataset.courseNum;
                const rowIndex = card.dataset.row;
                const checkboxes = card.querySelectorAll('.scs-section-dropdown input[type="checkbox"]');
                const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
                const btn = card.querySelector(".scs-toggle-btn");
                if (anyChecked) {
                    btn.classList.add("scs-toggle-on");
                    btn.classList.remove("scs-toggle-off");
                } else {
                    btn.classList.remove("scs-toggle-on");
                    btn.classList.add("scs-toggle-off");
                }
            }

            // --- Phase transitions (now 2 phases) ---

            function scsShowPhase(n) {
                const container = document.getElementById("scs-container");
                container.classList.remove("scs-phase-1", "scs-phase-2");
                container.classList.add("scs-phase-" + n);
                scsCurrentPhase = n;

                document.querySelectorAll("#scs-dots .scs-dot").forEach(dot => {
                    dot.classList.toggle("scs-dot-active", parseInt(dot.dataset.phase) === n);
                });

                const phaseLabel = document.getElementById("scs-phase-label");
                const phaseLabels = {
                    1: "Course Search & Timeblocks",
                    2: "View Results"
                };
                phaseLabel.textContent = phaseLabels[n] || "";

                const actionBtn = document.getElementById("scs-nav-action");
                const tooltip = document.getElementById("scs-fwd-tooltip");

                if (n === 1) {
                    actionBtn.textContent = "Find Schedules";
                    actionBtn.appendChild(tooltip);
                    scsValidatePhase1();
                } else {
                    actionBtn.innerHTML = "&#8249; Back";
                    actionBtn.disabled = false;
                    actionBtn.classList.remove("scs-nav-ready");
                    tooltip.textContent = "";
                    actionBtn.appendChild(tooltip);
                }
            }

            // --- Phase 2 state ---
            let allValidSchedules = [];
            let allConflictSchedules = [];
            let calendarTimeblocks = []; // named timeblocks for calendar display
            let selectedScheduleKey = null; // { type: "valid"|"conflict", idx: number }
            let calendarInitialized = false;
            let currentHover = null;
            let highlightedCell = null;

            function scsSerializeSchedule(schedule) {
                return schedule.map(e => e.subjectCode + "|" + e.courseNum + "|" + e.seqNum).join(";");
            }

            function scsGetScheduleByKey(key) {
                if (!key) return null;
                const list = key.type === "valid" ? allValidSchedules : allConflictSchedules;
                return list[key.idx] || null;
            }

            function scsBuildScheduleTable(schedules, type, includeAddBtn) {
                if (schedules.length === 0) return "";
                const numSlots = schedules[0].length;
                let html = '<div class="scs-results-scroll"><table class="scs-results-table" data-type="' + type + '"><thead><tr><th>Slot</th>';
                schedules.forEach((_, i) => {
                    html += `<th data-col="${i}" data-type="${type}">Schedule ${i + 1}</th>`;
                });
                html += '</tr></thead><tbody>';
                for (let s = 0; s < numSlots; s++) {
                    html += `<tr><td style="font-weight: bold;">${s + 1}</td>`;
                    schedules.forEach((schedule, i) => {
                        const entry = schedule[s];
                        html += `<td data-col="${i}" data-type="${type}" data-subject-code="${entry.subjectCode}" data-course-num="${entry.courseNum}" data-seq-num="${entry.seqNum}">${entry.subjectCode} ${entry.courseNum} ${entry.seqNum}</td>`;
                    });
                    html += '</tr>';
                }
                if (includeAddBtn) {
                    html += '<tr><td style="font-weight: bold;"></td>';
                    schedules.forEach((_, i) => {
                        html += `<td data-col="${i}" data-type="${type}"><button class="scs-schedule-toggle" data-schedule="${i}">Add</button></td>`;
                    });
                    html += '</tr>';
                }
                html += '</tbody></table></div>';
                return html;
            }

            function scsSelectScheduleColumn(type, idx) {
                // Remove old selection
                document.querySelectorAll(".scs-results-table .scs-col-selected").forEach(el => el.classList.remove("scs-col-selected"));
                selectedScheduleKey = { type, idx };
                // Highlight new column
                document.querySelectorAll(`.scs-results-table[data-type="${type}"] [data-col="${idx}"][data-type="${type}"]`).forEach(el => {
                    el.classList.add("scs-col-selected");
                });
                // Render calendar
                const schedule = scsGetScheduleByKey(selectedScheduleKey);
                if (schedule) scsWeekCalendar.renderSchedule(schedule, calendarTimeblocks);
            }

            function scsHoverScheduleColumn(type, idx) {
                // Add hover class
                document.querySelectorAll(`.scs-results-table[data-type="${type}"] [data-col="${idx}"][data-type="${type}"]`).forEach(el => {
                    el.classList.add("scs-col-hover");
                });
                // Temporarily render this schedule
                const list = type === "valid" ? allValidSchedules : allConflictSchedules;
                const schedule = list[idx];
                if (schedule) scsWeekCalendar.renderSchedule(schedule, calendarTimeblocks);
            }

            function scsUnhoverScheduleColumn(type, idx) {
                document.querySelectorAll(`.scs-results-table[data-type="${type}"] [data-col="${idx}"][data-type="${type}"]`).forEach(el => {
                    el.classList.remove("scs-col-hover");
                });
                // Restore selected schedule
                const schedule = scsGetScheduleByKey(selectedScheduleKey);
                if (schedule) scsWeekCalendar.renderSchedule(schedule, calendarTimeblocks);
            }

            function scsComputeSchedules() {
                scsShowLoading();
                requestAnimationFrame(() => { setTimeout(() => {
                    // Refine parsed data based on section-level toggle state
                    const refinedSlots = [];
                    const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");

                    rows.forEach((row, i) => {
                        const slot = parsedSlots[i];
                        if (!slot) return;
                        const slotList = Array.isArray(slot) ? slot : [slot];

                        const checkedBoxes = row.querySelectorAll('.scs-slot-results input[type="checkbox"]:checked');
                        if (checkedBoxes.length === 0) return;

                        const bySubject = {};
                        checkedBoxes.forEach(cb => {
                            const sc = cb.dataset.subjectCode;
                            const courseNum = cb.dataset.courseNum;
                            const seqNum = cb.dataset.seqNum;
                            if (!bySubject[sc]) bySubject[sc] = {};
                            if (!bySubject[sc][courseNum]) bySubject[sc][courseNum] = [];
                            bySubject[sc][courseNum].push(seqNum);
                        });

                        const refinedForRow = [];
                        for (const [sc, courseNums] of Object.entries(bySubject)) {
                            const source = slotList.find(s => s.subjectCode === sc);
                            if (!source) continue;
                            const refinedCourseNums = {};
                            for (const [cn, seqNums] of Object.entries(courseNums)) {
                                if (!source.courseNums[cn]) continue;
                                refinedCourseNums[cn] = {};
                                for (const sn of seqNums) {
                                    if (source.courseNums[cn][sn]) {
                                        refinedCourseNums[cn][sn] = source.courseNums[cn][sn];
                                    }
                                }
                            }
                            if (Object.keys(refinedCourseNums).length > 0) {
                                refinedForRow.push({ subjectCode: sc, courseNums: refinedCourseNums });
                            }
                        }

                        if (refinedForRow.length === 1) {
                            refinedSlots.push(refinedForRow[0]);
                        } else if (refinedForRow.length > 1) {
                            refinedSlots.push(refinedForRow);
                        }
                    });

                    // Compute valid and all schedules
                    const timeblocks = parseCustomTimeBlocks();
                    // Build named timeblocks for calendar display
                    const tbDomEntries = document.querySelectorAll("#scs-tb-entries .scs-tb-entry");
                    const namedTimeblocks = timeblocks.map((tb, i) => ({
                        ...tb,
                        name: tbDomEntries[i]?.querySelector(".scs-tb-name")?.value.trim() || "Blocked"
                    }));

                    calendarTimeblocks = namedTimeblocks;
                    allValidSchedules = createAllPossibleSchedules(refinedSlots, timeblocks);
                    const allCombinations = createAllCombinations(refinedSlots);

                    // Derive conflicting = all minus valid
                    const validKeys = new Set(allValidSchedules.map(scsSerializeSchedule));
                    allConflictSchedules = allCombinations
                        .filter(s => !validKeys.has(scsSerializeSchedule(s)))
                        .slice(0, 50);

                    const placeholder = document.getElementById("scs-computed-placeholder");
                    let html = "";

                    // Valid schedules table
                    if (allValidSchedules.length > 0) {
                        html += `<p style="font-weight: bold; font-style: normal; color: #333; margin-bottom: 6px;">${allValidSchedules.length} conflict-free schedule(s) found:</p>`;
                        html += scsBuildScheduleTable(allValidSchedules, "valid", true);
                    } else {
                        html += `<p style="font-style: normal; color: #333; margin-bottom: 6px;">No conflict-free schedules found.</p>`;
                    }

                    // Conflicting schedules table (collapsible, collapsed by default)
                    if (allConflictSchedules.length > 0) {
                        html += `<div class="scs-conflict-section">`;
                        html += `<p class="scs-conflict-header scs-collapsible" style="cursor: pointer; user-select: none;">
                            <span class="scs-collapse-arrow" style="display: inline-block; transition: transform 0.2s; transform: rotate(-90deg);">&#9662;</span>
                            ${allConflictSchedules.length} conflicting schedule(s):
                        </p>`;
                        html += `<div class="scs-conflict-body" style="display: none;">`;
                        html += scsBuildScheduleTable(allConflictSchedules, "conflict", false);
                        html += `</div></div>`;
                    }

                    // Calendar container (scrollable)
                    html += '<div id="scs-calendar-scroll" style="max-height: 400px; overflow-y: auto; border: 1px solid #CCD4E0; border-radius: 4px; margin-top: 8px;"><div id="scs-calendar-container"></div></div>';

                    placeholder.innerHTML = html;
                    currentHover = null;
                    highlightedCell = null;

                    // Initialize calendar
                    const calContainer = document.getElementById("scs-calendar-container");
                    calendarInitialized = false;
                    scsWeekCalendar.init(calContainer);
                    calendarInitialized = true;

                    // Auto-select first schedule
                    if (allValidSchedules.length > 0) {
                        scsSelectScheduleColumn("valid", 0);
                    } else if (allConflictSchedules.length > 0) {
                        scsSelectScheduleColumn("conflict", 0);
                    }

                    scsShowPhase(2);
                    scsHideLoading();
                }, 0); });
            }

            // --- Timeblock UI ---

            function scsCreateTimeblock() {
                const entry = document.createElement("div");
                entry.className = "scs-tb-entry";
                entry.innerHTML = `
                    <div class="scs-tb-row scs-tb-header-row">
                        <button class="scs-tb-delete" title="Remove timeblock">&#128465;</button>
                        <span class="scs-tb-summary"></span>
                        <input class="scs-tb-name" type="text" placeholder="e.g. Club Meeting">
                    </div>
                    <div class="scs-tb-body">
                        <div class="scs-tb-row">
                            <span class="scs-tb-label">Start:</span>
                            <span class="scs-tb-time-group">
                                <input class="scs-tb-spinner scs-tb-hour" type="number" min="1" max="12" value="12">
                                <span class="scs-tb-colon">:</span>
                                <input class="scs-tb-spinner scs-tb-min" type="number" min="0" max="59" value="00" step="5">
                                <span class="scs-tb-ampm">
                                    <button class="scs-tb-ampm-btn scs-tb-ampm-active" data-val="AM">AM</button>
                                    <button class="scs-tb-ampm-btn" data-val="PM">PM</button>
                                </span>
                            </span>
                            <span class="scs-tb-label">End:</span>
                            <span class="scs-tb-time-group">
                                <input class="scs-tb-spinner scs-tb-hour" type="number" min="1" max="12" value="1">
                                <span class="scs-tb-colon">:</span>
                                <input class="scs-tb-spinner scs-tb-min" type="number" min="0" max="59" value="00" step="5">
                                <span class="scs-tb-ampm">
                                    <button class="scs-tb-ampm-btn" data-val="AM">AM</button>
                                    <button class="scs-tb-ampm-btn scs-tb-ampm-active" data-val="PM">PM</button>
                                </span>
                            </span>
                        </div>
                        <div class="scs-tb-row">
                            <span class="scs-tb-label">Start Date:</span>
                            <input class="scs-tb-date" type="date">
                            <span class="scs-tb-label">End Date:</span>
                            <input class="scs-tb-date" type="date">
                        </div>
                        <div class="scs-tb-row">
                            <span class="scs-tb-label">Recurrence:</span>
                            <span class="scs-tb-days">
                                <span class="scs-tb-day" data-day="M">M</span>
                                <span class="scs-tb-day" data-day="T">T</span>
                                <span class="scs-tb-day" data-day="W">W</span>
                                <span class="scs-tb-day" data-day="R">R</span>
                                <span class="scs-tb-day" data-day="F">F</span>
                                <span class="scs-tb-day" data-day="S">S</span>
                            </span>
                        </div>
                    </div>
                    <button class="scs-tb-collapse">&#9650; Collapse</button>
                `;
                return entry;
            }

            function scsUpdateTbSummary(entry) {
                const summary = entry.querySelector(".scs-tb-summary");
                const name = entry.querySelector(".scs-tb-name").value.trim() || "Untitled";
                const timeGroups = entry.querySelectorAll(".scs-tb-time-group");
                const times = Array.from(timeGroups).map(g => {
                    const h = g.querySelector(".scs-tb-hour").value;
                    const m = g.querySelector(".scs-tb-min").value.padStart(2, "0");
                    const ampm = g.querySelector(".scs-tb-ampm-active").dataset.val;
                    return h + ":" + m + " " + ampm;
                });
                const days = Array.from(entry.querySelectorAll(".scs-tb-day.scs-tb-day-active"))
                    .map(d => d.dataset.day).join("");
                summary.textContent = name + " \u2022 " + times[0] + "\u2013" + times[1] + (days ? " \u2022 " + days : "");
            }

            // --- Init ---

            const tbody = document.getElementById("scs-course-rows");
            tbody.appendChild(scsCreateRow());
            tbody.appendChild(scsCreateRow());
            scsUpdateRowNumbers();
            scsUpdateRemoveButtons();

            // Add row
            document.getElementById("scs-add-btn").addEventListener("click", () => {
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                if (rows.length >= SCS_MAX_ROWS) return;
                tbody.appendChild(scsCreateRow());
                scsUpdateRowNumbers();
                scsUpdateRemoveButtons();
                scsValidatePhase1();
            });

            // Import current schedule
            document.getElementById("scs-import-btn").addEventListener("click", async () => {
                console.log("[SCS Import] Import button clicked");
                const { schedules, currentScheduleName } = await requestFromPage(PAGE_MESSAGES.GET_SCHEDULE_DATA);
                console.log("[SCS Import] Page data:", { currentScheduleName, schedules });
                const courseNames = await getCurrentScheduleCourseNames(currentScheduleName, schedules);
                if (courseNames.length === 0) {
                    console.warn("[SCS Import] No courses to import");
                    return;
                }

                // Clear existing rows and create one per course
                tbody.innerHTML = "";
                parsedSlots = [];
                courseNames.forEach(name => {
                    const row = scsCreateRow();
                    row.querySelector(".scs-multi-input input[type='text']").value = name;
                    tbody.appendChild(row);
                });
                scsUpdateRowNumbers();
                scsUpdateRemoveButtons();

                // Trigger search for each imported row
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                rows.forEach((_, i) => {
                    scsSearchRow(i);
                });
            });

            // Clear all rows
            document.getElementById("scs-clear-btn").addEventListener("click", () => {
                tbody.innerHTML = "";
                parsedSlots = [];
                tbody.appendChild(scsCreateRow());
                tbody.appendChild(scsCreateRow());
                scsUpdateRowNumbers();
                scsUpdateRemoveButtons();
                scsValidatePhase1();
            });

            // Remove row / multi-input interactions / card interactions
            tbody.addEventListener("click", (e) => {
                // Multi-input add button
                const multiAdd = e.target.closest(".scs-multi-add");
                if (multiAdd && scsCurrentPhase === 1) {
                    const container = multiAdd.closest(".scs-multi-container");
                    const entry = scsCreateInputEntry();
                    container.insertBefore(entry, multiAdd);
                    scsUpdateMultiRemoveButtons(container);
                    scsValidatePhase1();
                    return;
                }

                // Multi-input remove button
                const multiRemove = e.target.closest(".scs-multi-remove");
                if (multiRemove && scsCurrentPhase === 1) {
                    const container = multiRemove.closest(".scs-multi-container");
                    const entries = container.querySelectorAll(".scs-multi-input");
                    if (entries.length <= 1) return;
                    multiRemove.closest(".scs-multi-input").remove();
                    scsUpdateMultiRemoveButtons(container);
                    // Re-trigger search for this row
                    const rowIndex = scsGetRowIndex(container);
                    if (rowIndex >= 0) scsDebounceSearchRow(rowIndex);
                    scsValidatePhase1();
                    return;
                }

                const removeBtn = e.target.closest(".scs-remove-btn");
                if (removeBtn) {
                    const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                    if (rows.length <= 2) return;
                    const rowIndex = scsGetRowIndex(removeBtn);
                    removeBtn.closest("tr").remove();
                    // Clean up parsedSlots — remove the entry and re-index
                    parsedSlots.splice(rowIndex, 1);
                    scsUpdateRowNumbers();
                    scsUpdateRemoveButtons();
                    scsValidatePhase1();
                    return;
                }

                // --- Card interactions (work in phase 1 now) ---

                // ? info link — let the <a> handle navigation, don't interfere
                if (e.target.closest(".scs-card-info")) return;

                // Dropdown arrow click — open/close section dropdown
                const arrow = e.target.closest(".scs-card-dropdown-arrow");
                if (arrow) {
                    const card = arrow.closest(".scs-course-card");
                    document.querySelectorAll(".scs-course-card.scs-dropdown-open").forEach(c => {
                        if (c !== card) c.classList.remove("scs-dropdown-open");
                    });
                    card.classList.toggle("scs-dropdown-open");
                    return;
                }

                // Card label click — toggle entire course on/off
                const label = e.target.closest(".scs-card-label");
                if (label) {
                    const card = label.closest(".scs-course-card");
                    const checkboxes = card.querySelectorAll('.scs-section-dropdown input[type="checkbox"]');
                    const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
                    checkboxes.forEach(cb => { cb.checked = !anyChecked; });
                    scsUpdateCardToggle(card);
                    scsUpdateSlotSummary(parseInt(card.dataset.row));
                    scsValidatePhase1();
                    return;
                }

                // Section checkbox change
                const sectionCheckbox = e.target.closest(".scs-section-item input[type='checkbox']");
                if (sectionCheckbox) {
                    const card = sectionCheckbox.closest(".scs-course-card");
                    scsUpdateCardToggle(card);
                    scsUpdateSlotSummary(parseInt(sectionCheckbox.dataset.row));
                    scsValidatePhase1();
                }
            });

            // Search-as-you-type on text input
            tbody.addEventListener("input", (e) => {
                if (scsCurrentPhase !== 1) return;
                const input = e.target.closest(".scs-multi-input input[type='text']");
                if (input) {
                    const rowIndex = scsGetRowIndex(input);
                    if (rowIndex >= 0) scsDebounceSearchRow(rowIndex);
                }
            });

            // Navigation — single action button
            document.getElementById("scs-nav-action").addEventListener("click", () => {
                if (scsCurrentPhase === 1) {
                    scsComputeSchedules();
                } else if (scsCurrentPhase === 2) {
                    scsShowPhase(1);
                }
            });

            // Close dropdowns when clicking outside
            document.addEventListener("click", (e) => {
                if (!e.target.closest(".scs-course-card")) {
                    document.querySelectorAll(".scs-course-card.scs-dropdown-open").forEach(c => {
                        c.classList.remove("scs-dropdown-open");
                    });
                }
            });

            // Timeblock handlers
            const tbEntries = document.getElementById("scs-tb-entries");

            document.getElementById("scs-tb-add").addEventListener("click", () => {
                tbEntries.appendChild(scsCreateTimeblock());
            });

            tbEntries.addEventListener("click", (e) => {
                // Delete timeblock
                const delBtn = e.target.closest(".scs-tb-delete");
                if (delBtn) {
                    delBtn.closest(".scs-tb-entry").remove();
                    return;
                }

                // Collapse/expand toggle
                const collapseBtn = e.target.closest(".scs-tb-collapse");
                if (collapseBtn) {
                    const entry = collapseBtn.closest(".scs-tb-entry");
                    const isCollapsed = entry.classList.toggle("scs-tb-collapsed");
                    collapseBtn.innerHTML = isCollapsed ? "&#9660; Expand" : "&#9650; Collapse";
                    if (isCollapsed) scsUpdateTbSummary(entry);
                    return;
                }

                // Clicking summary expands
                const summary = e.target.closest(".scs-tb-summary");
                if (summary) {
                    const entry = summary.closest(".scs-tb-entry");
                    if (entry.classList.contains("scs-tb-collapsed")) {
                        entry.classList.remove("scs-tb-collapsed");
                        entry.querySelector(".scs-tb-collapse").innerHTML = "&#9650; Collapse";
                    }
                    return;
                }

                // AM/PM toggle
                const ampmBtn = e.target.closest(".scs-tb-ampm-btn");
                if (ampmBtn) {
                    const group = ampmBtn.closest(".scs-tb-ampm");
                    group.querySelectorAll(".scs-tb-ampm-btn").forEach(b => b.classList.remove("scs-tb-ampm-active"));
                    ampmBtn.classList.add("scs-tb-ampm-active");
                    return;
                }

                // Day toggle
                const dayBox = e.target.closest(".scs-tb-day");
                if (dayBox) {
                    dayBox.classList.toggle("scs-tb-day-active");
                    return;
                }
            });

            // Pad minute spinner to 2 digits on blur
            tbEntries.addEventListener("change", (e) => {
                if (e.target.classList.contains("scs-tb-min")) {
                    const val = parseInt(e.target.value) || 0;
                    e.target.value = val.toString().padStart(2, "0");
                }
            });

            // Toggle overflow shadow on scrollable sections
            function scsUpdateOverflowShadow(el) {
                el.classList.toggle("scs-scroll-overflow", el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight < el.scrollHeight);
            }

            const coursesSection = document.getElementById("scs-courses-section");
            const tbScroll = document.getElementById("scs-tb-entries-scroll");

            for (const el of [coursesSection, tbScroll]) {
                el.addEventListener("scroll", () => scsUpdateOverflowShadow(el));
                new MutationObserver(() => scsUpdateOverflowShadow(el)).observe(el, { childList: true, subtree: true });
            }

            // --- Friends modal ---
            scsFriendsModal.init(document.getElementById("scs-container"));
            document.getElementById("scs-friends-btn").addEventListener("click", () => {
                scsFriendsModal.open();
            });

            // Sync user's courses to Supabase on auth
            document.addEventListener("scs-friends-authenticated", async (e) => {
                const user = e.detail.user;
                try {
                    const { schedules, currentScheduleName } = await requestFromPage(PAGE_MESSAGES.GET_SCHEDULE_DATA);
                    const courseNames = await getCurrentScheduleCourseNames(currentScheduleName, schedules);
                    if (courseNames.length > 0) {
                        chrome.runtime.sendMessage({
                            type: "SCS_SYNC_COURSES",
                            email: user.email,
                            courses: courseNames
                        });
                    }
                } catch (err) {
                    console.warn("[SCS] Failed to sync courses:", err);
                }
            });

            // Add friend's course to an empty search slot
            document.addEventListener("scs-add-course-to-slot", (e) => {
                const courseName = e.detail.courseName;
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                let targetInput = null;
                for (const row of rows) {
                    const input = row.querySelector(".scs-multi-input input[type='text']");
                    if (input && input.value.trim() === "") {
                        targetInput = input;
                        break;
                    }
                }
                if (!targetInput) {
                    const newRow = scsCreateRow();
                    tbody.appendChild(newRow);
                    scsUpdateRowNumbers();
                    scsUpdateRemoveButtons();
                    targetInput = newRow.querySelector(".scs-multi-input input[type='text']");
                }
                targetInput.value = courseName;
                const allRows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                const rowIndex = [...allRows].indexOf(targetInput.closest(".scs-course-row"));
                if (rowIndex >= 0) scsSearchRow(rowIndex);
            });

            // --- One-time interaction handlers on placeholder (delegated) ---
            const placeholder = document.getElementById("scs-computed-placeholder");

            // Collapsible conflict section toggle (delegated)
            placeholder.addEventListener("click", (e) => {
                const toggle = e.target.closest(".scs-collapsible");
                if (!toggle) return;
                const body = placeholder.querySelector(".scs-conflict-body");
                const arrow = toggle.querySelector(".scs-collapse-arrow");
                if (!body || !arrow) return;
                const isHidden = body.style.display === "none";
                body.style.display = isHidden ? "" : "none";
                arrow.style.transform = isHidden ? "rotate(0deg)" : "rotate(-90deg)";
            });

            // Column click (select) & Add/Remove toggle
            placeholder.addEventListener("click", async (e) => {
                // Add/Remove button
                const btn = e.target.closest(".scs-schedule-toggle");
                if (btn && !btn.disabled) {
                    const schedIdx = parseInt(btn.dataset.schedule);
                    const schedule = allValidSchedules[schedIdx];
                    const isAdded = btn.classList.contains("scs-toggle-added");

                    if (!isAdded) {
                        // Show name modal before adding
                        const { schedules } = await requestFromPage(PAGE_MESSAGES.GET_SCHEDULE_DATA);
                        const existingNames = schedules.map(s => s.Name.toLowerCase());
                        const defaultName = "ScheduleBob " + (schedIdx + 1);

                        const container = document.getElementById("scs-container");
                        const modalOverlay = document.createElement("div");
                        modalOverlay.className = "scs-name-modal-overlay";
                        modalOverlay.innerHTML = `
                            <div class="scs-name-modal">
                                <p>Name your schedule</p>
                                <input type="text" class="scs-name-modal-input" value="${defaultName}">
                                <div class="scs-name-modal-error"></div>
                                <div class="scs-name-modal-actions">
                                    <button class="scs-name-modal-cancel">Cancel</button>
                                    <button class="scs-name-modal-create">Create</button>
                                </div>
                            </div>
                        `;
                        container.appendChild(modalOverlay);

                        const nameInput = modalOverlay.querySelector(".scs-name-modal-input");
                        const errorEl = modalOverlay.querySelector(".scs-name-modal-error");
                        nameInput.select();

                        const closeModal = () => modalOverlay.remove();

                        modalOverlay.querySelector(".scs-name-modal-cancel").addEventListener("click", closeModal);
                        modalOverlay.addEventListener("click", (ev) => {
                            if (ev.target === modalOverlay) closeModal();
                        });

                        const escHandler = (ev) => {
                            if (ev.key === "Escape") { closeModal(); document.removeEventListener("keydown", escHandler); }
                        };
                        document.addEventListener("keydown", escHandler);

                        const doCreate = async () => {
                            const scheduleName = nameInput.value.trim();
                            if (!scheduleName) {
                                errorEl.textContent = "Name cannot be empty";
                                return;
                            }
                            if (existingNames.includes(scheduleName.toLowerCase())) {
                                errorEl.textContent = "Name already exists";
                                return;
                            }

                            const createBtn = modalOverlay.querySelector(".scs-name-modal-create");
                            createBtn.disabled = true;
                            createBtn.textContent = "Creating...";

                            closeModal();
                            btn.disabled = true;
                            btn.textContent = "Creating...";

                            const controller = new AbortController();
                            const addTimeout = setTimeout(() => controller.abort(), 30000);

                            try {
                                const createRes = await createScheduleAndSync(termCode, scheduleName);
                                if (!createRes.Success) throw new Error("Failed to create schedule");
                                btn.dataset.scheduleName = scheduleName;

                                // Parallel search for all courses
                                btn.textContent = "Searching...";
                                const searchResults = await Promise.all(
                                    schedule.map(entry =>
                                        search(entry.subjectCode + " " + entry.courseNum, "", userPidm, termCode, controller.signal)
                                            .catch(err => {
                                                console.error(`Search failed for ${entry.subjectCode} ${entry.courseNum}:`, err);
                                                return null;
                                            })
                                    )
                                );

                                // Match results to courses
                                const coursesToAdd = [];
                                for (let i = 0; i < schedule.length; i++) {
                                    const entry = schedule[i];
                                    const searchData = searchResults[i];
                                    if (!searchData) continue;
                                    const match = searchData.find(d => d.course.seqNum === entry.seqNum && d.course.courseNum === entry.courseNum);
                                    if (!match) {
                                        console.warn(`No match for ${entry.subjectCode} ${entry.courseNum} section ${entry.seqNum}`);
                                        continue;
                                    }
                                    coursesToAdd.push(match);
                                }

                                // Add courses sequentially (bridge needs serial DOM updates)
                                let added = 0;
                                for (let i = 0; i < coursesToAdd.length; i++) {
                                    if (controller.signal.aborted) {
                                        console.error(`Timeout: added ${added}/${coursesToAdd.length} courses before abort`);
                                        throw new Error("Operation timed out");
                                    }
                                    btn.textContent = `Adding ${i + 1}/${coursesToAdd.length}...`;
                                    try {
                                        await addCourseAndSync(termCode, scheduleName, coursesToAdd[i].course.crn, coursesToAdd[i]);
                                        added++;
                                    } catch (err) {
                                        console.error(`addCourseAndSync failed for CRN ${coursesToAdd[i].course.crn}:`, err);
                                    }
                                }

                                btn.classList.add("scs-toggle-added");
                                btn.textContent = "Remove";
                            } catch (err) {
                                console.error("Add schedule failed:", err);
                                btn.textContent = "Add";
                            } finally {
                                clearTimeout(addTimeout);
                            }
                            btn.disabled = false;
                        };

                        modalOverlay.querySelector(".scs-name-modal-create").addEventListener("click", doCreate);
                        nameInput.addEventListener("keydown", (ev) => {
                            if (ev.key === "Enter") doCreate();
                        });

                    } else {
                        // Remove flow
                        btn.disabled = true;
                        btn.textContent = "Removing...";
                        try {
                            const scheduleName = btn.dataset.scheduleName;
                            if (scheduleName) await removeScheduleAndSync(termCode, scheduleName);
                            btn.classList.remove("scs-toggle-added");
                            btn.textContent = "Add";
                            delete btn.dataset.scheduleName;
                        } catch (err) {
                            console.error("Remove schedule failed:", err, "scheduleName:", btn.dataset.scheduleName);
                            btn.textContent = "Remove";
                        }
                        btn.disabled = false;
                    }
                    return;
                }

                // Column click (select)
                const cell = e.target.closest("[data-col][data-type]");
                if (cell) {
                    scsSelectScheduleColumn(cell.dataset.type, parseInt(cell.dataset.col));
                }
            });

            // Column hover (preview)
            placeholder.addEventListener("mouseover", (e) => {
                const cell = e.target.closest("[data-col][data-type]");
                if (!cell) return;
                const type = cell.dataset.type;
                const col = parseInt(cell.dataset.col);
                const key = type + ":" + col;
                if (currentHover === key) return;
                if (currentHover) {
                    const [prevType, prevCol] = currentHover.split(":");
                    scsUnhoverScheduleColumn(prevType, parseInt(prevCol));
                }
                currentHover = key;
                scsHoverScheduleColumn(type, col);
            });

            placeholder.addEventListener("mouseleave", () => {
                if (currentHover) {
                    const [prevType, prevCol] = currentHover.split(":");
                    scsUnhoverScheduleColumn(prevType, parseInt(prevCol));
                    currentHover = null;
                }
            });

            // Course cell hover (highlight in calendar)
            placeholder.addEventListener("mouseover", (e) => {
                const cell = e.target.closest("td[data-subject-code]");
                if (cell === highlightedCell) return;
                if (highlightedCell) {
                    highlightedCell.classList.remove("scs-cell-highlight");
                    scsWeekCalendar.clearHighlight();
                    highlightedCell = null;
                }
                if (cell) {
                    highlightedCell = cell;
                    cell.classList.add("scs-cell-highlight");
                    scsWeekCalendar.highlightCourse(cell.dataset.subjectCode, cell.dataset.courseNum, cell.dataset.seqNum);
                }
            });

            placeholder.addEventListener("mouseleave", () => {
                if (highlightedCell) {
                    highlightedCell.classList.remove("scs-cell-highlight");
                    scsWeekCalendar.clearHighlight();
                    highlightedCell = null;
                }
            });

            scsShowPhase(1);

            console.log("ScheduleConflictSolver has successfully modified DOM.");
        });
} else {
    console.log("ScheduleConflictSolver failed to modify DOM.");
}
