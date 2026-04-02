console.log("Hello from ScheduleConflictSolver");

let div_leftContainer = document.getElementById("LeftContainer");
if (div_leftContainer == null) {
    window.addEventListener("load", () => {
        div_leftContainer = document.getElementById("LeftContainer");
    });
}

if (div_leftContainer != null) {
    const thisHTML = `
    <div id="scs-container" style="background-color: #ECF0F5; border: 1px solid #CCD4E0; margin-bottom: 15px; padding: 10px; font-family: sans-serif; font-size: 13px;">
        <div style="font-weight: bold; font-size: 15px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #CCD4E0;">
            Schedule Conflict Solver v1.0
        </div>
        <div id="scs-course-section">
            <table id="scs-course-table" style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr>
                        <th></th>
                        <th style="padding: 2px 6px; text-align: left;">Course</th>
                        <th style="padding: 2px 6px; font-size: 11px; text-align: center;">Skip Discussion</th>
                        <th style="padding: 2px 6px; font-size: 11px; text-align: center;">Skip Lecture</th>
                        <th style="padding: 2px 6px; font-size: 11px; text-align: center;">Skip Lab</th>
                    </tr>
                </thead>
                <tbody id="scs-course-rows">
                </tbody>
            </table>
            <button id="scs-add-btn" style="width: 100%; padding: 4px 0; margin-top: 4px; cursor: pointer; font-size: 16px; background: #fff; border: 1px solid #CCD4E0; border-radius: 3px;">+</button>
        </div>
    </div>
    `;
    div_leftContainer.insertAdjacentHTML("afterbegin", thisHTML);

    function scsCreateRow() {
        const tr = document.createElement("tr");
        tr.className = "scs-course-row";
        tr.innerHTML = `
            <td style="padding: 2px; text-align: center;">
                <button class="scs-remove-btn" style="cursor: pointer; background: none; border: none; font-size: 14px; color: #888;" title="Remove">&#128465;</button>
            </td>
            <td style="padding: 2px;">
                <input type="text" placeholder="e.g. CSE 101" style="width: 100%; box-sizing: border-box; padding: 3px 5px; border: 1px solid #CCD4E0; border-radius: 3px;">
            </td>
            <td style="padding: 2px; text-align: center;"><input type="checkbox"></td>
            <td style="padding: 2px; text-align: center;"><input type="checkbox"></td>
            <td style="padding: 2px; text-align: center;"><input type="checkbox"></td>
        `;
        return tr;
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

    const tbody = document.getElementById("scs-course-rows");
    tbody.appendChild(scsCreateRow());
    tbody.appendChild(scsCreateRow());
    scsUpdateRemoveButtons();

    document.getElementById("scs-add-btn").addEventListener("click", () => {
        tbody.appendChild(scsCreateRow());
        scsUpdateRemoveButtons();
    });

    tbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".scs-remove-btn");
        if (!btn) return;
        const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
        if (rows.length <= 2) return;
        btn.closest("tr").remove();
        scsUpdateRemoveButtons();
    });

    console.log("ScheduleConflictSolver has sucessfullly modified DOM.");
} else {
    console.log("ScheduleConflictSolver failed to modify DOM.")
}