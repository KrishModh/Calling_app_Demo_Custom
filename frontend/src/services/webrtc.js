const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

let peerConnection     = null;
let localStream        = null;
let iceCandidateBuffer = [];
let remoteDescSet      = false;

// ── Fetch ICE config from server ──────────────────────────────────────────────
export const fetchIceConfig = async () => {
  try {
    const res  = await fetch(`${SERVER_URL}/api/ice-servers`);
    const data = await res.json();
    console.log('[webrtc] ICE servers received:', JSON.stringify(data.iceServers));
    return data;
  } catch (err) {
    console.warn('[webrtc] ICE fetch failed, STUN only:', err.message);
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  }
};

// ── Media ─────────────────────────────────────────────────────────────────────
export const getLocalStream = async () => {
  if (localStream && localStream.active) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  console.log('[webrtc] local mic tracks:', localStream.getAudioTracks().length);
  return localStream;
};

// ── Peer Connection ───────────────────────────────────────────────────────────
export const createPeerConnection = (iceConfig, onIceCandidate, onRemoteStream) => {
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  iceCandidateBuffer = [];
  remoteDescSet      = false;

  console.log('[webrtc] Creating PC with', iceConfig.iceServers?.length, 'ICE servers');

  peerConnection = new RTCPeerConnection({
    iceServers:          iceConfig.iceServers,
    iceCandidatePoolSize: 10,
  });

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) {
      console.log('[webrtc] local ICE candidate:', candidate.type, candidate.protocol);
      onIceCandidate(candidate);
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    const state = peerConnection?.iceConnectionState;
    console.log('[webrtc] ICE state:', state);
    // 'connected' or 'completed' = audio should flow
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('[webrtc] Connection state:', peerConnection?.connectionState);
  };

  // ── Remote audio track handler ──────────────────────────────────────────────
  peerConnection.ontrack = ({ streams, track }) => {
    console.log('[webrtc] ontrack — kind:', track.kind, '| muted:', track.muted, '| enabled:', track.enabled);

    if (!streams || !streams[0]) {
      console.warn('[webrtc] ontrack fired but no stream!');
      return;
    }

    const stream = streams[0];

    // Ensure track is enabled
    track.enabled = true;

    const deliver = () => {
      console.log('[webrtc] delivering remote stream, tracks:', stream.getTracks().length);
      onRemoteStream(stream);
    };

    if (!track.muted) {
      deliver();
    } else {
      // Track muted initially — wait for unmute (media flowing)
      track.addEventListener('unmute', () => {
        console.log('[webrtc] track unmuted');
        deliver();
      }, { once: true });

      // Fallback: deliver after 800ms even if unmute didn't fire
      setTimeout(deliver, 800);
    }
  };

  // Add local mic tracks
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      console.log('[webrtc] adding local track:', track.kind, track.label);
      peerConnection.addTrack(track, localStream);
    });
  } else {
    console.warn('[webrtc] createPeerConnection called but localStream is null!');
  }

  return peerConnection;
};

// ── Offer ─────────────────────────────────────────────────────────────────────
export const createOffer = async () => {
  if (!peerConnection) throw new Error('No peer connection');
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  return offer;
};

// ── Answer ────────────────────────────────────────────────────────────────────
export const createAnswer = async (offer) => {
  if (!peerConnection) throw new Error('No peer connection');
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  remoteDescSet = true;
  await _flushBuffer();
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  return answer;
};

export const setRemoteAnswer = async (answer) => {
  if (!peerConnection) throw new Error('No peer connection');
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  remoteDescSet = true;
  await _flushBuffer();
};

// ── ICE buffering ─────────────────────────────────────────────────────────────
export const addIceCandidate = async (candidate) => {
  if (!peerConnection) return;
  if (!remoteDescSet) {
    iceCandidateBuffer.push(candidate);
    return;
  }
  await _apply(candidate);
};

const _flushBuffer = async () => {
  const buf = [...iceCandidateBuffer];
  iceCandidateBuffer = [];
  for (const c of buf) await _apply(c);
};

const _apply = async (candidate) => {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.warn('[webrtc] addIceCandidate (ignorable):', e.message);
  }
};

// ── Controls ──────────────────────────────────────────────────────────────────
export const toggleMute = () => {
  if (!localStream) return true;
  const [track] = localStream.getAudioTracks();
  if (!track) return true;
  track.enabled = !track.enabled;
  return track.enabled;
};

export const endCall = () => {
  iceCandidateBuffer = [];
  remoteDescSet = false;
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
};