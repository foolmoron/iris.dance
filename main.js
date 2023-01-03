const firebaseConfig = {
    apiKey: 'AIzaSyDD0RbPzbeDAotBGeG557ILl4hX3AqYIMw',
    authDomain: 'iris-tracker.firebaseapp.com',
    projectId: 'iris-tracker',
    storageBucket: 'iris-tracker.appspot.com',
    messagingSenderId: '1024924014821',
    appId: '1:1024924014821:web:a9e14262f3b76fa32f1c0c',
}
firebase.initializeApp(firebaseConfig)
const auth = firebase.auth()
const db = firebase.firestore()

const FIRST_HOUR_OF_DAY = 7

const statsContainer = document.querySelector('.stats')
const sheetsLinkContainer = document.querySelector('.sheets-link')

function lerp(a, b, t) {
    return a + (b - a) * t
}

async function loadUser() {
    const provider = new firebase.auth.GoogleAuthProvider()

    try {
        const cachedUser = await new Promise((resolve) => {
            auth.onAuthStateChanged(resolve)
        })
        if (cachedUser) {
            return cachedUser
        }
    } catch (e) {
        console.error(e)
    }

    try {
        const res = await auth.getRedirectResult()
        if (res.user) {
            return res.user
        }
    } catch (e) {
        console.error(e)
    }

    // No existing auth, try to sign in
    await auth.signInWithRedirect(provider)
}

async function loadSheet(sheetId, timezoneOffsetMins, snackLimitMinutes, targetFeedingTimes) {
    try {
        const key = firebaseConfig.apiKey
        // Fetch
        const range = encodeURIComponent('A500:Z')
        const rows = await fetch(
            `https://content-sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${key}`
        )
            .then((res) => res.json())
            .then((json) => json.values)
        rows.reverse()

        // Times
        const times = targetFeedingTimes.map((t) => {
            const [hour, minutes] = t.split(':').map((x) => parseInt(x))
            return hour * 60 + minutes
        })
        const earliestMins = times[0].hour * 60 + times[0].minute - snackLimitMinutes
        const today = new Date()
        today.setHours(24, 0, 0, 0)

        // Parse (simplified)
        const dates = rows.map((row) => {
            const d = new Date((row[1] || row[0]).replace('/0022 ', '/2022 '))
            const mins = d.getHours() * 60 + d.getMinutes()
            const prevDayAdjustment = mins < earliestMins ? -24 : 0
            const dateStamp = d.setHours(prevDayAdjustment, 0, 0, 0)
            const foundIndex = times.findIndex((t) => (t - snackLimitMinutes) > mins)
            const bucket = ((foundIndex >= 0 ? foundIndex : times.length) - 1 + times.length) % times.length
            const diff1 = mins - times[bucket]
            const diff2 = (mins + 24 * 60) - times[bucket]
            const diff = Math.abs(diff1) < Math.abs(diff2) ? diff1 : diff2
            return {
                dateStamp,
                bucket,
                mins,
                diff: Math.abs(diff),
                pos: diff >= 0,
            }
        })
        const datesByDayAndBucket = dates.reduce((acc, d) => {
            const key = d.dateStamp
            if (!acc.has(key)) {
                acc.set(key, times.map(() => []))
            }
            acc.get(key)[d.bucket].unshift(d)
            acc.get(key)[d.bucket].sort((a, b) => a.diff - b.diff)
            return acc
        }, new Map([[today.getTime(), times.map(() => [])]]))
        return datesByDayAndBucket
    } catch (e) {
        console.error(e)
        alert(e.message)
    }
}

