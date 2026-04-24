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

/**
 * Static user roster – mirrors server's ENV list.
 * id must match the ids returned by /api/auth/login.
 */
const ALL_USERS = [
  { id: '1', name: 'User One' },
  { id: '2', name: 'User Two' },
];

// ── Call-state machine ────────────────────────────────────────────────────────
// 'idle'     → no call activity
// 'calling'  → we initiated a call, waiting for callee to answer
// 'incoming' → someone is calling us
// 'in-call'  → audio connection established
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [onlineUsers, setOnlineUsers]  = useState([]);
  const [callState,   setCallState]    = useState('idle');

  /**
   * callInfo shape:
   *   { peerId: string, peerName: string, direction: 'outgoing' | 'incoming' }
   */
  const [callInfo, setCallInfo]  = useState(null);
  const [isMuted,  setIsMuted]   = useState(false);

  const remoteAudioRef = useRef(null);
  const socketRef      = useRef(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const getOtherUser = useCallback(() =>
    ALL_USERS.find((u) => u.id !== currentUser?.id),
  [currentUser]);

  /** Tear down WebRTC + reset UI state */
  const cleanupCall = useCallback(() => {
    endWebRTCCall();
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setCallState('idle');
    setCallInfo(null);
    setIsMuted(false);
  }, []);

  // ── Socket wiring (runs once per login) ─────────────────────────────────────

  useEffect(() => {
    if (!currentUser) return;

    const socket = connectSocket(currentUser.id);
    socketRef.current = socket;

    // ── 1. Presence ──────────────────────────────────────────────────────────
    socket.on('online-users', (ids) => setOnlineUsers(ids));

    // ── 2. Incoming call request ─────────────────────────────────────────────
    socket.on('incoming-call', ({ callerId, callerName }) => {
      setCallState('incoming');
      setCallInfo({ peerId: callerId, peerName: callerName, direction: 'incoming' });
    });

    // ── 3a. Our call was accepted → we are the CALLER; create + send offer ───
    socket.on('call-accepted', async ({ calleeId }) => {
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
              remoteAudioRef.current.play().catch(() => {});
            }
          },
        );
        const offer = await createOffer();
        socket.emit('webrtc-offer', { offer, targetId: calleeId, callerId: currentUser.id });
        setCallState('in-call');
      } catch (err) {
        console.error('[App] createOffer error:', err);
        alert('Could not access microphone. Please check browser permissions.');
        cleanupCall();
      }
    });

    // ── 3b. Call was rejected ────────────────────────────────────────────────
    socket.on('call-rejected', () => {
      alert('The other user declined the call.');
      cleanupCall();
    });

    socket.on('call-failed', ({ message }) => {
      alert(message);
      cleanupCall();
    });

    // ── 4. We are the CALLEE; received offer → create + send answer ──────────
    socket.on('webrtc-offer', async ({ offer, callerId }) => {
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
              remoteAudioRef.current.play().catch(() => {});
            }
          },
        );
        const answer = await createAnswer(offer);
        socket.emit('webrtc-answer', { answer, targetId: callerId, calleeId: currentUser.id });
        setCallState('in-call');
      } catch (err) {
        console.error('[App] createAnswer error:', err);
        alert('Could not access microphone. Please check browser permissions.');
        cleanupCall();
      }
    });

    // ── 5. We are the CALLER; received callee's answer ───────────────────────
    socket.on('webrtc-answer', async ({ answer }) => {
      try {
        await setRemoteAnswer(answer);
      } catch (err) {
        console.error('[App] setRemoteAnswer error:', err);
      }
    });

    // ── 6. ICE candidate from peer ───────────────────────────────────────────
    socket.on('ice-candidate', async ({ candidate }) => {
      await addIceCandidate(candidate);
    });

    // ── 7. Peer ended the call ───────────────────────────────────────────────
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
