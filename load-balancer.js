const express = require('express');
const axios = require('axios');

const app = express();

const BE_SERVERS = [
    'http://localhost:8001',
    'http://localhost:8002'
];

let currentIdx = 0;


function getNextServer() {
    currentIdx = ++currentIdx % BE_SERVERS.length;
    return BE_SERVERS[currentIdx];
}


async function healthCheck() {
    // Loop through servers and health check each one
    for (let i = 0; i < BE_SERVERS.length; i++) {
        const result = await axios.get(BE_SERVERS[i] + '/health');

        if (result.status !== 200) {
            BE_SERVERS.splice(i--, 1);
        }
    }

    // Add servers back once they become available
    setInterval(async () => {
        let serverAdded = false;

        for (let i = 0; i < BE_SERVERS.length; i++) {
            const result = await axios.get(BE_SERVERS[i] + '/health');

            if (result.staus === 200 && !BE_SERVERS.includes(BE_SERVERS[i])) {
                BE_SERVERS.push(BE_SERVERS[i]);
                serverAdded = true;
            }
        }

        if (serverAdded) {
            console.log('Server added back to pool');
        }
    }, 5000);
}

//
healthCheck();

//
// Log Requests

app.use((req, res, next) => {
    console.log(`${req.method} request to ${req.url}`);
    next();
});


// handler for incoming requests
app.get('*', async (req, res) => {
    const server = getNextServer();

    // forward request
    try {
        const result = await axios.get(server + req.url);
        res.status(result.status).send(result.data);
    }
    catch (error) {
        res.status(500).send('Failed to connect to Backend');
    }
});


//
// listen on port
app.listen(80, () => {
    console.log('Load Balancer running on PORT 80');
});



