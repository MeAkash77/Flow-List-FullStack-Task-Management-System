const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(server, {
    cors: {
      origin: dev ? "http://localhost:3000" : process.env.NEXT_PUBLIC_APP_URL,
      credentials: true,
    },
  });

  // Store connected users and their rooms
  const userRooms = new Map();

  io.on("connection", (socket) => {
    console.log("🔌 User connected:", socket.id);

    // Join a room for this user (based on userId)
    socket.on("join-user-room", (userId) => {
      socket.join(`user-${userId}`);
      userRooms.set(socket.id, userId);
      console.log(`User ${userId} joined their room`);
    });

    // Handle task updates
    socket.on("task-updated", (data) => {
      const { task, userId } = data;
      
      // Broadcast to all OTHER users
      socket.broadcast.emit("task-synced", { task, userId });
      
      // Also emit to specific user room if needed
      io.to(`user-${userId}`).emit("task-synced", { task, userId });
      
      console.log(`Task ${task.id} updated by user ${userId}`);
    });

    // Handle task creation
    socket.on("task-created", (data) => {
      const { task, userId } = data;
      socket.broadcast.emit("task-created-synced", { task, userId });
    });

    // Handle task deletion
    socket.on("task-deleted", (data) => {
      const { taskId, userId } = data;
      socket.broadcast.emit("task-deleted-synced", { taskId, userId });
    });

    socket.on("disconnect", () => {
      const userId = userRooms.get(socket.id);
      console.log("🔌 User disconnected:", socket.id, "User:", userId);
      userRooms.delete(socket.id);
    });
  });

  // Make io accessible to API routes
  global.io = io;

  server.listen(3000, () => {
    console.log("> Ready on http://localhost:3000");
    console.log("> WebSocket server ready");
  });
});