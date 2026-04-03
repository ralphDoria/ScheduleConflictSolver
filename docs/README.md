# ScheduleBob

Description: ScheduleBob is an automatic schedule builder & course conflict solver for UC Davis's ScheduleBuilder. If you're asking yourself "can we fix it" in reference to your course schedule conflict, or empty schedule 5 mintutes before your pass time, just know, yes we can (I mean it's not garunteed, but it'll probably save you a lot of time anyways).

## The Gist
Given your preferences for courses, from general (e.g. I just want any philosophy course that fits into my current schedule) to specific (e.g. I want to keep this exact course and section because my friends are in it), it'll find all possible, conflict-free schedules for you to choose from.

## MVP todo list (to get plugin on chrome store asap)
1. UI to enter & label timeblocks for algorithm to avoid conflicts w/ (e.g. club meeting)
1. Forgot to consider overlapping final exams
1. add an import current schedule button to the 1st phase. Add an export schedule button on the 3rd phase
1. UI RESTRICTIONS
* 1st phase: don't allow more than 19 rows. If an input box is empty and the user moves on to the next phase, act as if those rows didn't exist during phase 2. Also, for the subtext under the title, add a `/ instructor last name / keyword`, and for the default text, add on `or Sandoval or Software`
* 2nd phase: Modify the toggle buttons to be split into 3 parts: a question circle on the left that when clicked, will link the user on a new tab to `https://catalog.ucdavis.edu/courses-subject-code/<subjectCode>`. When hovered on, it will display `additional course info` for now. On the right, there is currently a dropdown arrow, but I want this to be perceived as a distinct section on the rigth side of the button, which when clicked, will make the section number dropdown appear. Everything to the left of this designated dropdown click area will deselect the whole course, removing the course number and all of its sections from included.
* 3rd phase: Change the schedule display to 
