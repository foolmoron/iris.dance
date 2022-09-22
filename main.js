async function loadUser() {
    const provider = new firebase.auth.GoogleAuthProvider()

    try {
        const cachedUser = await new Promise((resolve) => {
            firebase.auth().onAuthStateChanged(resolve);
        });
        if (cachedUser) {
            return cachedUser
        }
    } catch(e) {
        // pass
    }

    try {
        const res = await firebase.auth().getRedirectResult()
        if (res.user) {
            return res.user
        }
    } catch(e) {
        // pass
    }

    // No existing auth, try to sign in
    await firebase.auth().signInWithRedirect(provider)
}

async function initFirebase() {
    const firebaseConfig = {
        apiKey: "AIzaSyDD0RbPzbeDAotBGeG557ILl4hX3AqYIMw",
        authDomain: "iris-tracker.firebaseapp.com",
        projectId: "iris-tracker",
        storageBucket: "iris-tracker.appspot.com",
        messagingSenderId: "1024924014821",
        appId: "1:1024924014821:web:a9e14262f3b76fa32f1c0c",
    }
    firebase.initializeApp(firebaseConfig)
}

async function main() {
    await initFirebase()

    const user = await loadUser()
    if (!user) {
        return
    }
    const token = await user.getIdToken()

    document.body.insertAdjacentHTML('beforebegin', `<p>TOKEN: ${token}</p>`)
    document.body.insertAdjacentHTML('beforebegin', `<p>USER: ${JSON.stringify(user, undefined, 4)}</p>`)
}

void main()