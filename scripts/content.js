console.log("Hello from ScheduleConflictSolver");

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

            function scsCreateRow() {
                const tr = document.createElement("tr");
                tr.className = "scs-course-row";
                tr.innerHTML = `
                    <td class="scs-row-num" style="padding: 2px 4px; text-align: center; font-size: 11px; color: #888;"></td>
                    <td class="scs-delete-col" style="padding: 2px; text-align: center;">
                        <button class="scs-remove-btn" style="cursor: pointer; background: none; border: none; font-size: 14px; color: #888;" title="Remove">&#128465;</button>
                    </td>
                    <td style="padding: 2px;">
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

            let scsCurrentPhase = 1;

            function scsShowPhase(n) {
                const container = document.getElementById("scs-container");
                container.classList.remove("scs-phase-1", "scs-phase-2", "scs-phase-3");
                container.classList.add("scs-phase-" + n);
                scsCurrentPhase = n;

                document.querySelectorAll("#scs-dots .scs-dot").forEach(dot => {
                    dot.classList.toggle("scs-dot-active", parseInt(dot.dataset.phase) === n);
                });

                document.getElementById("scs-back-btn").disabled = n === 1;
                document.getElementById("scs-fwd-btn").disabled = n === 3;

                const inputs = document.querySelectorAll("#scs-course-rows input[type='text']");
                inputs.forEach(input => { input.disabled = n >= 2; });
            }

            const tbody = document.getElementById("scs-course-rows");
            tbody.appendChild(scsCreateRow());
            tbody.appendChild(scsCreateRow());
            scsUpdateRowNumbers();
            scsUpdateRemoveButtons();

            document.getElementById("scs-add-btn").addEventListener("click", () => {
                tbody.appendChild(scsCreateRow());
                scsUpdateRowNumbers();
                scsUpdateRemoveButtons();
            });

            tbody.addEventListener("click", (e) => {
                const btn = e.target.closest(".scs-remove-btn");
                if (!btn) return;
                const rows = document.querySelectorAll("#scs-course-rows .scs-course-row");
                if (rows.length <= 2) return;
                btn.closest("tr").remove();
                scsUpdateRowNumbers();
                scsUpdateRemoveButtons();
            });

            document.getElementById("scs-back-btn").addEventListener("click", () => {
                if (scsCurrentPhase > 1) scsShowPhase(scsCurrentPhase - 1);
            });
            document.getElementById("scs-fwd-btn").addEventListener("click", () => {
                if (scsCurrentPhase < 3) scsShowPhase(scsCurrentPhase + 1);
            });

            scsShowPhase(1);

            console.log("ScheduleConflictSolver has sucessfullly modified DOM.");
        });
} else {
    console.log("ScheduleConflictSolver failed to modify DOM.")
}