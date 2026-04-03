# Schedule Conflict Sovler

Name: ScheduleBob

Description: ScheduleBob is an automatic schedule builder & course conflict solver for UC Davis's ScheduleBuilder. If you're asking yourself "can we fix it" in reference to your course schedule conflict, just know, yes we can (I mean it's not garunteed, but it'll probably be really helpful).

## The Gist
Want to be able to come up with a combination of courses based on some parameters:
- What courses you want, but what's flexible to change about them: perhaps the course entirely, perhaps just the section, perhaps a specific professor, perhaps just make the times fit together.
- I'm not sure if ScheduleBuilder allows people to assign with scheduling conflicts, but despite that, I want ot make a leniency parameters to how much courses can overlap. Can customize the beginning or ending overlap. (It seems students can still register for courses if it has conflicts if they obtain a PTA #)

## MVP todo list (to get plugin on chrome store asap)
1. UI to enter & label timeblocks for algorithm to avoid conflicts w/ (e.g. club meeting)
1. Forgot to consider overlapping final exams
1. add an import current schedule button to the 1st phase. Add an export schedule button on the 3rd phase
1. UI RESTRICTIONS
* 1st phase: don't allow more than 19 rows. If an input box is empty and the user moves on to the next phase, act as if those rows didn't exist during phase 2. Also, for the subtext under the title, add a `/ instructor last name / keyword`, and for the default text, add on `or Sandoval or Software`
* 2nd phase: Modify the toggle buttons to be split into 3 parts: a question circle on the left that when clicked, will link the user on a new tab to `https://catalog.ucdavis.edu/courses-subject-code/<subjectCode>`. When hovered on, it will display `additional course info` for now. On the right, there is currently a dropdown arrow, but I want this to be perceived as a distinct section on the rigth side of the button, which when clicked, will make the section number dropdown appear. Everything to the left of this designated dropdown click area will deselect the whole course, removing the course number and all of its sections from included.
* 3rd phase: Change the schedule display to 
