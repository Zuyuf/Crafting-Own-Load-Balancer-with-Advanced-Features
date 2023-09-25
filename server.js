const express = require('express');

const app = express();

app.get('/', (req, res) => {
    res.send(`Hello from server ${process.env.PORT}`);
});

app.get('/health', (req, res) => {
    res.status(200).send(`Health Checked of Server ${process.env.PORT}`);
});

app.listen(process.env.PORT, () => {
    console.log(`Backend server running on port ${process.env.PORT}`);
});
