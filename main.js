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

async function loadSheet(key) {
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
        const feedLatest5 = data
            .filter((d) => d.feed)
            .slice(-5)
            .reverse()
        const feedLatest = feedLatest5[0]
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

        // Time to next feeding
        const maxFeedingMinutes = (
            await db.collection('config').doc('maxFeedingMinutes').get()
        ).data().value
        const secondsSinceLastFeeding =
            (Date.now() - (feedLatest?.date ?? 0)) / 1000
        const secondsToNextFeeding = Math.floor(
            maxFeedingMinutes * 60 - secondsSinceLastFeeding
        )

        return {
            feedLatest5,
            feedCountToday,
            feedCount24h,
            diaperWetLatestTime,
            diaperWetCountToday,
            diaperWetCount24h,
            diaperSoiledLatestTime,
            diaperSoiledCountToday,
            diaperSoiledCount24h,
            secondsToNextFeeding,
        }
    } catch (e) {
        console.error(e)
        alert(e.message)
    }
}

async function setupCountdownToFeeding(el, secs) {
    secs = Math.max(0, secs)
    const hours = Math.floor(secs / 3600)
    const minutes = Math.floor((secs % 3600) / 60)
    const seconds = secs % 60
    el.textContent = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`
    if (secs > 0) {
        setTimeout(() => setupCountdownToFeeding(el, secs - 1), 1000)
    }

    const level = secs > 60 * 60 ? 'green' : secs > 60 * 15 ? 'orange' : 'red'
    el.classList.remove('green', 'orange', 'red')
    el.classList.add(level)
}

async function main() {
    const user = await loadUser()
    if (!user) {
        return
    }
    const token = await user.getIdToken()

    const formId = await loadFormId()
    if (formId) {
        const url = `https://docs.google.com/forms/d/e/${formId}/viewform?embedded=true`
        document.body.insertAdjacentHTML(
            'beforeend',
            `<iframe class="form" src="${url}">Loading…</iframe>`
        )
    }

    const sheetUrl = await loadSheetUrl()
    if (sheetUrl) {
        sheetsLinkContainer.insertAdjacentHTML(
            'beforeend',
            `
        <a target="_blank" href="${sheetUrl}">
            Full stats in Google Sheet
        </a>`
        )
    }

    // Load data from google sheet
    const data = await loadSheet(token)

    // Render stats
    const lastFewFeeds = data.feedLatest5
        .map(
            (i) =>
                `${i.date.toLocaleString()} - ${[
                    i.feed.left && 'Left',
                    i.feed.right && 'Right',
                    i.feed.bottle && 'Bottle',
                ]
                    .filter(Boolean)
                    .join(', ')}`
        )
        .join('<br>')
    statsContainer.insertAdjacentHTML(
        'beforeend',
        `
        <h1>Time to next feeding</h1>
        <div class="row">
            <p class="next-feeding"></p>
        </div>
        <br>
        <h1>Feedings</h1>
        <div class="row">
            <p>Last few</p>
        </div>
        <div class="row" style="text-align: left;">
            <b>${lastFewFeeds}</b>
        </div>
        <br>
        <div class="row">
            <p>Today (since ${FIRST_HOUR_OF_DAY}am)<br><b>${
            data.feedCountToday
        }</b></p>
            <p>Last 24h<br><b>${data.feedCount24h}</b></p>
        </div>
        <br>
        <h1>Wet diapers</h1>
        <div class="row">
            <p>Latest<br><b>${data.diaperWetLatestTime?.date.toLocaleString()}</b></p>
            <p>Today (since ${FIRST_HOUR_OF_DAY}am)<br><b>${
            data.diaperWetCountToday
        }</b></p>
            <p>Last 24h<br><b>${data.diaperWetCount24h}</b></p>
        </div>
        <br>
        <h1>Soiled diapers</h1>
        <div class="row">
            <p>Latest<br><b>${data.diaperSoiledLatestTime?.date.toLocaleString()}</b></p>
            <p>Today (since ${FIRST_HOUR_OF_DAY}am)<br><b>${
            data.diaperSoiledCountToday
        }</b></p>
            <p>Last 24h<br><b>${data.diaperSoiledCount24h}</b></p>
        </div>
    `
    )

    // Start countdown to next feeding
    await setupCountdownToFeeding(
        document.querySelector('.next-feeding'),
        data.secondsToNextFeeding
    )
}

void main()
