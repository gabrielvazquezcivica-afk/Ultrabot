import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';

class LibConnection {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async connect() {
        console.log(chalk.blue.bold(`
╔═════════════════════════════════════════════════╗
║                                                 ║
║              CONEXIÓN ULTRABOT                  ║
║                                                 ║
╚═════════════════════════════════════════════════╝
`));

        console.log(chalk.yellow.bold('📲 Conexión mediante código de 8 dígitos\n'));

        return new Promise((resolver, rechazar) => {
            this.iniciarProceso()
                .then(cliente => resolver(cliente))
                .catch(error => rechazar(error));
        });
    }

    async iniciarProceso() {
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false // ❌ desactivamos QR
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(chalk.green.bold('✅ ¡CONECTADO CORRECTAMENTE!'));
                this.rl.close();
            }

            if (connection === 'close') {
                console.log(chalk.red('❌ Conexión cerrada'));
            }
        });

        // 🔥 PEDIR NÚMERO PARA GENERAR CÓDIGO
        this.rl.question(chalk.cyan('📞 Ingresa tu número (ej: 5213312345678): '), async (numero) => {
            try {
                let code = await sock.requestPairingCode(numero);

                // 🔥 FORMATEAR A 8 DÍGITOS (XXXX-XXXX)
                code = code?.match(/.{1,4}/g)?.join('-') || code;

                console.log(chalk.yellow.bold('\n🔑 CÓDIGO DE VINCULACIÓN:\n'));
                console.log(chalk.green.bold(`👉 ${code}\n`));
                console.log(chalk.gray('→ Ve a WhatsApp > Dispositivos vinculados > Vincular con código\n'));

            } catch (err) {
                console.log(chalk.red('❌ Error generando código:'), err);
            }
        });

        return sock;
    }
}

export default LibConnection;
