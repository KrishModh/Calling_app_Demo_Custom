/**
 * webrtc.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrapper around the browser WebRTC API.
 *
 * Offer/Answer flow:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  CALLER                        CALLEE                   │
 *   │  ──────                        ──────                   │
 *   │  getLocalStream()              getLocalStream()          │
 *   │  createPeerConnection()        createPeerConnection()    │
 *   │  createOffer()                                          │
 *   │    └─ setLocalDescription                               │
 *   │    └─ send offer via signal ──────────────────────────► │
 *   │                               createAnswer(offer)       │
 *   │                                 └─ setRemoteDescription │
 *   │                                 └─ setLocalDescription  │
 *   │  ◄────────────────── send answer via signal ────────── │
 *   │  setRemoteAnswer(answer)                                │
 *   │                                                         │
 *   │  ◄──────────── ICE candidates exchanged both ways ───► │
 *   └─────────────────────────────────────────────────────────┘
 */

/** Free STUN servers – enough for LAN + most NAT scenarios */
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

/** @type {RTCPeerConnection | null} */
let peerConnection = null;

/** @type {MediaStream | null} */
let localStream = null;

// ── Media ─────────────────────────────────────────────────────────────────────

/**
 * Request microphone access.
 * @returns {Promise<MediaStream>}
 */
export const getLocalStream = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });
  return localStream;
};

// ── Peer Connection ───────────────────────────────────────────────────────────

/**
 * Create an RTCPeerConnection and attach the local audio track.
 *
 * @param {(candidate: RTCIceCandidate) => void} onIceCandidate
 *   Called whenever a local ICE candidate is gathered; forward it via signaling.
 *
 * @param {(stream: MediaStream) => void} onRemoteStream
 *   Called when remote audio arrives; attach to an <audio> element.
 *
 * @returns {RTCPeerConnection}
 */
export const createPeerConnection = (onIceCandidate, onRemoteStream) => {
  peerConnection = new RTCPeerConnection(ICE_CONFIG);

  // Forward local ICE candidates to peer via signaling server
  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) onIceCandidate(candidate);
  };

  // Play incoming audio as soon as the remote track arrives
  peerConnection.ontrack = ({ streams }) => {
    if (streams?.[0]) onRemoteStream(streams[0]);
  };

  // Add local audio tracks so the peer can hear us
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }

  return peerConnection;
};

// ── Offer / Answer ────────────────────────────────────────────────────────────

/**
 * (Caller) Create an SDP offer and set it as the local description.
 * @returns {Promise<RTCSessionDescriptionInit>}
 */
export const createOffer = async () => {
  if (!peerConnection) throw new Error('createPeerConnection() must be called first.');
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  return offer;
};

/**
 * (Callee) Set the remote offer and create a matching SDP answer.
 * @param {RTCSessionDescriptionInit} offer
 * @returns {Promise<RTCSessionDescriptionInit>}
 */
export const createAnswer = async (offer) => {
  if (!peerConnection) throw new Error('createPeerConnection() must be called first.');
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  return answer;
};

/**
 * (Caller) Apply the callee's SDP answer.
 * @param {RTCSessionDescriptionInit} answer
 */
export const setRemoteAnswer = async (answer) => {
  if (!peerConnection) throw new Error('No active peer connection.');
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
};

// ── ICE ───────────────────────────────────────────────────────────────────────

/**
 * Add a remote ICE candidate forwarded by the signaling server.
 * @param {RTCIceCandidateInit} candidate
 */
export const addIceCandidate = async (candidate) => {
  if (!peerConnection) return;
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    // Can safely ignore "Cannot add ICE candidate" on closed connections
    console.warn('[webrtc] addIceCandidate error (ignorable):', err.message);
  }
};

// ── Controls ──────────────────────────────────────────────────────────────────

/**
 * Toggle microphone mute state.
 * @returns {boolean} `true` if the mic is now ENABLED (unmuted)
 */
export const toggleMute = () => {
  if (!localStream) return true;
  const [track] = localStream.getAudioTracks();
  if (!track) return true;
  track.enabled = !track.enabled;
  return track.enabled;
};

/**
 * Stop local media and close the peer connection.
 * Call this when a call ends for any reason.
 */
export const endCall = () => {
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
};
