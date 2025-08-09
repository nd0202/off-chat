// const express = require('express');
// const { createWorker } = require('mediasoup');
// const socketIo = require('socket.io');
// const path = require('path');
// const dotenv =require ('dotenv');
// const cors = require('cors');


// dotenv.config({
//   path: '.env',
// });

// const app = express();
// const PORT = process.env.PORT || 3000;

// // HTTP server for API and static files
// const server = app.listen(PORT, () => {
//   console.log(`SFU Server running on http://localhost:${PORT}`);
// });

// app.use(cors({
//   origin: "https://off-chat.netlify.app", // ✅ Make sure it's https, not http
//   methods: ['GET', 'POST']
// }));

// // WebSocket server
// const io = socketIo(server, {
//   cors: {
//     origin: ["https://off-chat.netlify.app"], // Your client URL
    
//     methods: ['GET', 'POST']
//   }
// });

// // Mediasoup variables
// let worker;
// let router;
// const rooms = new Map(); // roomId → { peers, router }

// // Static files (for demo UI)
// app.use(express.static(path.join(__dirname, 'public')));

// // Initialize mediasoup worker and router
// async function initMediasoup() {
//   worker = await createWorker({
//     logLevel: 'warn',
//     rtcMinPort: 40000,
//     rtcMaxPort: 49999,
//   });

//   router = await worker.createRouter({
//     mediaCodecs: [
//       {
//         kind: 'audio',
//         mimeType: 'audio/opus',
//         clockRate: 48000,
//         channels: 2,
//       },
//       {
//         kind: 'video',
//         mimeType: 'video/VP8',
//         clockRate: 90000,
//         parameters: {
//           'x-google-start-bitrate': 1000,
//           'x-google-max-bitrate': 4000,
//         },
//       },
//     ],
//   });

//   console.log('Mediasoup router ready');
// }

// // Socket.io connection handler
// io.on('connection', (socket) => {
//   console.log(`New connection: ${socket.id}`);

//   // Handle joining a room
//    socket.on('getRouterRtpCapabilities', (_, callback) => {
//     callback(router.rtpCapabilities);
//   });
//   // Handle WebRTC transport creation
//   socket.on('createTransport', async ({ roomId, direction }, callback) => {
//     try {
//       const room = rooms.get(roomId);
//       if (!room) throw new Error('Room not found');

//       const transport = await room.router.createWebRtcTransport({
//         listenIps: [
//           { 
//             ip: '0.0.0.0', 
//             announcedIp: process.env.SERVER_IP || '172.22.84.60' 
//           }
//         ],
//         enableUdp: true,
//         enableTcp: true,
//         preferUdp: true,
//         appData: { direction },
//       });

//       // Store transport in the room
//       const peer = room.peers.get(socket.id);
//       peer[direction === 'send' ? 'sendTransport' : 'recvTransport'] = transport;

//       callback({
//         id: transport.id,
//         iceParameters: transport.iceParameters,
//         iceCandidates: transport.iceCandidates,
//         dtlsParameters: transport.dtlsParameters,
//       });
//     } catch (error) {
//       console.error('Transport creation error:', error);
//       callback({ error: error.message });
//     }
//   });

//   // Handle transport connection
//   socket.on('connectTransport', async ({ roomId, transportId, dtlsParameters }, callback) => {
//     try {
//       const room = rooms.get(roomId);
//       if (!room) throw new Error('Room not found');

//       const peer = room.peers.get(socket.id);
//       const transport = peer.sendTransport?.id === transportId 
//         ? peer.sendTransport 
//         : peer.recvTransport;

//       if (!transport) throw new Error('Transport not found');

//       await transport.connect({ dtlsParameters });
//       callback({ success: true });
//     } catch (error) {
//       console.error('Transport connect error:', error);
//       callback({ error: error.message });
//     }
//   });

//   // Handle media production
//   socket.on('produce', async ({ roomId, transportId, kind, rtpParameters }, callback) => {
//     try {
//       const room = rooms.get(roomId);
//       if (!room) throw new Error('Room not found');

//       const peer = room.peers.get(socket.id);
//       const transport = peer.sendTransport;

//       if (!transport || transport.id !== transportId) {
//         throw new Error('Invalid transport');
//       }

//       const producer = await transport.produce({
//         kind,
//         rtpParameters,
//       });

//       peer.producers.set(producer.id, producer);

//       // Notify other peers in the room
//       room.peers.forEach((otherPeer, peerId) => {
//         if (peerId !== socket.id) {
//           otherPeer.socket.emit('newProducer', {
//             producerId: producer.id,
//             kind,
//           });
//         }
//       });

