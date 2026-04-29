import baileys from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';

// 🔥 Extraer correctamente desde Baileys
const { default: makeWASocket, useMultiFileAuthState } = baileys;

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

        console.log(chalk.yellow.bold('📲 Conexión mediante código de vinculación\n'));

        try {
            const cliente = await this.iniciarProceso();
            return cliente;
        } catch (error) {
            console.log(chalk.red('❌ Error del sistema:'), error.message);
            throw error;
        }
    }

    async iniciarProceso() {
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false, // ❌ ya no usamos QR
            browser: ['Ultrabot', 'Chrome', '1.0.0']
        });

        // Guardar sesión
        sock.ev.on('creds.update', saveCreds);

        // Estado de conexión
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'open') {
                console.log(chalk.green.bold('\n✅ ¡CONECTADO CORRECTAMENTE!'));
                console.log(chalk.gray('→ Bot listo para usarse\n'));
                this.rl.close();
            }

            if (connection === 'close') {
                console.log(chalk.red('\n❌ Conexión cerrada'));
            }
        });

        // 🔥 Generar código de vinculación
        this.rl.question(
            chalk.cyan('📞 Ingresa tu número (ej: 5213312345678): '),
            async (numero) => {
                try {
                    let code = await sock.requestPairingCode(numero);

                    // Formatear tipo 1234-5678
                    code = code?.match(/.{1,4}/g)?.join('-') || code;

                    console.log(chalk.yellow.bold('\n🔑 CÓDIGO DE VINCULACIÓN:\n'));
                    console.log(chalk.green.bold(`👉 ${code}\n`));
                    console.log(
                        chalk.gray(
                            '→ Ve a WhatsApp > Dispositivos vinculados > Vincular con código\n'
                        )
                    );
                } catch (err) {
                    console.log(chalk.red('❌ Error generando código:'), err.message);
                }
            }
        );

        return sock;
    }
}

export default LibConnection;
