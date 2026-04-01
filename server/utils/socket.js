let io;

module.exports = {
    init: (server) => {
        const { Server } = require('socket.io');
        io = new Server(server, {
            cors: {
                origin: process.env.CLIENT_URL || "*",
                methods: ["GET", "POST"],
                credentials: true
            }
        });
        return io;
    },
    getIO: () => {
        if (!io) {
            // Return a dummy object if io is not initialized yet to prevent crashes
            // but log a warning
            console.warn('Socket.io not initialized yet');
            return {
                to: () => ({ emit: () => {} }),
                emit: () => {}
            };
        }
        return io;
    }
};
