const socketIo = require('socket.io');

let io;

const init = (server) => {
  io = socketIo(server, {
    cors: {
      origin: (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173').split(','),
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('join', (userId) => {
      socket.join(userId);
      console.log(`User ${userId} joined room`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

const notifyUser = (userId, event, data) => {
  if (io) {
    io.to(userId).emit(event, data);
  }
};

module.exports = {
  init,
  getIO,
  notifyUser
};
