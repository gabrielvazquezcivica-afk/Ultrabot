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
        // Título grande tal como lo pediste
        console.log(chalk.blue.bold(`
╔═════════════════════════════════════════════════╗
║                                                 ║
║              CONEXIÓN ULTRABOT                  ║
║                                                 ║
╚═════════════════════════════════════════════════╝
`));

        // Solo mensaje indicando que se usará el código QR
        console.log(chalk.yellow.bold('📲 Preparando código QR para conexión...\n'));

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
            printQRInTerminal: true,
            syncFullHistory: false
        });

        // Guardar datos de sesión
        sock.ev.on('creds.update', saveCreds);

        // Control de estado de conexión
        sock.ev.on('connection.update', (actualizacion) => {
            const { connection, qr, error } = actualizacion;

            if (connection === 'open') {
                console.log(chalk.green.bold('✅ ¡CONECTADO CORRECTAMENTE A WHATSAPP!'));
                console.log(chalk.gray('→ Ya puedes usar todas las funciones del bot\n'));
                this.rl.close();
            }

            if (connection === 'close') {
                if (error) console.log(chalk.red(`❌ Conexión cerrada → Motivo: ${error.message || 'Desconocido'}`));
            }

            // Mostrar código QR automáticamente
            if (qr) {
                console.log(chalk.yellow.bold('\n📲 ESCANEA ESTE CÓDIGO QR:'));
                console.log(chalk.gray('→ Abre WhatsApp > Dispositivos vinculados > Vincular un dispositivo\n'));
            }
        });

        return sock;
    }
}

export default LibConnection;
