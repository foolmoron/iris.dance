const firebaseConfig = {
    apiKey: "AIzaSyDD0RbPzbeDAotBGeG557ILl4hX3AqYIMw",
    authDomain: "iris-tracker.firebaseapp.com",
    projectId: "iris-tracker",
    storageBucket: "iris-tracker.appspot.com",
    messagingSenderId: "1024924014821",
    appId: "1:1024924014821:web:a9e14262f3b76fa32f1c0c",
    clientId: '1024924014821-1qcohrsru7muo299tmn02tqku9sht871.apps.googleusercontent.com',
    discoveryDocs: [
        'https://sheets.googleapis.com/$discovery/rest?version=v4',
    ]
}
firebase.initializeApp(firebaseConfig)
const auth = firebase.auth()
const db = firebase.firestore()

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
        const res = await db.collection("config").doc("formEmbedId").get()
        return res.data().value
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
            "beforeend",
            `<iframe class="form" src="${url}">Loading…</iframe>`
        )
    }
}

void main()
