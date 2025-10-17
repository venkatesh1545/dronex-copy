import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mediasoup from 'mediasoup';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

let worker, router;

const mediaCodecs = [
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
];

(async () => {
  worker = await mediasoup.createWorker();
  router = await worker.createRouter({ mediaCodecs });
  console.log('MediaSoup worker and router created');
})();

const transports = new Map();
const producers = new Map();
const consumers = new Map();

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('getRouterRtpCapabilities', (callback) => {
    callback(router.rtpCapabilities);
  });

  socket.on('createWebRtcTransport', async ({ sender }, callback) => {
    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });
    transports.set(transport.id, transport);
    callback({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandates,
      dtlsParameters: transport.dtlsParameters,
    });
  });

  socket.on('connectTransport', async ({ transportId, dtlsParameters }) => {
    const transport = transports.get(transportId);
    await transport.connect({ dtlsParameters });
  });

  socket.on('produce', async ({ transportId, kind, rtpParameters }, callback) => {
    const transport = transports.get(transportId);
    const producer = await transport.produce({ kind, rtpParameters });
    producers.set(producer.id, producer);
    callback({ id: producer.id });
    socket.broadcast.emit('newProducer', { producerId: producer.id });
  });

  socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
    const transport = transports.get(transportId);
    const producer = producers.get(producerId);
    if (!router.canConsume({ producerId, rtpCapabilities })) {
      return callback({ error: 'Cannot consume' });
    }
    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false,
    });
    consumers.set(consumer.id, consumer);
    callback({
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(3002, () => {
  console.log('MediaSoup server running on port 3002');
});
