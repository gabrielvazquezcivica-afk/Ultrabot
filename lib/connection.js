import * as baileys from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';

const makeWASocket = baileys.default;
const { 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion,
    DisconnectReason 
} = baileys;

class LibConnection {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async start() {
        console.log(chalk.blue.bold(`
╔════════════════════════════════════╗
║        CONEXIÓN ULTRABOT           ║
╚════════════════════════════════════╝
`));

        await this.connect();
    }

    async connect() {
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '20.0.0']
        });

        sock.ev.on('creds.update', saveCreds);

        let numeroIngresado = false;

        // 🔥 pedir número inmediatamente
        if (!numeroIngresado) {
            numeroIngresado = true;

            this.rl.question(
                chalk.cyan('\n📞 Ingresa tu número (ej: 5213312345678): '),
                async (numero) => {
                    try {
                        let code = await sock.requestPairingCode(numero);

                        code = code?.match(/.{1,4}/g)?.join('-') || code;

                        console.log(chalk.yellow.bold('\n🔑 CÓDIGO:\n'));
                        console.log(chalk.green.bold(`👉 ${code}\n`));

                    } catch (err) {
                        console.log(chalk.red('❌ Error código:'), err.message);
                    }
                }
            );
        }

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(chalk.green('\n✅ CONECTADO\n'));
                this.rl.close();
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;

                console.log(chalk.red('\n❌ Conexión cerrada:', reason));

                // 🔁 reconexión inteligente
                if (reason !== DisconnectReason.loggedOut) {
                    console.log(chalk.yellow('🔄 Reintentando...\n'));
                    setTimeout(() => this.connect(), 2000);
                } else {
                    console.log(chalk.red('🚫 Sesión cerrada. Borra /sesion'));
                }
            }
        });
    }
}

export default LibConnection;
