function getPidm() {
    return fetch('./cf/user.cfc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'method=getPidm'
    })
        .then(r => r.json())
        .then(data => {
            return data.pidm;
        });
}