//       callback({ id: producer.id });
//     } catch (error) {
//       console.error('Produce error:', error);
//       callback({ error: error.message });
//     }
//   });

//   // Handle media consumption
//   socket.on('consume', async ({ roomId, producerId, rtpCapabilities }, callback) => {
//     try {
//       const room = rooms.get(roomId);
//       if (!room) throw new Error('Room not found');

//       const peer = room.peers.get(socket.id);
//       const producer = Array.from(room.peers.values())
//         .find(p => p.producers?.has(producerId))
//         ?.producers?.get(producerId);

//       if (!producer) throw new Error('Producer not found');

//       const consumer = await peer.recvTransport.consume({
//         producerId,
//         rtpCapabilities,
//       });

//       peer.consumers.set(consumer.id, consumer);

//       callback({
//         id: consumer.id,
//         producerId: consumer.producerId,
//         kind: consumer.kind,
//         rtpParameters: consumer.rtpParameters,
//       });
//     } catch (error) {
//       console.error('Consume error:', error);
//       callback({ error: error.message });
//     }
//   });

//   // Handle disconnection
//   socket.on('disconnect', () => {
//     rooms.forEach((room, roomId) => {
//       if (room.peers.has(socket.id)) {
//         const peer = room.peers.get(socket.id);
        
//         // Cleanup producers/consumers
//         peer.producers?.forEach(producer => producer.close());
//         peer.consumers?.forEach(consumer => consumer.close());
        
//         room.peers.delete(socket.id);
//         console.log(`Peer ${socket.id} left room ${roomId}`);

//         // Close room if empty
//         if (room.peers.size === 0) {
//           rooms.delete(roomId);
//         }
//       }
//     });
//   });
// });

// // Error handling
// process.on('unhandledRejection', (error) => {
//   console.error('Unhandled rejection:', error);
// });

// // Start the server
// initMediasoup().then(() => {
//   console.log('SFU server initialized');
// });







/**
 * server.js
 * - mediasoup worker + router (keeps your original logic)
 * - socket.io presence, typing, read receipts
 * - multer file upload endpoint (/upload)
 *
 * Required env variables (or change defaults below):
 *  - PORT
 *  - SERVER_ANNOUNCED_IP (the public IP the SFU should announce)
 *  - CORS_ORIGIN (your client origin e.g. https://off-chat.netlify.app)
 */

const express = require('express');
const { createWorker } = require('mediasoup');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

dotenv.config({ path: '.env' });

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://off-chat.netlify.app'; // adjust
const SERVER_ANNOUNCED_IP = process.env.SERVER_ANNOUNCED_IP || '172.22.84.60'; // adjust
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;

// HTTP server for API and static files
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`SFU Server running on ${SERVER_BASE_URL}`);
});

// Static files (for demo UI and uploaded files)
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer config for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, base + ext);
  },
});
const upload = multer({ storage });

// CORS
app.use(cors({
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST'],
}));

// Upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Return absolute URL so clients hosted elsewhere can use it
  const url = `${SERVER_BASE_URL}/uploads/${req.file.filename}`;
  res.json({
    url,
    originalName: req.file.originalname,
    size: req.file.size,
    mime: req.file.mimetype,
  });
});

// --- mediasoup setup ---
let worker;
let router;
const rooms = new Map(); // roomId -> { peers: Map(socketId -> peerObj), router }

async function initMediasoup() {
  worker = await createWorker({
    logLevel: 'warn',
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  });

  router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
      },
    ],
  });

  console.log('Mediasoup router ready');
}
initMediasoup().then(() => console.log('Mediasoup initialized')).catch(err => {
  console.error('Failed to init mediasoup:', err);
  process.exit(1);
});

// Create http+socket.io
const io = socketIo(server, {
  cors: {
    origin: [CORS_ORIGIN],
    methods: ['GET', 'POST'],
  },
});

