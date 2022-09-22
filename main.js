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

const timersContainer = document.querySelector('.timers')

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
            datetime: new Date((row[1] || row[0]).replace('/0022 ', '/2022 ')),
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
        data.sort((a, b) => a.datetime - b.datetime)

        // Stats
        const sevenAM = new Date().setHours(7, 0, 0, 0)
        const past24h = Date.now() - 24 * 60 * 60 * 1000
        const feedLatest = data.findLast((d) => d.feed)
        const feedCountToday = data.filter(
            (d) => d.feed && d.datetime > sevenAM
        ).length
        const feedCount24h = data.filter(
            (d) => d.feed && d.datetime > past24h
        ).length
        const diaperWetLatestTime = data.findLast((d) => d.diaper?.wet)
        const diaperWetCountToday = data.filter(
            (d) => d.diaper?.wet && d.datetime > sevenAM
        ).length
        const diaperWetCount24h = data.filter(
            (d) => d.diaper?.wet && d.datetime > past24h
        ).length
        const diaperSoiledLatestTime = data.findLast((d) => d.diaper?.soiled)
        const diaperSoiledCountToday = data.filter(
            (d) => d.diaper?.soiled && d.datetime > sevenAM
        ).length
        const diaperSoiledCount24h = data.filter(
            (d) => d.diaper?.soiled && d.datetime > past24h
        ).length

        // Time to next feeding
        const maxFeedingMinutes = (
            await db.collection('config').doc('maxFeedingMinutes').get()
        ).data().value
        const secondsSinceLastFeeding =
            (Date.now() - (feedLatest?.datetime ?? 0)) / 1000
        const secondsToNextFeeding =
            maxFeedingMinutes * 60 - secondsSinceLastFeeding

        return {
            feedLatest,
            feedCountToday,
            feedCount24h,
            diaperWetLatestTime,
            diaperWetCountToday,
            diaperWetCount24h,
            diaperSoiledLatestTime,
            diaperSoiledCountToday,
            diaperSoiledCount24h,
            secondsToNextFeeding
        }
    } catch (e) {
        console.error(e)
        alert(e.message)
    }
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

    const data = await loadSheet(token)
    timersContainer.insertAdjacentHTML('beforeend', `${JSON.stringify(data)}`)
}

void main()
