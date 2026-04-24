# 📞 VoiceCall Demo

A full-stack **WebRTC + Socket.IO** voice-calling demo with React (Vite) frontend
and Node.js + Express backend. No third-party calling SDKs — everything is custom.

---

## 🗂 Project Structure

```
voicecall-demo/
├── client/                   React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Login.jsx         Login form
│   │   │   ├── Dashboard.jsx     Contact list + presence
│   │   │   ├── CallScreen.jsx    Active / outgoing call UI
│   │   │   └── IncomingCall.jsx  Incoming call overlay
│   │   ├── services/
│   │   │   ├── socket.js         Socket.IO singleton
│   │   │   └── webrtc.js         RTCPeerConnection helpers
│   │   ├── styles/
│   │   │   ├── global.css
│   │   │   ├── login.css
│   │   │   ├── dashboard.css
│   │   │   └── call.css
│   │   ├── App.jsx               Root state machine + event wiring
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/
│   ├── controllers/
│   │   └── authController.js     Login / logout handlers
│   ├── routes/
│   │   └── authRoutes.js
│   ├── socket/
│   │   └── signaling.js          All Socket.IO signaling logic
│   ├── app.js                    Express setup
│   ├── server.js                 HTTP + Socket.IO bootstrap
│   └── package.json
│
├── .env.example                  Reference for all env vars
└── package.json                  Root scripts (concurrently)
```

---

## ⚙️ Setup Instructions

### 1. Clone / extract the project

```bash
cd voicecall-demo
```

### 2. Configure environment variables

**Server** — edit `server/.env`:
```
PORT=5000
USER1_EMAIL=test1@gmail.com
USER1_PASSWORD=123456
USER2_EMAIL=test2@gmail.com
USER2_PASSWORD=123456
CLIENT_URL=http://localhost:5173
```

**Client** — edit `client/.env`:
```
VITE_SERVER_URL=http://localhost:5000
```

### 3. Install all dependencies

```bash
# From the project root:
npm run install:all
```

Or manually:
```bash
npm install                 # root (concurrently)
cd client && npm install
cd ../server && npm install
```

### 4. Run both servers

```bash
# From root — starts server + client in parallel
npm run dev
```

Or separately:
```bash
# Terminal 1
cd server && npm run dev    # nodemon, port 5000

# Terminal 2
cd client && npm run dev    # Vite, port 5173
```

### 5. Open two browser windows

| Window | URL                        | Login as           |
|--------|----------------------------|--------------------|
| A      | http://localhost:5173      | test1@gmail.com    |
| B      | http://localhost:5173      | test2@gmail.com    |

> Both tabs **must** be open for the call button to be active (presence tracking).

---

## 🔐 Authentication

Credentials live entirely in environment variables — **nothing is hardcoded**.

`server/.env` supplies `USER1_EMAIL`, `USER1_PASSWORD`, `USER2_EMAIL`, `USER2_PASSWORD`.

The server reads them at startup via `dotenv`. Login is a simple `POST /api/auth/login`
that returns `{ user: { id, name, email } }`. No JWT, no sessions — the client stores
the user object in React state. Logging out disconnects the socket and clears state.

---

## 🔌 Socket.IO Events Reference

| Emitter → Direction → Receiver | Event              | Payload                                  |
|--------------------------------|--------------------|------------------------------------------|
| Client → Server                | `register`         | `userId`                                 |
| Server → All clients           | `online-users`     | `string[]` (array of online userIds)     |
| Caller → Server → Callee       | `call-request`     | `{ callerId, callerName, calleeId }`     |
| Callee → Server → Caller       | `call-accepted`    | `{ callerId, calleeId }`                 |
| Callee → Server → Caller       | `call-rejected`    | `{ callerId, calleeId }`                 |
| Server → Caller                | `call-failed`      | `{ message }`                            |
| Callee → Server → Caller       | `incoming-call`    | `{ callerId, callerName }`               |
| Caller → Server → Callee       | `webrtc-offer`     | `{ offer, targetId, callerId }`          |
| Callee → Server → Caller       | `webrtc-answer`    | `{ answer, targetId, calleeId }`         |
| Either → Server → Peer         | `ice-candidate`    | `{ candidate, targetId, senderId }`      |
| Either → Server → Peer         | `call-ended`       | `{ targetId }`                           |

---

## 🎙️ WebRTC Flow

```
CALLER                          SIGNALING SERVER                   CALLEE
  │                                    │                              │
  │── call-request ──────────────────►│── incoming-call ────────────►│
  │                                    │                              │
  │                                    │◄─── call-accepted ───────────│
  │◄─── call-accepted ─────────────────│                              │
  │                                    │                              │
  │  getLocalStream()                  │            getLocalStream()  │
  │  createPeerConnection()            │       createPeerConnection() │
  │  createOffer()                     │                              │
  │    setLocalDescription(offer)      │                              │
  │── webrtc-offer ──────────────────►│── webrtc-offer ─────────────►│
  │                                    │    setRemoteDescription()    │
  │                                    │    createAnswer()            │
  │                                    │    setLocalDescription()     │
  │◄── webrtc-answer ──────────────────│◄── webrtc-answer ────────────│
  │  setRemoteDescription(answer)      │                              │
  │                                    │                              │
  │◄══ ice-candidate ════════════════►│◄══ ice-candidate ═══════════►│
  │                                    │  (relayed both directions)   │
  │                                    │                              │
  │◄══════════════ Audio streams ══════════════════════════════════════│
```

### Key steps explained

1. **getLocalStream** — calls `getUserMedia({ audio: true })` to capture the microphone.
2. **createPeerConnection** — creates `RTCPeerConnection` with Google STUN servers.
   Attaches the local audio track so the peer can hear us.
3. **createOffer / createAnswer** — generates SDP (Session Description Protocol) that
   describes the media capabilities (codec, bitrate, etc.).
4. **ICE candidates** — the browser discovers possible network paths (local IP,
   STUN-reflected public IP). Each candidate is forwarded via Socket.IO to the peer,
   who adds them with `addIceCandidate()`.
5. **ontrack** — fires on the callee's `RTCPeerConnection` when the caller's audio
   arrives. We attach the `MediaStream` to a hidden `<audio>` element and call `.play()`.

---

## 🎨 UI Features

- Dark glassmorphism theme — pure CSS variables, no UI libraries
- Animated sound wave during active call
- Pulsing ring animation on incoming call overlay
- Presence dots — green = online, grey = offline
- Live call timer (MM:SS)
- Mute / Unmute toggle with visual feedback

---

## 🚫 Restrictions honoured

- No Twilio, Agora, Firebase, or any third-party calling SDK
- No MongoDB (no persistent data needed)
- No hardcoded credentials
- No Tailwind or Bootstrap
