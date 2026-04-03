console.log("Hello from ScheduleConflictSolver");

let userPidm = 0;
const termCode = getTermCode();

getPidm().then(pidm => {
    console.log(pidm);
    userPidm = pidm;
});

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
            div_leftContainer.insertAdjacentHTML("afterbegin", html);

            // State
            let scsCurrentPhase = 1;
            let parsedSlots = []; // array of parseCourseSlot results, indexed by row
            let rowQueries = []; // search queries from phase 1, indexed by row

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

            // --- Phase 1 validation ---

            function scsGetFilledRows() {
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                const filled = [];
                rows.forEach((row, i) => {
                    const inputs = row.querySelectorAll(".scs-multi-input input[type='text']");
                    const queries = Array.from(inputs)
                        .map(inp => inp.value.trim())
                        .filter(q => q.length >= 3);
                    if (queries.length > 0) {
                        filled.push({ index: i, queries });
                    }
                });
                return filled;
            }

            function scsValidatePhase1() {
                const fwdBtn = document.getElementById("scs-fwd-btn");
                const tooltip = document.getElementById("scs-fwd-tooltip");
                const filled = scsGetFilledRows();
                if (scsCurrentPhase === 1) {
                    const valid = filled.length >= 2;
                    fwdBtn.disabled = !valid;
                    tooltip.textContent = valid ? "" : "You need to input search queries for at least 2 slots.";
                }
            }

            // --- Phase transitions ---

            function scsShowPhase(n) {
                const container = document.getElementById("scs-container");
                container.classList.remove("scs-phase-1", "scs-phase-2", "scs-phase-3");
                container.classList.add("scs-phase-" + n);
                scsCurrentPhase = n;

                document.querySelectorAll("#scs-dots .scs-dot").forEach(dot => {
                    dot.classList.toggle("scs-dot-active", parseInt(dot.dataset.phase) === n);
                });

                const backBtn = document.getElementById("scs-back-btn");
                const fwdBtn = document.getElementById("scs-fwd-btn");
                const tooltip = document.getElementById("scs-fwd-tooltip");

                backBtn.disabled = n === 1;

                if (n === 1) {
                    scsValidatePhase1();
                } else if (n === 2) {
                    fwdBtn.disabled = false;
                    tooltip.textContent = "";
                } else {
                    fwdBtn.disabled = true;
                    tooltip.textContent = "";
                }
            }

            function scsEnterPhase2() {
                rowQueries = [];
                parsedSlots = [];

                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");

                // Collect all queries per row, build search tasks
                const rowSearchTasks = []; // { rowIndex, queries[], promises[] }

                rows.forEach((row, i) => {
                    const inputs = row.querySelectorAll(".scs-multi-input input[type='text']");
                    const queries = Array.from(inputs).map(inp => inp.value.trim());
                    rowQueries.push(queries);

                    const filledQueries = queries.filter(q => q.length >= 3);
                    if (filledQueries.length > 0) {
                        rowSearchTasks.push({
                            rowIndex: i,
                            promises: filledQueries.map(q => search(q, "", userPidm, termCode))
                        });
                        row.style.display = "";
                    } else {
                        row.style.display = "none";
                    }
                });

                // Flatten all promises, track mapping
                const allPromises = [];
                const promiseMap = []; // { rowIndex, queryIndex }
                rowSearchTasks.forEach(task => {
                    task.promises.forEach((p, qi) => {
                        promiseMap.push({ rowIndex: task.rowIndex, queryIndex: qi });
                        allPromises.push(p);
                    });
                });

                Promise.all(allPromises).then(results => {
                    // Group parsed results by row
                    const rowResults = {}; // rowIndex -> array of parseCourseSlot results
                    results.forEach((data, ri) => {
                        const { rowIndex } = promiseMap[ri];
                        if (!rowResults[rowIndex]) rowResults[rowIndex] = [];
                        if (data && data.length > 0) {
                            rowResults[rowIndex].push(parseCourseSlot(data));
                        }
                    });

                    // Package parsed data: merge same-subject, array for multi-subject
                    for (const [rowIndexStr, parsedList] of Object.entries(rowResults)) {
                        const i = parseInt(rowIndexStr);
                        const validParsed = parsedList.filter(p => p !== null);
                        if (validParsed.length === 0) {
                            parsedSlots[i] = null;
                            continue;
                        }

                        const subjectCodes = new Set(validParsed.map(p => p.subjectCode));
                        if (subjectCodes.size === 1) {
                            // Merge courseNums into a single object
                            const merged = { subjectCode: validParsed[0].subjectCode, courseNums: {} };
                            validParsed.forEach(p => {
                                for (const [cn, seqs] of Object.entries(p.courseNums)) {
                                    if (!merged.courseNums[cn]) merged.courseNums[cn] = {};
                                    Object.assign(merged.courseNums[cn], seqs);
                                }
                            });
                            parsedSlots[i] = merged;
                        } else {
                            // Different subject codes — store as array
                            parsedSlots[i] = validParsed;
                        }
                    }

                    // Build phase 2 UI
                    let visibleNum = 1;
                    rows.forEach((row, i) => {
                        if (row.style.display === "none") return;
                        row.querySelector(".scs-row-num").textContent = visibleNum++;

                        const cell = row.querySelector(".scs-course-cell");
                        const slot = parsedSlots[i];

                        // Normalize to array for uniform rendering
                        const slotList = !slot ? [] : Array.isArray(slot) ? slot : [slot];

                        if (slotList.length === 0 || slotList.every(s => Object.keys(s.courseNums).length === 0)) {
                            cell.innerHTML = '<span class="scs-slot-no-results">No courses found</span>';
                            return;
                        }

                        const catalogBase = "https://catalog.ucdavis.edu/courses-subject-code/";

                        let cardsHTML = "";
                        for (const parsed of slotList) {
                            const subjectCode = parsed.subjectCode;
                            for (const courseNum of Object.keys(parsed.courseNums)) {
                                const label = subjectCode + " " + courseNum;
                                const seqNums = Object.keys(parsed.courseNums[courseNum]);
                                let dropdownHTML = '<div class="scs-section-dropdown">';
                                for (const seqNum of seqNums) {
                                    dropdownHTML += `<label class="scs-section-item"><input type="checkbox" checked data-row="${i}" data-subject-code="${subjectCode}" data-course-num="${courseNum}" data-seq-num="${seqNum}"> ${seqNum}</label>`;
                                }
                                dropdownHTML += '</div>';
                                cardsHTML += `<span class="scs-course-card" data-row="${i}" data-subject-code="${subjectCode}" data-course-num="${courseNum}"><span class="scs-toggle-btn scs-toggle-on" data-course-num="${courseNum}" data-row="${i}"><a class="scs-card-info" href="${catalogBase}${subjectCode.toLowerCase()}/" target="_blank" title="Additional course info">?</a><span class="scs-card-label">${label}</span><span class="scs-card-dropdown-arrow">&#9662;</span></span>${dropdownHTML}</span>`;
                            }
                        }
                        const summaryHTML = `<p class="scs-slot-summary" data-row="${i}"></p>`;
                        cell.innerHTML = cardsHTML + summaryHTML;

                        scsUpdateSlotSummary(i);
                    });

                    scsShowPhase(2);
                });
            }

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

            function scsEnterPhase3() {
                // Refine parsed data based on section-level toggle state
                const refinedSlots = [];
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");

                rows.forEach((row, i) => {
                    const slot = parsedSlots[i];
                    if (!slot) return;
                    const slotList = Array.isArray(slot) ? slot : [slot];

                    const checkedBoxes = document.querySelectorAll(`.scs-section-dropdown input[type="checkbox"][data-row="${i}"]:checked`);
                    if (checkedBoxes.length === 0) return;

                    // Group checked sections by subjectCode
                    const bySubject = {};
                    checkedBoxes.forEach(cb => {
                        const sc = cb.dataset.subjectCode;
                        const courseNum = cb.dataset.courseNum;
                        const seqNum = cb.dataset.seqNum;
                        if (!bySubject[sc]) bySubject[sc] = {};
                        if (!bySubject[sc][courseNum]) bySubject[sc][courseNum] = [];
                        bySubject[sc][courseNum].push(seqNum);
                    });

                    // Build refined slot(s) by looking up section data from parsed slot
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

                // Compute schedules
                const timeblocks = parseCustomTimeBlocks();
                const schedules = createAllPossibleSchedules(refinedSlots, timeblocks);
                const placeholder = document.getElementById("scs-computed-placeholder");

                if (schedules.length === 0) {
                    placeholder.innerHTML = "<p>No conflict-free schedules found.</p>";
                } else {
                    // Build table: rows = slot numbers, columns = schedules
                    const numSlots = schedules[0].length;
                    let tableHTML = `<p style="font-weight: bold; font-style: normal; color: #333; margin-bottom: 6px;">${schedules.length} schedule(s) found:</p>`;
                    tableHTML += '<div class="scs-results-scroll"><table id="scs-results-table"><thead><tr><th>Slot</th>';
                    schedules.forEach((_, i) => {
                        tableHTML += `<th>Schedule ${i + 1}</th>`;
                    });
                    tableHTML += '</tr></thead><tbody>';
                    for (let s = 0; s < numSlots; s++) {
                        tableHTML += `<tr><td style="font-weight: bold;">${s + 1}</td>`;
                        schedules.forEach(schedule => {
                            const entry = schedule[s];
                            tableHTML += `<td>${entry.subjectCode} ${entry.courseNum} ${entry.seqNum}</td>`;
                        });
                        tableHTML += '</tr>';
                    }
                    tableHTML += '</tbody></table></div>';
                    placeholder.innerHTML = tableHTML;
                }

                scsShowPhase(3);
            }

            function scsBackToPhase1() {
                // Restore multi-input structure and show all rows
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                rows.forEach((row, i) => {
                    row.style.display = "";
                    const cell = row.querySelector(".scs-course-cell");
                    const queries = rowQueries[i] || [""];
                    cell.innerHTML = "";
                    const container = document.createElement("div");
                    container.className = "scs-multi-container";
                    queries.forEach(q => {
                        const entry = scsCreateInputEntry();
                        entry.querySelector("input[type='text']").value = q;
                        container.appendChild(entry);
                    });
                    const addBtn = document.createElement("button");
                    addBtn.className = "scs-multi-add";
                    addBtn.title = "Add another query to this slot";
                    addBtn.innerHTML = "+";
                    container.appendChild(addBtn);
                    cell.appendChild(container);
                    scsUpdateMultiRemoveButtons(container);
                });
                parsedSlots = [];
                scsUpdateRowNumbers();
                scsShowPhase(1);
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

            // Remove row / multi-input interactions
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
                    scsValidatePhase1();
                    return;
                }

                const removeBtn = e.target.closest(".scs-remove-btn");
                if (removeBtn) {
                    const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                    if (rows.length <= 2) return;
                    removeBtn.closest("tr").remove();
                    scsUpdateRowNumbers();
                    scsUpdateRemoveButtons();
                    scsValidatePhase1();
                    return;
                }

                if (scsCurrentPhase !== 2) return;

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
                    return;
                }

                // Section checkbox change
                const sectionCheckbox = e.target.closest(".scs-section-item input[type='checkbox']");
                if (sectionCheckbox) {
                    const card = sectionCheckbox.closest(".scs-course-card");
                    scsUpdateCardToggle(card);
                    scsUpdateSlotSummary(parseInt(sectionCheckbox.dataset.row));
                }
            });

            // Validate on text input
            tbody.addEventListener("input", () => {
                if (scsCurrentPhase === 1) scsValidatePhase1();
            });

            // Navigation
            document.getElementById("scs-back-btn").addEventListener("click", () => {
                if (scsCurrentPhase === 2) {
                    scsBackToPhase1();
                } else if (scsCurrentPhase === 3) {
                    scsShowPhase(2);
                }
            });

            document.getElementById("scs-fwd-btn").addEventListener("click", () => {
                if (scsCurrentPhase === 1) {
                    scsEnterPhase2();
                } else if (scsCurrentPhase === 2) {
                    scsEnterPhase3();
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

            scsShowPhase(1);

            console.log("ScheduleConflictSolver has successfully modified DOM.");
        });
} else {
    console.log("ScheduleConflictSolver failed to modify DOM.");
}