// user map for presence (userId -> socketId)
const users = new Map();

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // --- Presence & simple signaling ---
  socket.on('register', ({ userId }) => {
    socket.userId = userId;
    users.set(userId, socket.id);
    console.log(`User registered: ${userId} -> ${socket.id}`);
    socket.broadcast.emit('user-online', { userId });

    // send current online list
    const onlineUsers = Array.from(users.keys());
    socket.emit('online-list', { onlineUsers });
  });

  socket.on('typing', ({ to }) => {
    const toSocketId = users.get(to);
    if (toSocketId) io.to(toSocketId).emit('typing', { from: socket.userId });
  });

  socket.on('stop-typing', ({ to }) => {
    const toSocketId = users.get(to);
    if (toSocketId) io.to(toSocketId).emit('stop-typing', { from: socket.userId });
  });

  socket.on('mark-read', ({ to, messageIds }) => {
    const toSocketId = users.get(to);
    if (toSocketId) {
      io.to(toSocketId).emit('message-read', { from: socket.userId, messageIds });
    }
  });

  socket.on('message-delivered', ({ to, messageId }) => {
    const toSocketId = users.get(to);
    if (toSocketId) io.to(toSocketId).emit('message-delivered', { from: socket.userId, messageId });
  });

  // --- mediasoup RPC style handlers (callback-based) ---
  socket.on('getRouterRtpCapabilities', (_, callback) => {
    try {
      callback(router.rtpCapabilities);
    } catch (err) {
      console.error('getRouterRtpCapabilities error:', err);
      callback({ error: err.message });
    }
  });

  socket.on('createTransport', async ({ roomId, direction }, callback) => {
    try {
      let room = rooms.get(roomId);
      if (!room) {
        // create new room record with a new router if needed
        room = { peers: new Map(), router }; // using global router for simplicity
        rooms.set(roomId, room);
      }

      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: SERVER_ANNOUNCED_IP }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        appData: { direction, socketId: socket.id },
      });

      // save peer record if not exist
      let peer = room.peers.get(socket.id);
      if (!peer) {
        peer = {
          socket,
          sendTransport: null,
          recvTransport: null,
          producers: new Map(),
          consumers: new Map(),
        };
        room.peers.set(socket.id, peer);
      }

      // store in peer
      if (direction === 'send') peer.sendTransport = transport;
      else peer.recvTransport = transport;

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (err) {
      console.error('createTransport error:', err);
      callback({ error: err.message });
    }
  });

  socket.on('connectTransport', async ({ roomId, transportId, dtlsParameters }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (!room) throw new Error('Room not found');

      const peer = room.peers.get(socket.id);
      const transport = (peer.sendTransport && peer.sendTransport.id === transportId) ? peer.sendTransport : peer.recvTransport;
      if (!transport) throw new Error('Transport not found');

      await transport.connect({ dtlsParameters });
      callback({ success: true });
    } catch (err) {
      console.error('connectTransport error:', err);
      callback({ error: err.message });
    }
  });

  socket.on('produce', async ({ roomId, transportId, kind, rtpParameters }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (!room) throw new Error('Room not found');
      const peer = room.peers.get(socket.id);
      const transport = peer.sendTransport;
      if (!transport || transport.id !== transportId) throw new Error('Invalid transport');

      const producer = await transport.produce({ kind, rtpParameters });
      peer.producers.set(producer.id, producer);

      // notify other peers in the room about new producer
      room.peers.forEach((otherPeer, peerId) => {
        if (peerId !== socket.id) {
          otherPeer.socket.emit('newProducer', { producerId: producer.id, kind });
        }
      });

      callback({ id: producer.id });
    } catch (err) {
      console.error('produce error:', err);
      callback({ error: err.message });
    }
  });

  socket.on('consume', async ({ roomId, producerId, rtpCapabilities }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (!room) throw new Error('Room not found');
      const peer = room.peers.get(socket.id);

      const producer = Array.from(room.peers.values())
        .find(p => p.producers?.has(producerId))
        ?.producers?.get(producerId);

      if (!producer) throw new Error('Producer not found');

      const consumer = await peer.recvTransport.consume({
        producerId,
        rtpCapabilities,
        paused: false,
      });

      peer.consumers.set(consumer.id, consumer);

      callback({
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (err) {
      console.error('consume error:', err);
      callback({ error: err.message });
    }
  });

  // disconnect handler
  socket.on('disconnect', () => {
    console.log('Socket disconnect:', socket.id);
    if (socket.userId) {
      users.delete(socket.userId);
      socket.broadcast.emit('user-offline', { userId: socket.userId });
      console.log(`User disconnected: ${socket.userId}`);
    }

    // cleanup rooms peers
    rooms.forEach((room, roomId) => {
      if (room.peers.has(socket.id)) {
        const peer = room.peers.get(socket.id);
        // cleanup producers/consumers
        peer.producers?.forEach(p => p.close());
        peer.consumers?.forEach(c => c.close());
        room.peers.delete(socket.id);
        console.log(`Peer ${socket.id} left room ${roomId}`);
        if (room.peers.size === 0) rooms.delete(roomId);
      }
    });
  });

}); // end io.on('connection')

// general unhandled rejection
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
