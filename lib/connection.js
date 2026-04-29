import * as baileys from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';

const makeWASocket = baileys.default;
const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys;

class UltraConnection {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.sock = null;
        this.isConnecting = false; // 🔥 evita duplicados
        this.retries = 0;
    }

    async start() {
        console.log(chalk.blue.bold('🚀 ULTRABOT PRO ESTABLE\n'));
        await this.connect();
    }

    async connect() {
        // 🔴 EVITA DOBLE CONEXIÓN
        if (this.isConnecting) return;
        this.isConnecting = true;

        try {
            const { state, saveCreds } = await useMultiFileAuthState('./sesion');
            const { version } = await fetchLatestBaileysVersion();

            this.sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                browser: ['Windows', 'Chrome', '120.0.0']
            });

            // 🔴 VALIDACIÓN CRÍTICA
            if (!this.sock || !this.sock.ev) {
                throw new Error('Socket no inicializado correctamente');
            }

            this.sock.ev.on('creds.update', saveCreds);

            this.generarCodigo();

            this.sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    console.log(chalk.green('\n✅ CONECTADO\n'));
                    this.retries = 0;
                    this.isConnecting = false;
                    this.rl.close();
                }

                if (connection === 'close') {
                    const reason = lastDisconnect?.error?.output?.statusCode;

                    console.log(chalk.red('\n❌ Conexión cerrada'));

                    this.isConnecting = false;

                    // 🔁 reconexión controlada
                    if (this.retries < 5) {
                        this.retries++;

                        setTimeout(() => {
                            this.connect();
                        }, 5000 * this.retries);
                    }
                }
            });

        } catch (err) {
            console.log(chalk.red('❌ Error:'), err.message);
            this.isConnecting = false;
        }
    }

    async generarCodigo() {
        this.rl.question('\n📞 Número (521...): ', async (numero) => {
            try {
                await this.sleep(3000);

                if (!this.sock) throw new Error('Socket no disponible');

                let code = await this.sock.requestPairingCode(numero);
                code = code?.match(/.{1,4}/g)?.join('-') || code;

                console.log('\n🔑 Código:', code);

            } catch (err) {
                console.log('❌ Error código:', err.message);
            }
        });
    }

    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
}

export default UltraConnection;
