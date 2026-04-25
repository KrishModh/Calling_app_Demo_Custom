import React, { useState, useEffect, useRef, useCallback } from 'react';
import Login        from './components/Login';
import Dashboard    from './components/Dashboard';
import CallScreen   from './components/CallScreen';
import IncomingCall from './components/IncomingCall';

import { connectSocket, disconnectSocket } from './services/socket';
import {
  fetchIceConfig,
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

export default function App() {
  const [currentUser,  setCurrentUser]  = useState(null);
  const [onlineUsers,  setOnlineUsers]  = useState([]);
  const [callState,    setCallState]    = useState('idle');
  const [callInfo,     setCallInfo]     = useState(null);
  const [isMuted,      setIsMuted]      = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const remoteAudioRef     = useRef(null);
  const remoteStreamRef    = useRef(null);
  const socketRef          = useRef(null);
  const processingOffer    = useRef(false);
  const processingAccepted = useRef(false);

  // ── Audio helpers ────────────────────────────────────────────────────────────
  const tryPlayAudio = useCallback(async (stream) => {
    const audio = remoteAudioRef.current;
    if (!audio || !stream) return;
    remoteStreamRef.current = stream;
    audio.srcObject = stream;
    audio.volume    = 1.0;
    audio.muted     = false;
    try {
      await audio.play();
      setAudioBlocked(false);
      console.log('[audio] playing ✅');
    } catch {
      console.warn('[audio] autoplay blocked — showing tap button');
      setAudioBlocked(true);
    }
  }, []);

  const handleUnblockAudio = useCallback(async () => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    if (remoteStreamRef.current) audio.srcObject = remoteStreamRef.current;
    audio.muted = false;
    try {
      await audio.play();
      setAudioBlocked(false);
    } catch (e) {
      console.error('[audio] still blocked:', e);
    }
  }, []);

  const onRemoteStream = useCallback((stream) => {
    console.log('[app] remote stream received, tracks:', stream.getTracks().length);
    tryPlayAudio(stream);
  }, [tryPlayAudio]);

  // Retry play when in-call state is reached (timing safety net)
  useEffect(() => {
    if (callState === 'in-call' && remoteStreamRef.current) {
      tryPlayAudio(remoteStreamRef.current);
    }
  }, [callState, tryPlayAudio]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  const cleanupCall = useCallback(() => {
    processingOffer.current    = false;
    processingAccepted.current = false;
    remoteStreamRef.current    = null;
    endWebRTCCall();
    const audio = remoteAudioRef.current;
    if (audio) { audio.pause(); audio.srcObject = null; }
    setCallState('idle');
    setCallInfo(null);
    setIsMuted(false);
    setAudioBlocked(false);
  }, []);

  // ── Build peer connection (shared helper) ─────────────────────────────────
  const buildPeerConnection = useCallback(async (targetId) => {
    const socket    = socketRef.current;
    const iceConfig = await fetchIceConfig();
    return createPeerConnection(
      iceConfig,
      (candidate) => socket.emit('ice-candidate', {
        candidate, targetId, senderId: socketRef.current?.userId,
      }),
      onRemoteStream,
    );
  }, [onRemoteStream]);

  // ── Socket wiring ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const socket = connectSocket(currentUser.id);
    socket.userId   = currentUser.id;
    socketRef.current = socket;

    socket.on('online-users', (ids) => setOnlineUsers(ids));

    socket.on('incoming-call', ({ callerId, callerName }) => {
      setCallState((prev) => {
        if (prev !== 'idle') return prev;
        setCallInfo({ peerId: callerId, peerName: callerName, direction: 'incoming' });
        return 'incoming';
      });
    });

    // CALLER: callee accepted → get ICE config → create offer
    socket.on('call-accepted', async ({ calleeId }) => {
      if (processingAccepted.current) return;
      processingAccepted.current = true;
      try {
        await getLocalStream();
        await buildPeerConnection(calleeId);
        const offer = await createOffer();
        socket.emit('webrtc-offer', { offer, targetId: calleeId, callerId: currentUser.id });
        setCallState('in-call');
      } catch (err) {
        console.error('[App] createOffer error:', err);
        alert('Microphone access denied or unavailable.');
        cleanupCall();
      }
    });

    socket.on('call-rejected', () => { alert('Call declined.'); cleanupCall(); });
    socket.on('call-failed',   ({ message }) => { alert(message); cleanupCall(); });

    // CALLEE: received offer → get ICE config → create answer
    socket.on('webrtc-offer', async ({ offer, callerId }) => {
      if (processingOffer.current) return;
      processingOffer.current = true;
      try {
        await getLocalStream();
        await buildPeerConnection(callerId);
        const answer = await createAnswer(offer);
        socket.emit('webrtc-answer', { answer, targetId: callerId, calleeId: currentUser.id });
        setCallState('in-call');
      } catch (err) {
        console.error('[App] createAnswer error:', err);
        alert('Microphone access denied or unavailable.');
        cleanupCall();
      }
    });

    socket.on('webrtc-answer', async ({ answer }) => {
      try { await setRemoteAnswer(answer); }
      catch (err) { console.error('[App] setRemoteAnswer:', err); }
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      await addIceCandidate(candidate);
    });

    socket.on('call-ended', () => cleanupCall());

    return () => {
      ['online-users','incoming-call','call-accepted','call-rejected',
       'call-failed','webrtc-offer','webrtc-answer','ice-candidate','call-ended']
        .forEach((e) => socket.off(e));
    };
  }, [currentUser, cleanupCall, buildPeerConnection]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleLogin  = (user) => setCurrentUser(user);
  const handleLogout = () => {
    cleanupCall(); disconnectSocket();
    setCurrentUser(null); setOnlineUsers([]);
  };

  const handleCallUser = (targetUser) => {
    const socket = socketRef.current;
    if (!socket) return;
    setCallState('calling');
    setCallInfo({ peerId: targetUser.id, peerName: targetUser.name, direction: 'outgoing' });
    socket.emit('call-request', {
      callerId: currentUser.id, callerName: currentUser.name, calleeId: targetUser.id,
    });
  };

  const handleAcceptCall = () => {
    const socket = socketRef.current;
    if (!socket || !callInfo) return;
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
    if (socket && callInfo?.peerId) socket.emit('call-ended', { targetId: callInfo.peerId });
    cleanupCall();
  };

  const handleToggleMute = () => {
    const nowEnabled = toggleMute();  // single call — returns true if mic ON
    setIsMuted(!nowEnabled);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!currentUser) return <Login onLogin={handleLogin} />;

  const otherUser = ALL_USERS.find((u) => u.id !== currentUser.id);

  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

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
          audioBlocked={audioBlocked}
          onToggleMute={handleToggleMute}
          onEndCall={handleEndCall}
          onUnblockAudio={handleUnblockAudio}
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