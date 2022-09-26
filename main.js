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

async function loadFormId() {
    try {
        return (await db.collection('config').doc('formEmbedId').get()).data()
            .value
    } catch (e) {
        console.error(e)
        alert(e.message)
    }
}

async function loadSheetUrl() {
    try {
        return (await db.collection('config').doc('sheetUrl').get()).data()
            .value
    } catch (e) {
        console.error(e)
        alert(e.message)
    }
}

async function loadSheet(key, targetFeedingMinutes) {
    try {
        // Fetch
        const sheetId = (
            await db.collection('config').doc('sheetId').get()
        ).data().value
        const range = encodeURIComponent('A2:Z')
        const key = firebaseConfig.apiKey
        const rows = await fetch(
            `https://content-sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${key}`
        )
            .then((res) => res.json())
            .then((json) => json.values)

        // Parse
        const data = rows.map((row) => ({
            date: new Date((row[1] || row[0]).replace('/0022 ', '/2022 ')),
            feed:
                row[2] || row[3] || row[4]
                    ? {
                        left: !!row[2],
                        right: !!row[3],
                        bottle: !!row[4],
                    }
                    : undefined,
            diaper:
                row[5] || row[6]
                    ? {
                        wet: !!row[5],
                        soiled: !!row[6],
                    }
                    : undefined,
            notes: row[7],
        }))
        data.sort((a, b) => a.date - b.date)

        // Stats
        const now = new Date()
        const today =
            now.getHours() >= FIRST_HOUR_OF_DAY
                ? now.setHours(FIRST_HOUR_OF_DAY, 0, 0, 0)
                : now.setHours(FIRST_HOUR_OF_DAY - 24, 0, 0, 0)
        const past24h = Date.now() - 24 * 60 * 60 * 1000
        const feedLatest8 = data
            .filter((d) => d.feed)
            .slice(-8)
            .reverse()
        const feedLatest = feedLatest8[0]
        const feedCountToday = data.filter(
            (i) => i.feed && i.date > today
        ).length
        const feedCount24h = data.filter(
            (i) => i.feed && i.date > past24h
        ).length
        const diaperWetLatestTime = data.findLast((i) => i.diaper?.wet)
        const diaperWetCountToday = data.filter(
            (i) => i.diaper?.wet && i.date > today
        ).length
        const diaperWetCount24h = data.filter(
            (i) => i.diaper?.wet && i.date > past24h
        ).length
        const diaperSoiledLatestTime = data.findLast((i) => i.diaper?.soiled)
        const diaperSoiledCountToday = data.filter(
            (i) => i.diaper?.soiled && i.date > today
        ).length
        const diaperSoiledCount24h = data.filter(
            (i) => i.diaper?.soiled && i.date > past24h
        ).length

        return {
            feedLatest,
            feedLatest8,
            feedCountToday,
            feedCount24h,
            diaperWetLatestTime,
            diaperWetCountToday,
            diaperWetCount24h,
            diaperSoiledLatestTime,
            diaperSoiledCountToday,
            diaperSoiledCount24h,
        }
    } catch (e) {
        console.error(e)
        alert(e.message)
    }
}

