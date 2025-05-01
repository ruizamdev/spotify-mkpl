const CLIENT_ID = "9498125df88543fd836b796a9632389e";
const REDIRECT_URI = "https://ruizamdev.github.io/spotify-mkpl/";
const SCOPES = "user-library-read playlist-modify-public";
const TOKEN_KEY = "spotify_access_token";

// 0
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}


// 1. Revisa si ya tenemos token
window.onload = async function () {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  if(code) {
    const codeVerifier = localStorage.getItem("code_verifier");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier
    });
    
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    const data = await response.json();
    const token = data.acces_token;
    localStorage.setItem(TOKEN_KEY, token);
    window.history.replaceState({}, document.title, "/");

    document.getElementById("login-button").style.display = "none";
    document.getElementById("playlist-form").style.display = "block";
  } else {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      document.getElementById("login-button").style.display = "none";
      document.getElementById("playlist-form").style.display = "block";
    }
  }
};

// 2. Login con Spotify
document.getElementById("login-button").addEventListener("click", async () => {
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  localStorage.setItem("code_verifier", codeVerifier);

  const args = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: codeChallenge
  });

  window.location = `https://accounts.spotify.com/authorize?${args.toString()}`;
})

// 3. Obtenemos User liked songs
async function getLikedSongs(maxTracks = 1000) {
  const token = localstorage.getItem(TOKEN_KEY);
  let allTracks = [];
  let offset = 0;
  const limit = 50;

  while (offset < maxTracks) {
    const response = await fetch(`https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error("Error al obtener canciones favoritas en el offset:", offset);
      break;
    }

    const data = await response.json();
    if (data.items.length === 0) break;

    const tracks = data.items.map(item => ({
      name: item.track.name,
      artist: item.track.artists[0].name,
      id: item.track.id
    }));

    allTracks = allTracks.concat(tracks);
    offset += limit;
  }
  return allTracks;
}

// 4. Conectamos con el formulario
document.getElementById("playlist-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const source = document.getElementById("source").value;
  const prompt = document.getElementById("prompt").value;
  const output = document.getElementById("output");

  output.textContent = "Obteniendo canciones...";
  
  let tracks = [];

  if (source === "liked") {
    tracks = await getLikedSongs();
  } else {
    output.textContent = "Aun no implementamos la opción de búsqueda global";
    return;
  }

  if (tracks.length === 0) {
    output.textContent = "No se encontraron canciones";
    return;
  }

  // Enviamos a ChatGPT
  output.textContent = "Enviando a ChatGPT...";

  const gptResult = await fetchFromGPT(prompt, tracks);
  if (!gptResult || !gptResult.tracks || gptResult.tracks.length === 0) {
    output.textContent = "❌ GPT no devolvió una playlist válida.";
    return;
  }

  output.textContent = "🎧 Creando playlist en Spotify...";

  const playlistUrl = await createPlaylist(gptResult.playlist_name, gptResult.tracks);
  output.innerHTML = `✅ Playlist creada: <a href="${playlistUrl}" target="_blank">${gptResult.playlist_name}</a>`;
})

// 5. Hablar con ChatGPT
async function fetchFromGPT(prompt, tracks) {
  const apiKey = document.getElementById("apiKey").value.trim();
  const content = `
Tu tarea es generar una nueva playlist en formato JSON.

Usa este prompt del usuario como guía para agrupar las canciones:
"${prompt}"

Aquí están las canciones del usuario:
${tracks.map(t => `- ${t.name} - ${t.artist} - ID: ${t.id}`).join("\n")}

Devuelve solo un JSON con el nombre y un array de IDs así:
{
  "playlist_name": "Nombre sugerido",
  "tracks": ["id1", "id2", "id3"]
}
  `.trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: [{ role: "user", content }],
      temperature: 0.7
    })
  });

  const data = await response.json();
  const contentText = data.choices?.[0]?.message?.content || "";

  try {
    const parsed = JSON.parse(contentText);
    return parsed;
  } catch (e) {
    console.error("Error al parsear JSON de GPT:", contentText);
    return null;
  }
}

// 6. Creamos la playlist
async function createPlaylist(name, trackIds) {
  const token = localStorage.getItem("spotify_access_token");

  // Obtener ID del usuario
  const userRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const user = await userRes.json();

  // Crear playlist
  const playlistRes = await fetch(`https://api.spotify.com/v1/users/${user.id}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: name,
      description: "Generada con IA vía Playlist Miner 🤖",
      public: true
    })
  });

  const playlist = await playlistRes.json();

  // Añadir tracks en bloques de 100 (Spotify limit)
  for (let i = 0; i < trackIds.length; i += 100) {
    const batch = trackIds.slice(i, i + 100);
    await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        uris: batch.map(id => `spotify:track:${id}`)
      })
    });
  }

  return playlist.external_urls.spotify;
}