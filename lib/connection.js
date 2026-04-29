import * as baileys from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';

const makeWASocket = baileys.default;
const { useMultiFileAuthState, fetchLatestBaileysVersion } = baileys;

class LibConnection {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async connect() {
        console.log(chalk.blue.bold(`
╔════════════════════════════════════╗
║        CONEXIÓN ULTRABOT           ║
╚════════════════════════════════════╝
`));

        return await this.iniciarProceso();
    }

    async iniciarProceso() {
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false
        });

        sock.ev.on('creds.update', saveCreds);

        let codigoGenerado = false;

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;

            // 🔥 GENERAR CÓDIGO SOLO UNA VEZ Y EN EL MOMENTO CORRECTO
            if (!codigoGenerado && connection === 'connecting') {
                codigoGenerado = true;

                this.rl.question(
                    chalk.cyan('\n📞 Ingresa tu número (ej: 5213312345678): '),
                    async (numero) => {
                        try {
                            let code = await sock.requestPairingCode(numero);

                            code = code?.match(/.{1,4}/g)?.join('-') || code;

                            console.log(chalk.yellow.bold('\n🔑 CÓDIGO:\n'));
                            console.log(chalk.green.bold(`👉 ${code}\n`));
                            console.log(chalk.gray('→ WhatsApp > Dispositivos vinculados > Vincular con código\n'));

                        } catch (err) {
                            console.log(chalk.red('❌ Error generando código:'), err.message);
                        }
                    }
                );
            }

            if (connection === 'open') {
                console.log(chalk.green('\n✅ CONECTADO CORRECTAMENTE\n'));
                this.rl.close();
            }

            if (connection === 'close') {
                console.log(chalk.red('\n❌ Conexión cerrada'));
            }
        });

        return sock;
    }
}

export default LibConnection;
