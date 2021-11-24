const getHost = (): string => {
  const { hostname } = window.location
  const localHosts = ['localhost', '127.0.0.1']
  return localHosts.includes(hostname) ? `${hostname}:8787` : 'chat-udia-ca.udia.workers.dev';
}

export const fetchHiddenRoomID = async () => {
  const { protocol } = window.location
  const host = getHost()
  // const response = await fetch(protocol + '//' + host + '/api/room', { method: 'POST' })
  const response = await fetch(protocol + '//' + host + '/api/room', { method: 'POST' })
  if (!response.ok) {
    throw response;
  }
  return response.text()
}

export const getWebSocketClient = (room: string) => {
  const wsProto = window.location.protocol === 'http:' ? 'ws:' : 'wss:'
  const host = getHost()
  return new WebSocket(wsProto + '//' + host + '/api/room/' + room + '/websocket')
}