function secsToString(secs) {
    const prefix = secs < 0 ? '+' : ''
    secs = Math.abs(secs)
    const hours = Math.floor(secs / 3600)
    const minutes = Math.floor((secs % 3600) / 60)
    const seconds = secs % 60
    const str = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`
    return prefix + str
}

function calcLastFewFeeds(feedItems, targetFeedingMinutes) {
    const lines = []
    for (let i = 0; i < feedItems.length; i++) {
        const item = feedItems[i]
        const details = `${item.date.toLocaleString()} - ${[
            item.feed.left && 'Left',
            item.feed.right && 'Right',
            item.feed.bottle && 'Bottle',
        ]
            .filter(Boolean)
            .join(', ')}`
        lines.push(details)

        // get difference in time between items
        if (i < feedItems.length - 1) {
            const secsDiff = Math.floor(
                (item.date - feedItems[i + 1].date) / 1000
            )
            const secsFactor = Math.pow(
                Math.max(
                    0,
                    Math.min(1, secsDiff / (targetFeedingMinutes * 60 * 1.7))
                ),
                1.3
            )
            const color = `hsl(${lerp(334, 135, secsFactor)}, 100%, 39%)`
            const halfWidth = lerp(10, 130, secsFactor)
            const diff = `
                <div style="padding-left: ${130 - halfWidth
                }px; color: ${color};">
                    <div style="display: inline-block; background: ${color}; width: ${halfWidth}px; height: 0.5em;"></div>
                    ${secsToString(secsDiff)}
                    <div style="display: inline-block; background: ${color}; width: ${halfWidth}px; height: 0.5em;"></div>
                </div>
            `
            lines.push(diff)
        }
    }
    return `<b>${lines.join('')}</b>`
}

async function setupCountdownToFeeding(el, lastFeedDate, targetFeedingMinutes) {
    const secsSinceLastFeeding = (Date.now() - lastFeedDate) / 1000
    const secs = Math.floor(targetFeedingMinutes * 60 - secsSinceLastFeeding)

    // Tick every sec
    setTimeout(
        () =>
            setupCountdownToFeeding(el, lastFeedDate, targetFeedingMinutes),
        1000
    )

    // Update el
    el.textContent = secsToString(secs)

    // Color is based off 40% and 20% of target mins, rounded to upper 5 mins
    const mediumMins = Math.ceil((targetFeedingMinutes * 0.4) / 5) * 5
    const lowMins = Math.ceil((targetFeedingMinutes * 0.2) / 5) * 5
    const level =
        secs > mediumMins * 60
            ? 'red'
            : secs > lowMins * 60
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

    await Promise.all([
        // Embed form
        loadFormId().then(formId => {
            const url = `https://docs.google.com/forms/d/e/${formId}/viewform?embedded=true`
            document
                .querySelector('.next-feeding')
                .parentNode.insertAdjacentHTML(
                    'afterend',
                    `<iframe class="form" src="${url}" scrolling="no">Loading…</iframe>`
                )
        }),

        // Embed sheet
        loadSheetUrl().then((sheetUrl) => {
            sheetsLinkContainer.insertAdjacentHTML(
                'beforeend',
                `
            <a target="_blank" href="${sheetUrl}">
                Full stats in Google Sheet
            </a>`
            )
        }),
    ])

    const targetFeedingMinutes = (
        await db.collection('config').doc('targetFeedingMinutes').get()
    ).data().value

    // Load data from google sheet
    const data = await loadSheet(token, targetFeedingMinutes)

    // Render stats
    statsContainer.insertAdjacentHTML(
        'beforeend',
        `
        <h1>Feedings</h1>
        <div class="row">
            <p>Last few</p>
        </div>
        <div class="row" style="text-align: left;">
            ${calcLastFewFeeds(data.feedLatest8, targetFeedingMinutes)}
        </div>
        <br>
        <div class="row">
            <p>Today (since ${FIRST_HOUR_OF_DAY}am)<br><b>${data.feedCountToday
        }</b></p>
            <p>Last 24h<br><b>${data.feedCount24h}</b></p>
        </div>
        <br>
        <h1>Wet diapers</h1>
        <div class="row">
            <p>Latest<br><b>${data.diaperWetLatestTime?.date.toLocaleString()}</b></p>
            <p>Today (since ${FIRST_HOUR_OF_DAY}am)<br><b>${data.diaperWetCountToday
        }</b></p>
            <p>Last 24h<br><b>${data.diaperWetCount24h}</b></p>
        </div>
        <br>
        <h1>Soiled diapers</h1>
        <div class="row">
            <p>Latest<br><b>${data.diaperSoiledLatestTime?.date.toLocaleString()}</b></p>
            <p>Today (since ${FIRST_HOUR_OF_DAY}am)<br><b>${data.diaperSoiledCountToday
        }</b></p>
            <p>Last 24h<br><b>${data.diaperSoiledCount24h}</b></p>
        </div>
    `
    )

    // Start countdown to next feeding
    await setupCountdownToFeeding(
        document.querySelector('.next-feeding'),
        data.feedLatest.date,
        targetFeedingMinutes
    )
}

void main()
