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
                        <input type="text" placeholder="e.g. CSE 101" style="display: block; width: 100%; box-sizing: border-box; padding: 3px 5px; margin: 0; border: 1px solid #CCD4E0; border-radius: 3px;">
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

            function scsUpdateRemoveButtons() {
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                const removeBtns = document.querySelectorAll("#scs-course-rows .scs-remove-btn");
                removeBtns.forEach(btn => {
                    btn.disabled = rows.length <= 2;
                    btn.style.opacity = rows.length <= 2 ? "0.3" : "1";
                    btn.style.cursor = rows.length <= 2 ? "default" : "pointer";
                });
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

                // Collect queries and track which rows are filled
                const searchPromises = [];
                const filledRowIndices = [];

                rows.forEach((row, i) => {
                    const input = row.querySelector("input[type='text']");
                    const query = input ? input.value.trim() : "";
                    rowQueries.push(query);

                    if (query.length >= 3) {
                        searchPromises.push(search(query, "", userPidm, termCode));
                        filledRowIndices.push(i);
                    } else {
                        searchPromises.push(Promise.resolve(null));
                        filledRowIndices.push(null);
                    }
                });

                Promise.all(searchPromises).then(results => {
                    // Parse results
                    results.forEach((data, i) => {
                        if (data && data.length > 0) {
                            parsedSlots[i] = parseCourseSlot(data);
                        } else {
                            parsedSlots[i] = null;
                        }
                    });

                    // Update each row's course cell with toggle buttons
                    rows.forEach((row, i) => {
                        const cell = row.querySelector(".scs-course-cell");
                        const slot = parsedSlots[i];

                        if (rowQueries[i].length < 3) {
                            cell.innerHTML = '<span class="scs-slot-no-results">No query entered</span>';
                            return;
                        }

                        if (!slot || Object.keys(slot.courseNums).length === 0) {
                            cell.innerHTML = '<span class="scs-slot-no-results">No courses found</span>';
                            return;
                        }

                        let cardsHTML = "";
                        for (const courseNum of Object.keys(slot.courseNums)) {
                            const label = slot.subjectCode + " " + courseNum;
                            const seqNums = Object.keys(slot.courseNums[courseNum]);
                            let dropdownHTML = '<div class="scs-section-dropdown">';
                            for (const seqNum of seqNums) {
                                dropdownHTML += `<label class="scs-section-item"><input type="checkbox" checked data-row="${i}" data-course-num="${courseNum}" data-seq-num="${seqNum}"> ${seqNum}</label>`;
                            }
                            dropdownHTML += '</div>';
                            cardsHTML += `<span class="scs-course-card" data-row="${i}" data-course-num="${courseNum}"><span class="scs-toggle-btn scs-toggle-on" data-course-num="${courseNum}" data-row="${i}">${label} &#9662;</span>${dropdownHTML}</span>`;
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
                    let listHTML = `<p style="font-weight: bold; font-style: normal; color: #333; margin-bottom: 6px;">${schedules.length} schedule(s) found:</p><ul id="scs-results-list">`;
                    schedules.forEach((schedule, i) => {
                        const desc = schedule.map(s => s.subjectCode + " " + s.courseNum + " " + s.seqNum).join(", ");
                        listHTML += `<li>Schedule ${i + 1}: ${desc}</li>`;
                    });
                    listHTML += "</ul>";
                    placeholder.innerHTML = listHTML;
                }

                scsShowPhase(3);
            }

            function scsBackToPhase1() {
                // Restore text inputs in course cells
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                rows.forEach((row, i) => {
                    const cell = row.querySelector(".scs-course-cell");
                    const query = rowQueries[i] || "";
                    cell.innerHTML = `<input type="text" placeholder="e.g. CSE 101" value="${query}" style="display: block; width: 100%; box-sizing: border-box; padding: 3px 5px; margin: 0; border: 1px solid #CCD4E0; border-radius: 3px;">`;
                });
                parsedSlots = [];
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

                // Toggle button click — open/close dropdown (phase 2)
                const toggleBtn = e.target.closest(".scs-toggle-btn");
                if (toggleBtn && scsCurrentPhase === 2) {
                    const card = toggleBtn.closest(".scs-course-card");
                    // Close all other dropdowns
                    document.querySelectorAll(".scs-course-card.scs-dropdown-open").forEach(c => {
                        if (c !== card) c.classList.remove("scs-dropdown-open");
                    });
                    card.classList.toggle("scs-dropdown-open");
                    return;
                }

                // Section checkbox change (phase 2)
                const sectionCheckbox = e.target.closest(".scs-section-item input[type='checkbox']");
                if (sectionCheckbox && scsCurrentPhase === 2) {
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
