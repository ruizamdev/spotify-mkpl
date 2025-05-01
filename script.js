const CLIENT_ID = "9498125df88543fd836b796a9632389e";
const REDIRECT_URI = "";
const SCOPES = "user-library-read playlist-modify-public";
const TOKEN_KEY = "spotify_access_token";

// 1. Revisa si ya tenemos token
window.onload = function () {
  const hash = window.location.hash;
  if (hash) {
    const token = new URLSearchParams(hash.slice(1)).get("access_token");
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      window.location.hash = "";
    }
  }

  const token = localStorage.getItem(TOKEN_KEY);
  if(token) {
    document.getElementById("login-button").style.display = "none";
    document.getElementById("playlist-form").style.display = "block";
  }
};

// 2. Login con Spotify
document.getElementById("login-button").addEventListener("click", () => {
  const authUrl = `https://accounts.spotify.com/authorize?response_type=token&client_id=${CLIENT_ID}&scope=${encodeURIComponent()}`
})