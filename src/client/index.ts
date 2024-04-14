import fsp from "node:fs/promises";
import path from "node:path/win32";
import udp from "node:dgram";

const [baronyHost, baronyPort] = ['10.0.0.2', 57165]; // subnet ip + game's port
const _baronyRoot = undefined; //Absolute path to Barony folder ('D:\\GOG\\Barony' e.g.)
const socket = udp.createSocket('udp4');
const sockets = new Map<string, udp.Socket>();
const local: udp.RemoteInfo = { address: '10.0.0.2', port: 12456, family: "IPv4", size: -1 }; // where to run [Client] from
console.log(process.argv[2]=="-l");
const remote: udp.RemoteInfo = process.argv[2] == "local" ?
    { address: "10.0.0.2", port: 57160, family: "IPv4", size: -1 } : //if "local", the [Server] ip and port on the local subnet (testing purposes)
    { address: "12.34.56.78", port: 57165, family: "IPv4", size: -1 }; // Public-facing server and forwarded port

let logging:boolean = false;
enum FILTER_MODE {
    EXCLUDE = 0,
    INCLUDE,
}
let mode:FILTER_MODE = FILTER_MODE.EXCLUDE;
let filters:Set<string> = new Set<string>();

socket.addListener('error', (err) => {
    console.error(err);
})
socket.addListener('listening', () => {
    console.log('Listening on ', socket.address().port);
    //penetrate the firewall
    socket.send(Buffer.from([0x1, 0x2, 0x3]), remote.port, remote.address, (err) => {
        if (err) console.error('Failed punching through firewall');
    });
})

socket.addListener('message', (buffer, rinfo) => {
    // console.log('Message ',rinfo.address,rinfo.port);
    if (rinfo.port == remote.port && buffer.equals(Buffer.from([0x1, 0x2, 0x3]))) {
        console.log('[Remote -> Proxy] OK');
    } else {
        // console.log('[Remote -> Barony] Msg');
        const { ip, port } = parseHeader(buffer.subarray(0, 6));
        const payload = buffer.subarray(6, undefined);
        // console.log(`[R->B]`,payload.toString());
        if (!sockets.has(`${ip}:${port}`)) {
            console.log('New socket');
            const _s = udp.createSocket('udp4');
            _s.connect(baronyPort, baronyHost);
            sockets.set(`${ip}:${port}`, _s);
            _s.addListener('message', (msg, rinfo) => {
                if (rinfo.port == baronyPort) {
                    // console.log(`[B->R]`,msg.toString());
                    log(msg);
                    const header = formHeader({ address: ip, port: port, family: "IPv4", size: -1 });
                    // SAFE�CMSG�@�@Child Predator: save|
                    const match = /(SAFE.*CMSG).*(@.*): (.*)/
                    if(match.test(msg.toString())){
                        const [name,command] = msg.subarray(17,-1).toString().trim().split(":").map(v=>v.trim())!;
                        console.log(name,':',command);
                        handleCommand(command);
                        if(name=='<Server>' || !command.startsWith('save')) return;
                        const buf = Buffer.concat([msg.subarray(0,17),Buffer.from("<Server>: OK\x00")]);
                        console.log(buf);
                        console.log(buf.toString());
                        _s.send(buf);
                        socket.send(Buffer.concat([header, buf]), remote.port, remote.address,(err)=>{
                            if(err) console.error("[Proxy -> Remote] Err,",err);
                        });
                    }
                    socket.send(Buffer.concat([header, msg]), remote.port, remote.address,(err)=>{
                        if(err) console.error("[Proxy -> Remote] Err,",err);
                    });
                }
            });
            _s.addListener('error', (err) => {
                console.error('[Proxy -> Barony] Err', err);
            });
            _s.once('connect', () => {
                _s.send(payload);
            })
        } else {
            sockets.get(`${ip}:${port}`)!.send(payload);
        }
    }
})
socket.addListener('connect', () => {
    console.log('Connection');
})
socket.addListener('close', () => {
    console.log('Closed');
})
socket.bind(local.port, local.address);

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

function log(buffer:Buffer){
    if(logging){
        const msg:string = buffer.toString();
        for(const v of filters){
            if(mode==FILTER_MODE.INCLUDE && !msg.includes(v)) return;
            else if(mode==FILTER_MODE.EXCLUDE && msg.includes(v)) return;
        }
        console.log(msg);
    } else return;
}

async function handleCommand(command:string){
    const args = command.split(' ').map(v=>v.trim());
    console.log(args);
    switch(args[0]){
        case "save": {
            if(!_baronyRoot) return;
            const BaronyRoot = path.resolve(_baronyRoot);
            const BaronySaves = path.join(BaronyRoot, "savegames");
            const _ = await (async () => {
                try {
                    const files = (await fsp.readdir(BaronySaves,{withFileTypes:true})).filter(v => v.name.endsWith("_mp.baronysave")).map(v=>v.name);
                    let lastModifiedSavefile: string = "";
                    let lastMod = (await fsp.stat(path.join(BaronySaves, files[0]))).mtimeMs;
                    for (const file of files) {
                        const _lastMod = (await fsp.stat(path.join(BaronySaves, file))).mtimeMs;
                        if (_lastMod > lastMod) {
                            lastModifiedSavefile = file;
                            lastMod = _lastMod;
                        }
                    }
                    console.log("Using save file: ",lastModifiedSavefile);
                    return [lastModifiedSavefile, await fsp.readFile(path.join(BaronySaves,lastModifiedSavefile))];
                } catch (err) {
                    return console.error(err);
                }
            })();
            if(!_) throw 'No savefile loaded';
            const [savename,savefile] = _ as [string,Buffer];
            const BaronyBackups = path.join(BaronyRoot,"backups");
            try{
                await fsp.access(BaronyBackups,fsp.constants.R_OK | fsp.constants.W_OK)
            } catch(err){
                console.error('No backups folder, create');
                await fsp.mkdir(BaronyBackups);
            }
            try{
                await fsp.writeFile(path.join(BaronyBackups,"\\",savename.concat(args[1] ? (args[1].length > 0 ? "-" + args[1] : "") : "", ".backup")), savefile);
            }catch(err){
                console.error(err);
            }
            break;
        }
        default:{
            break
        }
    }
    return;
}

process.stdin.addListener('data',(buffer)=>{
    const args = buffer.toString().trim().split(' ');
    switch(args[0]){
        case "log":{
            logging=!logging;
            break;
        }
        case "filter":{
            if(args[1] == 'add' || args[1] == 'a'){
                filters.add(args[2]);
            } else if (args[1] == 'remove' || args[1] == 'r') {
                filters.delete(args[2])
            } else if (args[1] == 'list' || args[1] == 'l') {
                console.log('\n',[...filters.values()],'\n');
            } else if(args[1]=="mode"||args[1]=='m'){
                if(args[2] == "include" || args[2] == "i"){
                    mode = FILTER_MODE.INCLUDE;
                } else if(args[2] == "exclude"||args[2] == "e"){
                    mode = FILTER_MODE.EXCLUDE;
                }
            }
            break;
        }
    }

})