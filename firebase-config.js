<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyDje_kdhHmQ7uwj79fXme9tsYfp8EBnUy8",
    authDomain: "coletanea-icnv.firebaseapp.com",
    databaseURL: "https://coletanea-icnv-default-rtdb.firebaseio.com",
    projectId: "coletanea-icnv",
    storageBucket: "coletanea-icnv.firebasestorage.app",
    messagingSenderId: "294474693479",
    appId: "1:294474693479:web:4cdc28ae36e93e4902cdc2",
    measurementId: "G-L9DB3DJ710"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>
