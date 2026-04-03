console.log("Hello from ScheduleConflictSolver");

let userPidm = 0;
const termCode = 202603;

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

            function scsCreateRow() {
                const tr = document.createElement("tr");
                tr.className = "scs-course-row";
                tr.innerHTML = `
                    <td class="scs-row-num" style="padding: 2px 4px; text-align: center; font-size: 11px; color: #888;"></td>
                    <td class="scs-delete-col" style="padding: 2px; text-align: center;">
                        <button class="scs-remove-btn" style="cursor: pointer; background: none; border: none; font-size: 14px; color: #888;" title="Remove">&#128465;</button>
                    </td>
                    <td class="scs-course-cell" style="padding: 2px;">
                        <input type="text" placeholder="e.g. CSE 101 or Sandoval or Software" style="display: block; width: 100%; box-sizing: border-box; padding: 3px 5px; margin: 0; border: 1px solid #CCD4E0; border-radius: 3px;">
                    </td>
                    <td class="scs-checkbox-col" style="padding: 2px; text-align: center;"><input type="checkbox" style="margin: 0;"></td>
                    <td class="scs-checkbox-col" style="padding: 2px; text-align: center;"><input type="checkbox" style="margin: 0;"></td>
                    <td class="scs-checkbox-col" style="padding: 2px; text-align: center;"><input type="checkbox" style="margin: 0;"></td>
                `;
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
                    const input = row.querySelector("input[type='text']");
                    if (input && input.value.trim().length >= 3) {
                        filled.push({ index: i, query: input.value.trim() });
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

                // Collect queries, hide empty rows, search filled ones
                const searchPromises = [];

                rows.forEach((row, i) => {
                    const input = row.querySelector("input[type='text']");
                    const query = input ? input.value.trim() : "";
                    rowQueries.push(query);

                    if (query.length >= 3) {
                        searchPromises.push({ index: i, promise: search(query, "", userPidm, termCode) });
                        row.style.display = "";
                    } else {
                        row.style.display = "none";
                    }
                });

                Promise.all(searchPromises.map(s => s.promise)).then(results => {
                    // Map results back to original row indices
                    results.forEach((data, ri) => {
                        const i = searchPromises[ri].index;
                        if (data && data.length > 0) {
                            parsedSlots[i] = parseCourseSlot(data);
                        } else {
                            parsedSlots[i] = null;
                        }
                    });

                    // Re-number visible rows
                    let visibleNum = 1;
                    rows.forEach((row, i) => {
                        if (row.style.display === "none") return;
                        row.querySelector(".scs-row-num").textContent = visibleNum++;

                        const cell = row.querySelector(".scs-course-cell");
                        const slot = parsedSlots[i];

                        if (!slot || Object.keys(slot.courseNums).length === 0) {
                            cell.innerHTML = '<span class="scs-slot-no-results">No courses found</span>';
                            return;
                        }

                        const catalogBase = "https://catalog.ucdavis.edu/courses-subject-code/";
                        const subjectCode = slot.subjectCode;

                        let cardsHTML = "";
                        for (const courseNum of Object.keys(slot.courseNums)) {
                            const label = subjectCode + " " + courseNum;
                            const seqNums = Object.keys(slot.courseNums[courseNum]);
                            let dropdownHTML = '<div class="scs-section-dropdown">';
                            for (const seqNum of seqNums) {
                                dropdownHTML += `<label class="scs-section-item"><input type="checkbox" checked data-row="${i}" data-course-num="${courseNum}" data-seq-num="${seqNum}"> ${seqNum}</label>`;
                            }
                            dropdownHTML += '</div>';
                            cardsHTML += `<span class="scs-course-card" data-row="${i}" data-course-num="${courseNum}"><span class="scs-toggle-btn scs-toggle-on" data-course-num="${courseNum}" data-row="${i}"><a class="scs-card-info" href="${catalogBase}${subjectCode.toLowerCase()}/" target="_blank" title="Additional course info">?</a><span class="scs-card-label">${label}</span><span class="scs-card-dropdown-arrow">&#9662;</span></span>${dropdownHTML}</span>`;
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
                const included = {};
                checkedBoxes.forEach(cb => {
                    const courseNum = cb.dataset.courseNum;
                    if (!included[courseNum]) included[courseNum] = [];
                    included[courseNum].push(cb.dataset.seqNum);
                });

                const parts = [];
                for (const [courseNum, seqNums] of Object.entries(included)) {
                    parts.push(slot.subjectCode + " " + courseNum + " (" + seqNums.join(", ") + ")");
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

                    const checkedBoxes = document.querySelectorAll(`.scs-section-dropdown input[type="checkbox"][data-row="${i}"]:checked`);
                    if (checkedBoxes.length === 0) return;

                    const refinedCourseNums = {};
                    checkedBoxes.forEach(cb => {
                        const courseNum = cb.dataset.courseNum;
                        const seqNum = cb.dataset.seqNum;
                        if (!slot.courseNums[courseNum] || !slot.courseNums[courseNum][seqNum]) return;
                        if (!refinedCourseNums[courseNum]) refinedCourseNums[courseNum] = {};
                        refinedCourseNums[courseNum][seqNum] = slot.courseNums[courseNum][seqNum];
                    });

                    if (Object.keys(refinedCourseNums).length > 0) {
                        refinedSlots.push({
                            subjectCode: slot.subjectCode,
                            courseNums: refinedCourseNums
                        });
                    }
                });

                // Compute schedules
                const schedules = createAllPossibleSchedules(refinedSlots);
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
                // Restore text inputs and show all rows
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                rows.forEach((row, i) => {
                    row.style.display = "";
                    const cell = row.querySelector(".scs-course-cell");
                    const query = rowQueries[i] || "";
                    cell.innerHTML = `<input type="text" placeholder="e.g. CSE 101 or Sandoval or Software" value="${query}" style="display: block; width: 100%; box-sizing: border-box; padding: 3px 5px; margin: 0; border: 1px solid #CCD4E0; border-radius: 3px;">`;
                });
                parsedSlots = [];
                scsUpdateRowNumbers();
                scsShowPhase(1);
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

            // Remove row
            tbody.addEventListener("click", (e) => {
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

            scsShowPhase(1);

            console.log("ScheduleConflictSolver has successfully modified DOM.");
        });
} else {
    console.log("ScheduleConflictSolver failed to modify DOM.");
}
