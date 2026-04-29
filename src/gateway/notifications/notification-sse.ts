/**
 * SSE fallback endpoint for real-time notifications.
 *
 * Provides a `GET /notifications/sse` endpoint that streams notification
 * events to clients that cannot use WebSocket (e.g. simple HTTP consumers,
 * monitoring dashboards).
 *
 * Authentication is validated via the gateway auth token passed as a query
 * parameter `?token=...` or `Authorization: Bearer ...` header.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  setDefaultSecurityHeaders,
  sendJson,
  sendText,
  sendMethodNotAllowed,
} from "../http-common.js";
import type { NotificationService } from "./notification-service.js";

export type NotificationSseParams = {
  notificationService: NotificationService;
  /** Validates token and returns true if authorized. */
  validateToken: (token: string) => boolean;
};

/**
 * Handle an incoming HTTP request for the notification SSE endpoint.
 *
 * Route: `GET /notifications/sse`
 */
export function handleNotificationSseRequest(
  req: IncomingMessage,
  res: ServerResponse,
  params: NotificationSseParams,
): void {
  setDefaultSecurityHeaders(res);

  if (req.method !== "GET") {
    sendMethodNotAllowed(res, "GET");
    return;
  }

  // Extract token from query string or Authorization header.
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  let token = url.searchParams.get("token") ?? "";
  if (!token) {
    const authHeader = req.headers.authorization ?? "";
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    }
  }

  if (!token || !params.validateToken(token)) {
    sendJson(res, 401, { error: { message: "Unauthorized", type: "unauthorized" } });
    return;
  }

  // Set up SSE stream.
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const subscriberId = randomUUID();

  // Send initial comment to confirm connection.
  res.write(": connected\n\n");

  params.notificationService.addSseSubscriber({
    id: subscriberId,
    write: (data: string) => res.write(data),
    close: () => {
      if (!res.writableEnded) {
        res.end();
      }
    },
  });

  // Keepalive every 30s.
  const keepalive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(": keepalive\n\n");
    }
  }, 30_000);

  // Clean up on close.
  const cleanup = () => {
    clearInterval(keepalive);
    params.notificationService.removeSseSubscriber(subscriberId);
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
}
