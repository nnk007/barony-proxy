## Proxy for Barony
For those unlucky to be behind NAT, but fortunate enough to have a public-facing server.
## How it works
When hosting a LAN game, Barony exposes 57165 (default) for connections on local net. Remote clients (other players) connect to [Server]'s public IP. [Server] wraps the packets, sends them to [Client]. [Client] runs on the same machine, receives wrapped packets from [Server], unwraps them, assigns a Socket for the remote ip and resends them on dedicated for that remote player's port to Barony. And then back in reverse. Read the source.
## HOW-TO
1. Forward some port on the server
2. Build for server via 'npm run build_server'
3. Run server via './index [PORT]' (Port defaults to 57165);
4. Edit client.ts with relevant paths and ip/ports
5. Build for client via 'npm run build_client'
5. Run client