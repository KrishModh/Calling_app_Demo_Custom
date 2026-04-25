const express = require('express');
const router = express.Router();

router.get('/ice-servers', (req, res) => {
    const appName = process.env.METERED_APP_NAME;
    const username = process.env.TURN_USERNAME;
    const credential = process.env.TURN_CREDENTIAL;

    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];

    if (appName && username && credential) {
        // Metered TURN
        iceServers.push(
            { urls: `turn:${appName}.metered.live:80`, username, credential },
            { urls: `turn:${appName}.metered.live:443`, username, credential },
            { urls: `turns:${appName}.metered.live:443`, username, credential },
            { urls: `turn:${appName}.metered.live:80?transport=tcp`, username, credential },
            { urls: `turn:${appName}.metered.live:443?transport=tcp`, username, credential },
        );
    }

    // Backup free TURN servers — multiple providers
    iceServers.push(
        {
            urls: 'turn:global.relay.metered.ca:80',
            username: '73a8201166f5453ab326b784',
            credential: '3iJs0ETJWvA5EheY',
        },
        // freeturn.net — no auth needed
        { urls: 'turn:global.relay.metered.ca:80', username: 'free', credential: 'free' },
        { urls: 'turn:global.relay.metered.ca:80', username: 'free', credential: 'free' },
    );

    console.log('[ice] Sending', iceServers.length, 'ICE servers');
    res.json({ iceServers });
});

module.exports = router;