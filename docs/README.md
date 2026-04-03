# ScheduleBob

Description: ScheduleBob is an automatic schedule builder & course conflict solver for UC Davis's ScheduleBuilder. If you're asking yourself "can we fix it" in reference to your course schedule conflict, or empty schedule 5 mintutes before your pass time, just know, yes we can (I mean it's not garunteed, but it'll probably save you a lot of time anyways).

## The Gist
Given your preferences for courses, from general (e.g. I just want any philosophy course that fits into my current schedule) to specific (e.g. I want to keep this exact course and section because my friends are in it), it'll find all possible, conflict-free schedules for you to choose from.

### MVP todo list (to get plugin on chrome store asap)
~~1. Make logo and submit to chrome store~~
~~1. need to dynamically get term code~~
~~1. Fix up popup, have it prompt user to go to Schedule Builder, with the link being `https://my.ucdavis.edu/schedulebuilder/index.cfm?termCode=`~~
1. add an import current schedule button to the 1st phase. Add an export schedule button on the 3rd phase
    * create & delete schedules (perhaps script injection? bc need to use host site's browser source code)
    * read current schedule