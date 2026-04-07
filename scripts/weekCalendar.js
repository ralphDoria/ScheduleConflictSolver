// Self-contained Week Calendar component for ScheduleConflictSolver
// Usage: scsWeekCalendar.init(containerEl), scsWeekCalendar.renderSchedule(schedule)

const scsWeekCalendar = (() => {
    let calendarEl = null;
    let bodyEl = null;
    let finalsEl = null;
    let finalsBodyEl = null;
    let initialized = false;

    const DAYS = [
        { key: "U", label: "Sun" },
        { key: "M", label: "Mon" },
        { key: "T", label: "Tue" },
        { key: "W", label: "Wed" },
        { key: "R", label: "Thu" },
        { key: "F", label: "Fri" },
        { key: "S", label: "Sat" }
    ];

    const PX_PER_HOUR = 50;
    const DEFAULT_START_HOUR = 8;
    const DEFAULT_END_HOUR = 18;

    function injectCSS() {
        if (document.getElementById("scs-week-calendar-styles")) return;
        const style = document.createElement("style");
        style.id = "scs-week-calendar-styles";
        style.textContent = `
            #scs-week-calendar { margin-top: 10px; border: 1px solid #CCD4E0; border-radius: 4px; overflow: hidden; background: #fff; }
            .scs-cal-header { display: flex; background: #e2e7ef; font-weight: bold; font-size: 11px; border-bottom: 1px solid #CCD4E0; }
            .scs-cal-time-header { width: 45px; flex-shrink: 0; border-right: 1px solid #CCD4E0; }
            .scs-cal-header-cell { flex: 1; text-align: center; padding: 4px 0; border-right: 1px solid #CCD4E0; }
            .scs-cal-header-cell:last-child { border-right: none; }
            .scs-cal-body { display: flex; position: relative; }
            .scs-cal-time-col { width: 45px; flex-shrink: 0; position: relative; border-right: 1px solid #CCD4E0; }
            .scs-cal-time-label { position: absolute; right: 4px; transform: translateY(-50%); font-size: 9px; color: #888; white-space: nowrap; }
            .scs-cal-day-col { flex: 1; position: relative; border-right: 1px solid #f0f0f0; }
            .scs-cal-day-col:last-child { border-right: none; }
            .scs-cal-hour-line { position: absolute; left: 0; right: 0; border-top: 1px solid #f0f0f0; pointer-events: none; }
            .scs-cal-block { position: absolute; border-radius: 3px; padding: 2px 3px; font-size: 9px; line-height: 1.2; color: #fff; overflow: hidden; box-sizing: border-box; cursor: default; z-index: 1; border: 1px solid rgba(0,0,0,0.15); }
            .scs-cal-block.scs-cal-highlight { box-shadow: 0 0 0 2px #333; z-index: 10; }
            .scs-cal-empty { padding: 20px; text-align: center; color: #888; font-style: italic; font-size: 12px; }
            #scs-finals-calendar { margin-top: 10px; border: 1px solid #CCD4E0; border-radius: 4px; overflow: hidden; background: #fff; }
            .scs-finals-title { font-weight: bold; font-size: 12px; padding: 6px 8px; background: #e2e7ef; border-bottom: 1px solid #CCD4E0; }
        `;
        document.head.appendChild(style);
    }

    function militaryToMinutes(t) {
        return Math.floor(t / 100) * 60 + (t % 100);
    }

    function hourToLabel(h) {
        if (h === 0 || h === 24) return "12 AM";
        if (h === 12) return "12 PM";
        if (h < 12) return h + " AM";
        return (h - 12) + " PM";
    }

    function buildColorMap(schedule) {
        const courses = [];
        const seen = new Set();
        for (const entry of schedule) {
            const key = entry.subjectCode + " " + entry.courseNum;
            if (!seen.has(key)) {
                seen.add(key);
                courses.push(key);
            }
        }
        const map = {};
        const n = courses.length;
        for (let i = 0; i < n; i++) {
            map[courses[i]] = `hsl(${Math.round(i * 360 / n)}, 65%, 50%)`;
        }
        return map;
    }

    function getTimeRange(schedule, timeblocks) {
        let minTime = DEFAULT_START_HOUR * 100;
        let maxTime = DEFAULT_END_HOUR * 100;
        for (const entry of schedule) {
            for (const m of entry.meetings) {
                // Skip date-based meetings (finals) for day-of-week calendar
                if (m.days.length > 0 && m.days[0].includes("-")) continue;
                if (m.startTime < minTime) minTime = m.startTime;
                if (m.endTime > maxTime) maxTime = m.endTime;
            }
        }
        for (const tb of timeblocks) {
            if (tb.startTime < minTime) minTime = tb.startTime;
            if (tb.endTime > maxTime) maxTime = tb.endTime;
        }
        const startHour = Math.floor(minTime / 100);
        const endHour = Math.ceil(maxTime / 100);
        return { startHour, endHour };
    }

    function layoutOverlaps(blocks) {
        if (blocks.length === 0) return [];

        // Sort by start time, then longest duration first
        blocks.sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

        // Assign columns using greedy approach
        const columns = []; // each column = array of blocks
        for (const block of blocks) {
            let placed = false;
            for (let c = 0; c < columns.length; c++) {
                const lastInCol = columns[c][columns[c].length - 1];
                if (block.startMin >= lastInCol.endMin) {
                    columns[c].push(block);
                    block.col = c;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                block.col = columns.length;
                columns.push([block]);
            }
        }

        const numCols = columns.length;

        // Check for containment — if a block is fully inside another, overlay it
        for (const block of blocks) {
            block.totalCols = numCols;
            block.contained = false;
        }

        if (numCols > 1) {
            for (let i = 0; i < blocks.length; i++) {
                for (let j = 0; j < blocks.length; j++) {
                    if (i === j) continue;
                    const a = blocks[i], b = blocks[j];
                    // b is fully contained in a
                    if (a.startMin <= b.startMin && a.endMin >= b.endMin && (a.endMin - a.startMin) > (b.endMin - b.startMin)) {
                        b.contained = true;
                    }
                }
            }
        }

        return blocks;
    }

    function renderBody(schedule, colorMap, startHour, endHour, timeblocks) {
        const totalHours = endHour - startHour;
        const totalHeight = totalHours * PX_PER_HOUR;
        const startMinutes = startHour * 60;

        bodyEl.innerHTML = "";
        bodyEl.style.height = totalHeight + "px";

        // Time column
        const timeCol = document.createElement("div");
        timeCol.className = "scs-cal-time-col";
        timeCol.style.height = totalHeight + "px";
        for (let h = startHour; h <= endHour; h++) {
            const label = document.createElement("div");
            label.className = "scs-cal-time-label";
            label.style.top = ((h - startHour) * PX_PER_HOUR) + "px";
            label.textContent = hourToLabel(h);
            timeCol.appendChild(label);
        }
        bodyEl.appendChild(timeCol);

        // Day columns
        for (const day of DAYS) {
            const col = document.createElement("div");
            col.className = "scs-cal-day-col";
            col.dataset.day = day.key;
            col.style.height = totalHeight + "px";

            // Hour lines
            for (let h = startHour; h <= endHour; h++) {
                const line = document.createElement("div");
                line.className = "scs-cal-hour-line";
                line.style.top = ((h - startHour) * PX_PER_HOUR) + "px";
                col.appendChild(line);
            }

            // Collect blocks for this day
            const dayBlocks = [];
            for (const entry of schedule) {
                const courseKey = entry.subjectCode + " " + entry.courseNum;
                const color = colorMap[courseKey] || "#888";
                for (const m of entry.meetings) {
                    // Skip date-based meetings (finals)
                    if (m.days.length > 0 && m.days[0].includes("-")) continue;
                    if (!m.days.includes(day.key)) continue;
                    dayBlocks.push({
                        startMin: militaryToMinutes(m.startTime),
                        endMin: militaryToMinutes(m.endTime),
                        label: entry.subjectCode + " " + entry.courseNum + " " + entry.seqNum,
                        type: m.type,
                        color: color,
                        subjectCode: entry.subjectCode,
                        courseNum: entry.courseNum,
                        seqNum: entry.seqNum
                    });
                }
            }

            // Add custom timeblocks
            for (const tb of timeblocks) {
                if (!tb.days.includes(day.key)) continue;
                dayBlocks.push({
                    startMin: militaryToMinutes(tb.startTime),
                    endMin: militaryToMinutes(tb.endTime),
                    label: tb.name || "Blocked",
                    type: "TIMEBLOCK",
                    color: "#999",
                    isTimeblock: true
                });
            }

            const laidOut = layoutOverlaps(dayBlocks);

            for (const block of laidOut) {
                const el = document.createElement("div");
                el.className = "scs-cal-block";

                if (!block.isTimeblock) {
                    el.dataset.subjectCode = block.subjectCode;
                    el.dataset.courseNum = block.courseNum;
                    el.dataset.seqNum = block.seqNum;
                } else {
                    el.style.opacity = "0.7";
                }

                const top = ((block.startMin - startMinutes) / 60) * PX_PER_HOUR;
                const height = Math.max(((block.endMin - block.startMin) / 60) * PX_PER_HOUR, 14);
                el.style.top = top + "px";
                el.style.height = height + "px";
                el.style.background = block.color;

                if (block.contained) {
                    el.style.left = "10%";
                    el.style.right = "10%";
                    el.style.zIndex = "5";
                } else if (block.totalCols > 1) {
                    const colWidth = 100 / block.totalCols;
                    el.style.left = (block.col * colWidth) + "%";
                    el.style.width = colWidth + "%";
                    el.style.right = "auto";
                } else {
                    el.style.left = "2px";
                    el.style.right = "2px";
                }

                el.innerHTML = block.isTimeblock
                    ? `<strong>${block.label}</strong>`
                    : `<strong>${block.label}</strong><br>${block.type}`;
                col.appendChild(el);
            }

            bodyEl.appendChild(col);
        }
    }

    function formatDateLabel(dateStr) {
        // "2026-06-05" -> "Jun 5"
        const [y, m, d] = dateStr.split("-");
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return months[parseInt(m) - 1] + " " + parseInt(d);
    }

    function renderFinalsBody(finals, colorMap) {
        // finals = [{ date, subjectCode, courseNum, seqNum, startTime, endTime, color }]
        if (finals.length === 0) {
            finalsBodyEl.innerHTML = '<div class="scs-cal-empty">No final exams scheduled</div>';
            finalsBodyEl.style.height = "auto";
            return;
        }

        // Get unique sorted dates
        const dates = [...new Set(finals.map(f => f.date))].sort();

        // Time range for finals
        let minTime = 2400, maxTime = 0;
        for (const f of finals) {
            if (f.startTime < minTime) minTime = f.startTime;
            if (f.endTime > maxTime) maxTime = f.endTime;
        }
        const startHour = Math.floor(minTime / 100);
        const endHour = Math.ceil(maxTime / 100);
        const totalHours = endHour - startHour;
        const totalHeight = totalHours * PX_PER_HOUR;
        const startMinutes = startHour * 60;

        // Build header
        const existingHeader = finalsEl.querySelector(".scs-cal-header");
        if (existingHeader) existingHeader.remove();
        const header = document.createElement("div");
        header.className = "scs-cal-header";
        const timeHeader = document.createElement("div");
        timeHeader.className = "scs-cal-time-header";
        header.appendChild(timeHeader);
        for (const date of dates) {
            const cell = document.createElement("div");
            cell.className = "scs-cal-header-cell";
            cell.textContent = formatDateLabel(date);
            header.appendChild(cell);
        }
        // Insert header after title, before body
        finalsEl.insertBefore(header, finalsBodyEl);

        // Build body
        finalsBodyEl.innerHTML = "";
        finalsBodyEl.style.height = totalHeight + "px";

        // Time column
        const timeCol = document.createElement("div");
        timeCol.className = "scs-cal-time-col";
        timeCol.style.height = totalHeight + "px";
        for (let h = startHour; h <= endHour; h++) {
            const label = document.createElement("div");
            label.className = "scs-cal-time-label";
            label.style.top = ((h - startHour) * PX_PER_HOUR) + "px";
            label.textContent = hourToLabel(h);
            timeCol.appendChild(label);
        }
        finalsBodyEl.appendChild(timeCol);

        // Date columns
        for (const date of dates) {
            const col = document.createElement("div");
            col.className = "scs-cal-day-col";
            col.style.height = totalHeight + "px";

            // Hour lines
            for (let h = startHour; h <= endHour; h++) {
                const line = document.createElement("div");
                line.className = "scs-cal-hour-line";
                line.style.top = ((h - startHour) * PX_PER_HOUR) + "px";
                col.appendChild(line);
            }

            // Blocks for this date
            const dayBlocks = finals
                .filter(f => f.date === date)
                .map(f => ({
                    startMin: militaryToMinutes(f.startTime),
                    endMin: militaryToMinutes(f.endTime),
                    label: f.subjectCode + " " + f.courseNum + " " + f.seqNum,
                    type: "FINAL",
                    color: f.color,
                    subjectCode: f.subjectCode,
                    courseNum: f.courseNum,
                    seqNum: f.seqNum
                }));

            const laidOut = layoutOverlaps(dayBlocks);

            for (const block of laidOut) {
                const el = document.createElement("div");
                el.className = "scs-cal-block";
                el.dataset.subjectCode = block.subjectCode;
                el.dataset.courseNum = block.courseNum;
                el.dataset.seqNum = block.seqNum;

                const top = ((block.startMin - startMinutes) / 60) * PX_PER_HOUR;
                const height = Math.max(((block.endMin - block.startMin) / 60) * PX_PER_HOUR, 14);
                el.style.top = top + "px";
                el.style.height = height + "px";
                el.style.background = block.color;

                if (block.contained) {
                    el.style.left = "10%";
                    el.style.right = "10%";
                    el.style.zIndex = "5";
                } else if (block.totalCols > 1) {
                    const colWidth = 100 / block.totalCols;
                    el.style.left = (block.col * colWidth) + "%";
                    el.style.width = colWidth + "%";
                    el.style.right = "auto";
                } else {
                    el.style.left = "2px";
                    el.style.right = "2px";
                }

                el.innerHTML = `<strong>${block.label}</strong><br>FINAL`;
                col.appendChild(el);
            }

            finalsBodyEl.appendChild(col);
        }
    }

    return {
        init(container) {
            injectCSS();

            calendarEl = document.createElement("div");
            calendarEl.id = "scs-week-calendar";

            // Header
            const header = document.createElement("div");
            header.className = "scs-cal-header";
            const timeHeader = document.createElement("div");
            timeHeader.className = "scs-cal-time-header";
            header.appendChild(timeHeader);
            for (const day of DAYS) {
                const cell = document.createElement("div");
                cell.className = "scs-cal-header-cell";
                cell.textContent = day.label;
                header.appendChild(cell);
            }
            calendarEl.appendChild(header);

            // Body
            bodyEl = document.createElement("div");
            bodyEl.className = "scs-cal-body";
            calendarEl.appendChild(bodyEl);

            container.appendChild(calendarEl);

            // Finals calendar
            finalsEl = document.createElement("div");
            finalsEl.id = "scs-finals-calendar";
            const finalsTitle = document.createElement("div");
            finalsTitle.className = "scs-finals-title";
            finalsTitle.textContent = "Final Exams";
            finalsEl.appendChild(finalsTitle);
            finalsBodyEl = document.createElement("div");
            finalsBodyEl.className = "scs-cal-body";
            finalsEl.appendChild(finalsBodyEl);
            container.appendChild(finalsEl);

            initialized = true;
        },

        renderSchedule(schedule, timeblocks) {
            if (!initialized) return;
            if (!timeblocks) timeblocks = [];
            if ((!schedule || schedule.length === 0) && timeblocks.length === 0) {
                bodyEl.innerHTML = '<div class="scs-cal-empty">No schedule to display</div>';
                bodyEl.style.height = "auto";
                return;
            }

            const safeSchedule = schedule || [];
            const colorMap = buildColorMap(safeSchedule);
            const { startHour, endHour } = getTimeRange(safeSchedule, timeblocks);
            renderBody(safeSchedule, colorMap, startHour, endHour, timeblocks);

            // Render finals calendar
            const finals = [];
            for (const entry of safeSchedule) {
                const courseKey = entry.subjectCode + " " + entry.courseNum;
                const color = colorMap[courseKey] || "#888";
                for (const m of entry.meetings) {
                    if (m.type !== "FINAL") continue;
                    for (const date of m.days) {
                        finals.push({
                            date,
                            subjectCode: entry.subjectCode,
                            courseNum: entry.courseNum,
                            seqNum: entry.seqNum,
                            startTime: m.startTime,
                            endTime: m.endTime,
                            color
                        });
                    }
                }
            }
            renderFinalsBody(finals, colorMap);
            finalsEl.style.display = finals.length > 0 ? "" : "none";
        },

        highlightCourse(subjectCode, courseNum, seqNum) {
            if (!initialized) return;
            for (const container of [calendarEl, finalsEl]) {
                container.querySelectorAll(".scs-cal-block").forEach(el => {
                    if (el.dataset.subjectCode === subjectCode &&
                        el.dataset.courseNum === courseNum &&
                        el.dataset.seqNum === seqNum) {
                        el.classList.add("scs-cal-highlight");
                    }
                });
            }
        },

        clearHighlight() {
            if (!initialized) return;
            for (const container of [calendarEl, finalsEl]) {
                container.querySelectorAll(".scs-cal-highlight").forEach(el => {
                    el.classList.remove("scs-cal-highlight");
                });
            }
        }
    };
})();
