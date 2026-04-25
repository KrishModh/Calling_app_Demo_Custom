const express = require('express');
const router  = express.Router();

router.get('/ice-servers', (req, res) => {
  const appName    = process.env.METERED_APP_NAME;
  const username   = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  if (appName && username && credential) {
    // Metered TURN — multiple ports/protocols for maximum compatibility
    iceServers.push(
      { urls: `turn:${appName}.metered.live:80`,             username, credential },
      { urls: `turn:${appName}.metered.live:443`,            username, credential },
      { urls: `turns:${appName}.metered.live:443`,           username, credential },
      { urls: `turn:${appName}.metered.live:80?transport=tcp`,  username, credential },
      { urls: `turn:${appName}.metered.live:443?transport=tcp`, username, credential },
    );
    console.log('[ice] TURN config ready — app:', appName);
  } else {
    console.warn('[ice] TURN env vars missing! METERED_APP_NAME / TURN_USERNAME / TURN_CREDENTIAL');
  }

  console.log('[ice] Sending', iceServers.length, 'ICE servers to client');
  res.json({ iceServers });
});

module.exports = router;