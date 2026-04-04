# ScheduleBob

Description: ScheduleBob is an automatic schedule builder & course conflict solver for UC Davis's ScheduleBuilder. If you're asking yourself "can we fix it" in reference to your course schedule conflict, or empty schedule 5 mintutes before your pass time, just know, yes we can (I mean it's not garunteed, but it'll probably save you a lot of time anyways).

## The Gist
Given your preferences for courses, from general (e.g. I just want any philosophy course that fits into my current schedule) to specific (e.g. I want to keep this exact course and section because my friends are in it), it'll find all possible, conflict-free schedules for you to choose from.

### MVP todo list (to get plugin on chrome store asap)
1. add an import current schedule button to the 1st phase. Add an export schedule button on the 3rd phase
    * create & delete schedules (perhaps script injection? bc need to use host site's browser source code)
    * read current schedule

### Features after mvp
* If no schedules are found due to schedule conflicts, suggest to the user to make their course earch more flexible by, for example, broadening the search for a course slot or adding more options.
    * at this stage, give option for smart suggestions. Ask them which course slot they'd like to 
* Schedule analysis:
    * for each course in the included, pull in rate my professor ratings for the instructor and attach it. Then when displaying all the different schedules, calculate stats for that schedule, such as min, max, and average rating for each schedule. (Make this a freemium feature?)
    *  
* Adjustable Overlap Leniency for being considered an overlap
    * Then with this feature, provide the user with professor emails so that they can email for PTAs (Credit to Lucas for the idea)
