import React, { useState, useEffect, useRef, useCallback } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import CallScreen from './components/CallScreen';
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

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [callState, setCallState] = useState('idle');
  const [callInfo, setCallInfo] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const remoteAudioRef = useRef(null);
  const remoteStreamRef = useRef(null); // store stream separately
  const socketRef = useRef(null);
  const processingOffer = useRef(false);
  const processingAccepted = useRef(false);

  // ── Try to play audio — retries if blocked ──────────────────────────────────
  const tryPlayAudio = useCallback(async (stream) => {
    const audio = remoteAudioRef.current;
    if (!audio) return;

    audio.srcObject = stream;
    audio.volume = 1.0;
    audio.muted = false;

    try {
      await audio.play();
      setAudioBlocked(false);
      console.log('[audio] playing ✅');
    } catch (err) {
      console.warn('[audio] autoplay blocked, waiting for user tap:', err.message);
      setAudioBlocked(true); // show "Tap to hear" button
    }
  }, []);

  // ── Manual play — called when user taps "Tap to hear" button ───────────────
  const handleUnblockAudio = useCallback(async () => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    if (remoteStreamRef.current) {
      audio.srcObject = remoteStreamRef.current;
    }
    try {
      await audio.play();
      setAudioBlocked(false);
    } catch (e) {
      console.error('[audio] still blocked:', e);
    }
  }, []);

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  const cleanupCall = useCallback(() => {
    processingOffer.current = false;
    processingAccepted.current = false;
    remoteStreamRef.current = null;
    endWebRTCCall();
    const audio = remoteAudioRef.current;
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    setCallState('idle');
    setCallInfo(null);
    setIsMuted(false);
    setAudioBlocked(false);
  }, []);

  // ── onTrack callback (stable ref) ──────────────────────────────────────────
  const onRemoteStream = useCallback((stream) => {
    console.log('[app] remote stream received, tracks:', stream.getTracks().length);
    remoteStreamRef.current = stream;
    tryPlayAudio(stream);
  }, [tryPlayAudio]);

  // ── When callState becomes in-call, retry playing (catches timing issues) ──
  useEffect(() => {
    if (callState === 'in-call' && remoteStreamRef.current) {
      tryPlayAudio(remoteStreamRef.current);
    }
  }, [callState, tryPlayAudio]);

  // ── Socket wiring ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    const socket = connectSocket(currentUser.id);
    socketRef.current = socket;

    socket.on('online-users', (ids) => setOnlineUsers(ids));

    socket.on('incoming-call', ({ callerId, callerName }) => {
      setCallState((prev) => {
        if (prev !== 'idle') return prev;
        setCallInfo({ peerId: callerId, peerName: callerName, direction: 'incoming' });
        return 'incoming';
      });
    });

    // CALLER: callee accepted → create offer
    socket.on('call-accepted', async ({ calleeId }) => {
      if (processingAccepted.current) return;
      processingAccepted.current = true;

      try {
        await getLocalStream();
        createPeerConnection(
          (candidate) => socket.emit('ice-candidate', {
            candidate, targetId: calleeId, senderId: currentUser.id,
          }),
          onRemoteStream,
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

    socket.on('call-rejected', () => {
      alert('The other user declined the call.');
      cleanupCall();
    });

    socket.on('call-failed', ({ message }) => {
      alert(message);
      cleanupCall();
    });

    // CALLEE: received offer → create answer
    socket.on('webrtc-offer', async ({ offer, callerId }) => {
      if (processingOffer.current) return;
      processingOffer.current = true;

      try {
        await getLocalStream();
        createPeerConnection(
          (candidate) => socket.emit('ice-candidate', {
            candidate, targetId: callerId, senderId: currentUser.id,
          }),
          onRemoteStream,
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

    socket.on('webrtc-answer', async ({ answer }) => {
      try {
        await setRemoteAnswer(answer);
      } catch (err) {
        console.error('[App] setRemoteAnswer error:', err);
      }
    });

    socket.on('ice-candidate', async ({ candidate }) => {
      await addIceCandidate(candidate);
    });

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
  }, [currentUser, cleanupCall, onRemoteStream]);

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
    if (socket && callInfo?.peerId) {
      socket.emit('call-ended', { targetId: callInfo.peerId });
    }
    cleanupCall();
  };

  const handleToggleMute = () => {
    setIsMuted(!toggleMute() === false);
    const micEnabled = toggleMute();
    setIsMuted(!micEnabled);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!currentUser) return <Login onLogin={handleLogin} />;

  const otherUser = ALL_USERS.find((u) => u.id !== currentUser.id);

  return (
    <>
      {/* Always in DOM — never unmount this element */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ display: 'none' }}
      />

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