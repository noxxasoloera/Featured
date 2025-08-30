const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
const apiRoutes = require('./index');
app.use('/api', apiRoutes);

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));