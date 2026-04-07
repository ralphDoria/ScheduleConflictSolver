// Base our search function off of host site's AJAX call

function search(searchTerm, additionalFilters, pidmNum, termCode, signal) {
    return fetch('./cf/search/search.cfc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            method: 'search',
            termCode: termCode,
            filters: JSON.stringify({
                'searchTerm': searchTerm,
                'addFilters': additionalFilters
            }),
            pidm: pidmNum
        }),
        signal: signal
    })
        .then(r => {
            if (!r.ok) throw r;
            return r.json();
        })
        .then(data => {
            return data;
            
            // May also have to migrate other AJAX calls that get seat availability and important notes,
            //but that's extra constraints for later
        })
        .catch(err => {

            // remove the spinner on the search button
            if (
                err.statusText == 'Course Data is missing.  Loading in data from the database.' ||
                err.statusText == 'Course Data was missing.  Loading in data from the database.'
            ) {

                // if course data is missing, do the following
                onAJAXError(
                    {
                        "Message": `We are currently updating our course data, please wait a moment and try your search again.`,
                        "Type": "GeneralException",
                        "AdditionalLoggingMessage": err.statusText,
                        "callerString": '',
                        "lineNumberErrorObject": new Error("")
                    },
                    document.getElementById("ErrorContainer"),
                    `We are currently updating our course data, please wait a moment and try your search again.`,
                    null,
                    1
                );

                document.querySelector("#CoursesSearch.modal.course-search .course-search-results.error-container")
                    .innerHTML = `
                        <div class="alert alert-error ErrorItem">
                            <div class="ErrorItemContent">
                                We are currently updating our course data, please wait a moment and try your search again.
                            </div>
                        </div>
                    `;

            }

        });
}