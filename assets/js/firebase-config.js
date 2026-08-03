/* ============================================
   FIREBASE — só Auth + Firestore (sem Storage)
   Altere SÓ o firebaseConfig com os dados do
   SEU projeto (Console → ⚙️ → Seus apps)
   ============================================ */

  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyAKLnQM3JDXHO2YtqXc5WLcCU9yjrrXcmc",
    authDomain: "galeria-virtual-v2.firebaseapp.com",
    projectId: "galeria-virtual-v2",
    storageBucket: "galeria-virtual-v2.firebasestorage.app",
    messagingSenderId: "1095049105344",
    appId: "1:1095049105344:web:d1f710c50b8ebccb030225"
  };

const COL_GALERIAS = "galerias";
const COL_CLIENTES = "clientes";

let auth = null;
let db = null;

if (typeof firebase === "undefined") {
  console.error("[Galeria] SDK Firebase não carregou.");
} else {
  try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    auth = firebase.auth ? firebase.auth() : null;
    db = firebase.firestore ? firebase.firestore() : null;

    console.log("Firebase OK");
} catch(e){
    console.error(e);
}
}