function secsToString(secs) {
    const prefix = secs < 0 ? '+' : ''
    secs = Math.abs(secs)
    const hours = Math.trunc(secs / 3600)
    const minutes = Math.trunc((secs % 3600) / 60)
    const seconds = secs % 60
    const str = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`
    return prefix + str
}

function setupCountdownToFeeding(el, snackLimitMinutes, wiggleRoomMinutes, nextFeedingTime) {
    const secs = Math.trunc((nextFeedingTime.getTime() - Date.now()) / 1000)

    // Update el
    el.textContent = secsToString(secs)

    // Red below snack limit, orange below wiggle, blue within wiggle, green after
    const level =
        secs > snackLimitMinutes * 60
            ? 'red'
            : secs > wiggleRoomMinutes * 60
                ? 'orange'
                : secs > 0
                    ? 'blue'
                    : 'green'
    el.classList.remove('blue', 'green', 'orange', 'red')
    el.classList.add(level)
}

async function main() {
    const user = await loadUser()
    if (!user) {
        return
    }
    const token = await user.getIdToken()
    const timezoneOffsetMins = new Date().getTimezoneOffset()

    const [
        _formEmbedId,
        sheetId,
        targetFeedingTimes,
        snackLimitMinutes,
        wiggleRoomMinutes,
    ] = await Promise.all([
        // Embed form
        db.collection('config').doc('formEmbedId').get()
            .then(item => item.data().value)
            .then((formId) => {
                const url = `https://docs.google.com/forms/d/e/${formId}/viewform?embedded=true`
                document
                    .querySelector('.next-feeding.time')
                    .parentNode.insertAdjacentHTML(
                        'afterend',
                        `<iframe class="form" src="${url}" scrolling="no">Loading…</iframe>`
                    )
                return formId
            }),

        // Embed sheet
        db.collection('config').doc('sheetId').get()
            .then(item => item.data().value)
            .then((sheetId) => {
                sheetsLinkContainer.insertAdjacentHTML(
                    'beforeend',
                    `<a target="_blank" href="https://docs.google.com/spreadsheets/d/${sheetId}/edit?usp=sharing">
                        Full stats in Google Sheet
                    </a>`
                )
                return sheetId
            }),

        db.collection('config').doc('targetFeedingTimes').get()
            .then(item => item.data().value),

        db.collection('config').doc('snackLimitMinutes').get()
            .then(item => item.data().value),

        db.collection('config').doc('wiggleRoomMinutes').get()
            .then(item => item.data().value)
    ])

    // Load data from google sheet
    const data = await loadSheet(sheetId, timezoneOffsetMins, snackLimitMinutes, targetFeedingTimes)

    // Render stats
    const entries = [...data.entries()].slice(0, 28)
    statsContainer.insertAdjacentHTML(
        'beforeend',
        `
        <h1>Feedings</h1>
        <table>
            <thead>
                <tr>
                    <th></th>
                    ${targetFeedingTimes.map(t => {
                        const [hour, minutes] = t.split(':').map((x) => parseInt(x))
                        return `<th>${new Date((hour * 60 + minutes + timezoneOffsetMins) * 60 * 1000).toLocaleTimeString('default', { hour:'numeric', minute:'2-digit' })}</th>`
                    }).join('')}
                </tr>
            </thead>
            <tbody>
                ${entries.map(([dateStamp, buckets], i) => `
                    <tr class="${i < 7 ? 'feed-initial' : 'feed-more'}">
                        <td><b>${new Date(dateStamp).toLocaleDateString('default', { month: 'short', day:'numeric' })}</b></td>
                        ${buckets.map((b) => `
                            <td>
                            ${b.map((d) => `
                                <div class="feed-time">${new Date((d.mins + timezoneOffsetMins) * 60 * 1000).toLocaleTimeString('default', { hour:'numeric', minute:'2-digit' })}<span>(${d.pos ? '+' : '-'}${Math.trunc(d.diff / 60)}:${(d.diff % 60).toString().padStart(2, '0')})</span></div>
                            `).join('')}
                            </td>
                        `).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <button onClick="document.documentElement.style.setProperty('--feed-more-display', 'table-row'); this.remove();">Show More</button>
    `)

    // Next time
    let potentialNextFeedingTime, nextFeedingTime
    for (const [dateStamp, buckets] of data.entries()) {
        for (let b = buckets.length - 1; b >= 0; b--) {
            const bucket = buckets[b]
            if (bucket.length === 0) {
                potentialNextFeedingTime = new Date(new Date(dateStamp).toLocaleDateString() + ' ' + targetFeedingTimes[b])
            } else {
                nextFeedingTime = potentialNextFeedingTime
                break
            }
        }
        if (nextFeedingTime) {
            break
        }
    }
    document.querySelector('.next-feeding.time').textContent = nextFeedingTime.toLocaleTimeString()

    // Start countdown to next feeding
    setInterval(() => setupCountdownToFeeding(
        document.querySelector('.next-feeding.countdown'),
        snackLimitMinutes,
        wiggleRoomMinutes,
        nextFeedingTime
    ), 1000)
}

void main()
