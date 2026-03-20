import { io } from "socket.io-client";

const SOCKET_URL = process.env.NODE_ENV === "production" 
  ? process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app"
  : "http://localhost:3000";

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export const connectSocket = (userId: string) => {
  if (!socket.connected) {
    socket.connect();
    socket.emit("join-user-room", userId);
  }
};

export const disconnectSocket = () => {
  if (socket.connected) {
    socket.disconnect();
  }
};