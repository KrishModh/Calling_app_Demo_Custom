import React, { useState, useEffect, useRef, useCallback } from 'react';
import Login        from './components/Login';
import Dashboard    from './components/Dashboard';
import CallScreen   from './components/CallScreen';
import IncomingCall from './components/IncomingCall';

import { connectSocket, disconnectSocket } from './services/socket';
import {
  getLocalStream,
  createPeerConnection,
  createOffer,
  createAnswer,
  setRemoteAnswer,
  addIceCandidate,
  toggleMute,
  endCall as endWebRTCCall,
} from './services/webrtc';

const ALL_USERS = [
  { id: '1', name: 'User One' },
  { id: '2', name: 'User Two' },
];

// ── Call-state machine ────────────────────────────────────────────────────────
// 'idle'     → no call activity
// 'calling'  → we initiated, waiting for callee
// 'incoming' → someone is calling us
// 'in-call'  → audio connection live
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [onlineUsers, setOnlineUsers]  = useState([]);
  const [callState,   setCallState]    = useState('idle');
  const [callInfo,    setCallInfo]     = useState(null);
  const [isMuted,     setIsMuted]      = useState(false);

  const remoteAudioRef = useRef(null);
  const socketRef      = useRef(null);

  /**
   * Processing guards – prevent duplicate handling when React StrictMode
   * mounts effects twice, or when the signaling server relays an event twice.
   */
  const processingOffer    = useRef(false);
  const processingAccepted = useRef(false);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const getOtherUser = useCallback(() =>
    ALL_USERS.find((u) => u.id !== currentUser?.id),
  [currentUser]);

  const cleanupCall = useCallback(() => {
    processingOffer.current    = false;
    processingAccepted.current = false;
    endWebRTCCall();
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setCallState('idle');
    setCallInfo(null);
    setIsMuted(false);
  }, []);

  // ── Socket wiring ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser) return;

    const socket = connectSocket(currentUser.id);
    socketRef.current = socket;

    // ── 1. Presence ──────────────────────────────────────────────────────────
    socket.on('online-users', (ids) => setOnlineUsers(ids));

    // ── 2. Incoming call ─────────────────────────────────────────────────────
    socket.on('incoming-call', ({ callerId, callerName }) => {
      // Ignore if already in a call
      setCallState((prev) => {
        if (prev !== 'idle') return prev;
        setCallInfo({ peerId: callerId, peerName: callerName, direction: 'incoming' });
        return 'incoming';
      });
    });

    // ── 3a. CALLER: callee accepted → create & send offer ────────────────────
    socket.on('call-accepted', async ({ calleeId }) => {
      // Guard: only process once even if event fires twice
      if (processingAccepted.current) return;
      processingAccepted.current = true;

      try {
        await getLocalStream();
        createPeerConnection(
          (candidate) => socket.emit('ice-candidate', {
            candidate,
            targetId: calleeId,
            senderId: currentUser.id,
          }),
          (remoteStream) => {
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = remoteStream;
              remoteAudioRef.current.play().catch((e) =>
                console.warn('[App] audio.play():', e.message)
              );
            }
          },
        );
        const offer = await createOffer();
        socket.emit('webrtc-offer', { offer, targetId: calleeId, callerId: currentUser.id });
        setCallState('in-call');
      } catch (err) {
        console.error('[App] createOffer error:', err);
        alert('Microphone access denied or unavailable.');
        cleanupCall();
      }
    });

    // ── 3b. Call rejected ────────────────────────────────────────────────────
    socket.on('call-rejected', () => {
      alert('The other user declined the call.');
      cleanupCall();
    });

    socket.on('call-failed', ({ message }) => {
      alert(message);
      cleanupCall();
    });

    // ── 4. CALLEE: received offer → create & send answer ─────────────────────
    socket.on('webrtc-offer', async ({ offer, callerId }) => {
      // Guard: only process once
      if (processingOffer.current) return;
      processingOffer.current = true;

      try {
        await getLocalStream();
        createPeerConnection(
          (candidate) => socket.emit('ice-candidate', {
            candidate,
            targetId: callerId,
            senderId: currentUser.id,
          }),
          (remoteStream) => {
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = remoteStream;
              remoteAudioRef.current.play().catch((e) =>
                console.warn('[App] audio.play():', e.message)
              );
            }
          },
        );
        const answer = await createAnswer(offer);
        socket.emit('webrtc-answer', { answer, targetId: callerId, calleeId: currentUser.id });
        setCallState('in-call');
      } catch (err) {
        console.error('[App] createAnswer error:', err);
        alert('Microphone access denied or unavailable.');
        cleanupCall();
      }
    });

    // ── 5. CALLER: received answer ───────────────────────────────────────────
    socket.on('webrtc-answer', async ({ answer }) => {
      try {
        await setRemoteAnswer(answer);
      } catch (err) {
        console.error('[App] setRemoteAnswer error:', err);
      }
    });

    // ── 6. ICE candidates (buffered in webrtc.js if remoteDesc not set yet) ──
    socket.on('ice-candidate', async ({ candidate }) => {
      await addIceCandidate(candidate);
    });

    // ── 7. Peer ended ────────────────────────────────────────────────────────
    socket.on('call-ended', () => cleanupCall());

    return () => {
      socket.off('online-users');
      socket.off('incoming-call');
      socket.off('call-accepted');
      socket.off('call-rejected');
      socket.off('call-failed');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('ice-candidate');
      socket.off('call-ended');
    };
  }, [currentUser, cleanupCall]);

  // ── Event handlers ───────────────────────────────────────────────────────────

  const handleLogin = (user) => setCurrentUser(user);

  const handleLogout = () => {
    cleanupCall();
    disconnectSocket();
    setCurrentUser(null);
    setOnlineUsers([]);
  };

  const handleCallUser = (targetUser) => {
    const socket = socketRef.current;
    if (!socket) return;
    setCallState('calling');
    setCallInfo({ peerId: targetUser.id, peerName: targetUser.name, direction: 'outgoing' });
    socket.emit('call-request', {
      callerId:   currentUser.id,
      callerName: currentUser.name,
      calleeId:   targetUser.id,
    });
  };

  const handleAcceptCall = () => {
    const socket = socketRef.current;
    if (!socket || !callInfo) return;
    // Notify the caller; the webrtc-offer event will drive the rest
    socket.emit('call-accepted', { callerId: callInfo.peerId, calleeId: currentUser.id });
  };

  const handleRejectCall = () => {
    const socket = socketRef.current;
    if (!socket || !callInfo) return;
    socket.emit('call-rejected', { callerId: callInfo.peerId, calleeId: currentUser.id });
    cleanupCall();
  };

  const handleEndCall = () => {
    const socket = socketRef.current;
    if (socket && callInfo?.peerId) {
      socket.emit('call-ended', { targetId: callInfo.peerId });
    }
    cleanupCall();
  };

  const handleToggleMute = () => {
    const micEnabled = toggleMute();
    setIsMuted(!micEnabled);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const otherUser = getOtherUser();

  return (
    <>
      {/* Hidden audio element – plays the remote peer's audio stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {callState === 'incoming' && callInfo && (
        <IncomingCall
          callerName={callInfo.peerName}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}

      {(callState === 'calling' || callState === 'in-call') && callInfo && (
        <CallScreen
          callState={callState}
          peerName={callInfo.peerName}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onEndCall={handleEndCall}
        />
      )}

      {callState === 'idle' && (
        <Dashboard
          currentUser={currentUser}
          otherUser={otherUser}
          onlineUsers={onlineUsers}
          onCallUser={handleCallUser}
          onLogout={handleLogout}
        />
      )}
    </>
  );
}
