import udp from "node:dgram";

const port = process.argv[2] ? Number.parseInt(process.argv[2]) : 57165;
const socket = udp.createSocket('udp4');
let proxy: udp.RemoteInfo;

socket.addListener('error', (err) => {
    console.error(err);
})
socket.addListener('listening', () => {
    console.log('Listening on ', socket.address().port);
})

socket.addListener('message', async (buffer, rinfo) => {
    //assign proxy address
    if (buffer.equals(Buffer.from([0x01, 0x02, 0x03])) && !proxy) {
        console.log('123 received');
        proxy = rinfo;
        // console.log('[S->P]', proxy.address, proxy.port);
        socket.send(Buffer.from([0x1, 0x2, 0x3]), proxy.port, proxy.address, (err) => {
            if (err) console.error('Fail OK', err);
        });
        return;
    }
    if (!proxy) return;
    if (rinfo.address == proxy.address && rinfo.port == proxy.port) {
        const { ip, port } = parseHeader(buffer.subarray(0, 6));
        // console.log('[Server -> Remote]',ip,port);
        const payload = buffer.subarray(6, undefined);
        console.log('[P->S]',proxy.address,proxy.port,': [S->R]', ip, port);
        socket.send(payload, port, ip, (err) => {
            if (err) console.error('Failed sending payload to remote', err);
        })
    } else {
        // console.log('[Remote -> Server]',rinfo.address,rinfo.port);
        const header = formHeader(rinfo);
        console.log('[R->S]', rinfo.address, rinfo.port,': [S->P]',proxy.address,proxy.port);
        socket.send(Buffer.concat([header, buffer]), proxy.port, proxy.address, (err) => {
            if (err) console.error("Failed send to proxy", err);
        })
    }
})
socket.addListener('connect', () => {
    console.log('Connection');
})
socket.addListener('close', () => {
    console.log('Closed');
})
socket.bind(port);

function parseHeader(buffer: Buffer) {
    const _ip = buffer.subarray(0, 4);
    const _port = buffer.subarray(4, undefined);
    const ip = [..._ip.values()].map(n => n.toString(10)).join('.');
    const pad = (str:string) =>{
        for(let i = str.length; i < 8; i++){
            str = '0'+str;
        }
        return str;
    }
    const _1 = _port[0].toString(2).length != 8  ? pad(_port[0].toString(2)) : _port[0].toString(2);
    const _2 = _port[1].toString(2).length != 8  ? pad(_port[1].toString(2)) : _port[1].toString(2);
    const port = Number.parseInt(_1+_2,2);
    if (port < 0 || port > 65535) throw "Krill issue";
    return { ip: ip, port: port };
}

function formHeader(rinfo: udp.RemoteInfo) {
    const ip = Buffer.from(rinfo.address.split('.').map(v => Number.parseInt(v)));
    const _1 = Number.parseInt(rinfo.port.toString(2).substring(0, 8),2);
    const _2 = Number.parseInt(rinfo.port.toString(2).substring(8,),2);
    //4 bytes for ip, 2 bytes for port
    const port = Buffer.from([_1, _2]);
    const header = Buffer.concat([ip, port]);
    if (header.length != 6) throw "Shrimply an issue of krill";
    return header;
}