const express = require('express');
const { createWorker } = require('mediasoup');
const socketIo = require('socket.io');
const path = require('path');

dotenv.config({
  path: '.env',
});

const app = express();
const PORT = process.env.PORT || 3000;

// HTTP server for API and static files
const server = app.listen(PORT, () => {
  console.log(`SFU Server running on http://localhost:${PORT}`);
});

// WebSocket server
const io = socketIo(server, {
  cors: {
    origin: ["http://off-chat.netlify.app"], // Your client URL
    methods: ['GET', 'POST']
  }
});

// Mediasoup variables
let worker;
let router;
const rooms = new Map(); // roomId → { peers, router }

// Static files (for demo UI)
app.use(express.static(path.join(__dirname, 'public')));

// Initialize mediasoup worker and router
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
        parameters: {
          'x-google-start-bitrate': 1000,
          'x-google-max-bitrate': 4000,
        },
      },
    ],
  });

  console.log('Mediasoup router ready');
}

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Handle joining a room
  socket.on('join', async ({ roomId }, callback) => {
    try {
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          peers: new Map(),
          router,
        });
      }

      const room = rooms.get(roomId);
      room.peers.set(socket.id, { socket });

      // Send router capabilities to client
      callback({
        rtpCapabilities: router.rtpCapabilities,
      });

      console.log(`Peer ${socket.id} joined room ${roomId}`);
    } catch (error) {
      console.error('Join error:', error);
      callback({ error: error.message });
    }
  });

  // Handle WebRTC transport creation
  socket.on('createTransport', async ({ roomId, direction }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (!room) throw new Error('Room not found');

      const transport = await room.router.createWebRtcTransport({
        listenIps: [
          { 
            ip: '0.0.0.0', 
            announcedIp: process.env.SERVER_IP || '172.22.84.60' 
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        appData: { direction },
      });

      // Store transport in the room
      const peer = room.peers.get(socket.id);
      peer[direction === 'send' ? 'sendTransport' : 'recvTransport'] = transport;

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      console.error('Transport creation error:', error);
      callback({ error: error.message });
    }
  });

  // Handle transport connection
  socket.on('connectTransport', async ({ roomId, transportId, dtlsParameters }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (!room) throw new Error('Room not found');

      const peer = room.peers.get(socket.id);
      const transport = peer.sendTransport?.id === transportId 
        ? peer.sendTransport 
        : peer.recvTransport;

      if (!transport) throw new Error('Transport not found');

      await transport.connect({ dtlsParameters });
      callback({ success: true });
    } catch (error) {
      console.error('Transport connect error:', error);
      callback({ error: error.message });
    }
  });

  // Handle media production
  socket.on('produce', async ({ roomId, transportId, kind, rtpParameters }, callback) => {
    try {
      const room = rooms.get(roomId);
      if (!room) throw new Error('Room not found');

      const peer = room.peers.get(socket.id);
      const transport = peer.sendTransport;

      if (!transport || transport.id !== transportId) {
        throw new Error('Invalid transport');
      }

      const producer = await transport.produce({
        kind,
        rtpParameters,
      });

      peer.producers.set(producer.id, producer);

      // Notify other peers in the room
      room.peers.forEach((otherPeer, peerId) => {
        if (peerId !== socket.id) {
          otherPeer.socket.emit('newProducer', {
            producerId: producer.id,
            kind,
          });
        }
      });

      callback({ id: producer.id });
    } catch (error) {
      console.error('Produce error:', error);
      callback({ error: error.message });
    }
  });

  // Handle media consumption
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
      });

      peer.consumers.set(consumer.id, consumer);

      callback({
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (error) {
      console.error('Consume error:', error);
      callback({ error: error.message });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    rooms.forEach((room, roomId) => {
      if (room.peers.has(socket.id)) {
        const peer = room.peers.get(socket.id);
        
        // Cleanup producers/consumers
        peer.producers?.forEach(producer => producer.close());
        peer.consumers?.forEach(consumer => consumer.close());
        
        room.peers.delete(socket.id);
        console.log(`Peer ${socket.id} left room ${roomId}`);

        // Close room if empty
        if (room.peers.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });
});

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

// Start the server
initMediasoup().then(() => {
  console.log('SFU server initialized');
});