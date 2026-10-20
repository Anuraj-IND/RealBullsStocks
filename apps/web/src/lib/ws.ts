"use client";

import type { WsClientMessage, WsServerMessage } from "@realbulls/shared";
import { resolveWsUrl } from "./api";
import { useAccountStore, useConnectionStore, useMarketStore } from "./store";

type Listener = (msg: WsServerMessage) => void;


class WsClient {
  private socket: WebSocket | null = null;
  private symbols = new Set<string>();
  private accountId: string | null = null;
  private userId: string | null = null;
  private listeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1000;

  connect(): void {
    if (typeof window === "undefined") return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;

    const socket = new WebSocket(resolveWsUrl());
    this.socket = socket;

    socket.onopen = () => {
      this.backoff = 1000;
      useConnectionStore.getState().setConnected(true);
      if (this.symbols.size || this.accountId || this.userId) {
        this.send({
          op: "subscribe",
          symbols: [...this.symbols],
          accountId: this.accountId ?? undefined,
          userId: this.userId ?? undefined,
        });
      }
    };

    socket.onmessage = (event) => {
      let msg: WsServerMessage;
      try {
        msg = JSON.parse(event.data) as WsServerMessage;
      } catch {
        return;
      }
      this.handle(msg);
    };

    socket.onclose = () => {
      this.socket = null;
      useConnectionStore.getState().setConnected(false);
      this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
  }

  private tickQueue: Map<string, import("@realbulls/shared").Tick> = new Map();
  private rafPending = false;

  private flushTicks(): void {
    this.rafPending = false;
    const store = useMarketStore.getState();
    for (const tick of this.tickQueue.values()) {
      store.setTick(tick);
    }
    this.tickQueue.clear();
  }

  private handle(msg: WsServerMessage): void {
    if (msg.op === "tick") {
      // Queue ticks and flush once per animation frame to avoid flooding React
      // with too many synchronous state updates (causes "Too many nested updates")
      this.tickQueue.set(msg.data.symbol, msg.data);
      if (!this.rafPending) {
        this.rafPending = true;
        requestAnimationFrame(() => this.flushTicks());
      }
    } else if (msg.op === "account") {
      useAccountStore.getState().setSnapshot(msg.data);
    }
    for (const listener of this.listeners) listener(msg);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.backoff = Math.min(this.backoff * 2, 30000);
      this.connect();
    }, this.backoff);
  }

  private send(msg: WsClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  subscribeSymbols(symbols: string[]): void {
    const added = symbols.filter((s) => !this.symbols.has(s));
    added.forEach((s) => this.symbols.add(s));
    if (added.length) this.send({ op: "subscribe", symbols: added });
  }

  unsubscribeSymbols(symbols: string[]): void {
    symbols.forEach((s) => this.symbols.delete(s));
    if (symbols.length) this.send({ op: "unsubscribe", symbols });
  }

  subscribeAccount(accountId: string): void {
    this.accountId = accountId;
    this.send({ op: "subscribe", accountId });
  }

  subscribeUser(userId: string): void {
    this.userId = userId;
    this.send({ op: "subscribe", userId });
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }
}

export const ws = new WsClient();
