import { useEffect, useState } from "react";

type Message = { type: string; payload: string; timestamp: string };

export default function useWebSocket(url: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState("disconnected");

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempts = 0;

    const connect = () => {
      setStatus("connecting");
      socket = new WebSocket(url);
      socket.onopen = () => {
        attempts = 0;
        setStatus("connected");
      };
      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setMessages((prev) => [
            { type: parsed.type ?? "message", payload: parsed.payload ?? event.data, timestamp: new Date().toISOString() },
            ...prev
          ].slice(0, 20));
        } catch {
          setMessages((prev) => [
            { type: "raw", payload: event.data, timestamp: new Date().toISOString() },
            ...prev
          ].slice(0, 20));
        }
      };
      socket.onclose = () => {
        setStatus("disconnected");
        if (reconnectTimer) {
          window.clearTimeout(reconnectTimer);
        }
        const delay = Math.min(8000, 1000 * Math.pow(2, attempts));
        attempts += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      socket?.close();
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, [url]);

  return { messages, status };
}
