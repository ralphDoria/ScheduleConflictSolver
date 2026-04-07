# ScheduleBob

Description: ScheduleBob is an automatic schedule builder & course conflict solver for UC Davis's ScheduleBuilder. If you're asking yourself "can we fix it" in reference to your course schedule conflict, or empty schedule 5 mintutes before your pass time, just know, yes we can (I mean it's not garunteed, but it'll probably save you a lot of time anyways).

## The Gist
Given your preferences for courses, from general (e.g. I just want any philosophy course that fits into my current schedule) to specific (e.g. I want to keep this exact course and section because my friends are in it), it'll find all possible, conflict-free schedules for you to choose from.

## Polishing: 
1. Condense 1st & 2nd phases into one.
    * implement search-as-you-type
        * debounce & cache results for efficiency
    * Add custom time blocks to first phase as well
    * add filtering to first phase (e.g. no early-morning, no late-evening), which'll make algorithm more efficient and result cleaner
1. Create Schedule UI display   
    * First scheudle is automatically displayed and highlighted.
    * when hovering on schedules, they will be outlined in the list and displayed in a calendar component below. Hovering over a specific course will highlight it's blocks in the schedule. Make sure to add custom timeblocks
1. If no conflict-free schedules are found (or maybe regardless), allow users to see those conflicting schedules using the Schedule UI so that they can manually "debug" schedule conflcits.
    * Schedule Component UI needs to be able to gracefully display conflicting time blocks

## New Core Feature for 2.0
1. Accounts, friends, be able to see the courses that friends are registered in

## Bugs:
1. Schedules exported from ScheduleBob cannot be reimported (some server state/browserstate we didn't update)



### Backlog
* For custom time blocks
* If no schedules are found due to schedule conflicts, suggest to the user to make their course earch more flexible by, for example, broadening the search for a course slot or adding more options.
    * at this stage, give option for smart suggestions. Ask them which course slot they'd like to 
* Schedule analysis:
    * for each course in the included, pull in rate my professor ratings for the instructor and attach it. Then when displaying all the different schedules, calculate stats for that schedule, such as min, max, and average rating for each schedule. (Make this a freemium feature?)
    *  
* Adjustable Overlap Leniency for being considered an overlap
    * Then with this feature, provide the user with professor emails so that they can email for PTAs (Credit to Lucas for the idea)
* social aspect, like CourseMatch: be able to see what courses friends are taking
    * Gotta be careful not to be considered hacking or violate FERPA. I'm not sure if I would even be able to find other user's pidm's, which would allow me to get all their registered courses. But if that's possible, I think a privacy safe way of going about it is only allowing users to view what courses their __friends__ are taking, so then I'd have to implement user accounst, auth, and friendship system.
    * w/ user accounts, get user's shared courses, & then allow them to share those courses w/ friends. Don't store pidm bc it may go against security policies