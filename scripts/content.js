console.log("Hello from ScheduleConflictSolver");

let div_leftContainer = document.getElementById("LeftContainer");
if (div_leftContainer == null) {
    window.addEventListener("load", () => {
        div_leftContainer = document.getElementById("LeftContainer");
    });
}

if (div_leftContainer != null) {
    const thisHTML = `
    <div style='background-color: #ECF0F5; border: 1px solid #CCD4E0; margin-bottom: 15px'>
        Schedule Conflict Solver v1.0
    </div>
    `
    div_leftContainer.insertAdjacentHTML("afterbegin", thisHTML);
    console.log("ScheduleConflictSolver has sucessfullly modified DOM.");
} else {
    console.log("ScheduleConflictSolver failed to modify DOM.")
}