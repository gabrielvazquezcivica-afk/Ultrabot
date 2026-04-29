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
        // Título principal
        console.log(chalk.blue.bold(`
╔═════════════════════════════════════════════════╗
║                                                 ║
║              CONEXIÓN ULTRABOT                  ║
║                                                 ║
╚═════════════════════════════════════════════════╝
`));

        // Instrucciones
        console.log(chalk.cyan('📌 Formato del número: código de país + tu número, sin signos ni ceros al inicio'));
        console.log(chalk.gray('Ejemplo: 18549995761\n'));

        return new Promise((resolver, rechazar) => {
            this.rl.question(chalk.white('Ingresa tu número para generar el código: '), async (numero) => {
                const numeroLimpio = numero.trim();

                // Validar que solo sean números
                if (!/^\d+$/.test(numeroLimpio)) {
                    console.log(chalk.red('⚠️ Solo escribe números, inténtalo de nuevo'));
                    this.rl.close();
                    return rechazar(new Error('Formato de número incorrecto'));
                }

                try {
                    const cliente = await this.iniciarProceso(numeroLimpio);
                    resolver(cliente);
                } catch (error) {
                    rechazar(error);
                }
            });
        });
    }

    async iniciarProceso(numeroUsuario) {
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false, // ❌ Desactivado para que no salga QR
            syncFullHistory: false
        });

        // Guardar sesión
        sock.ev.on('creds.update', saveCreds);

        // Manejar estados de conexión
        sock.ev.on('connection.update', async (actualizacion) => {
            const { connection, code, error } = actualizacion;

            if (connection === 'open') {
                console.log(chalk.green.bold('✅ ¡CONECTADO CORRECTAMENTE A WHATSAPP!'));
                console.log(chalk.gray('→ Ya puedes usar todas las funciones del bot\n'));
                this.rl.close();
            }

            if (connection === 'close') {
                if (error) console.log(chalk.red(`❌ Conexión cerrada → Motivo: ${error.message || 'Desconocido'}`));
            }

            // Mostrar el código de vinculación cuando esté disponible
            if (code) {
                console.log(chalk.cyan.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${code}`));
                console.log(chalk.gray(`→ Número asociado: ${numeroUsuario}`));
                console.log(chalk.gray('→ Pasos en tu WhatsApp:'));
                console.log(chalk.gray('   1. Ve a Ajustes > Dispositivos vinculados'));
                console.log(chalk.gray('   2. Selecciona "Vincular con número de teléfono"'));
                console.log(chalk.gray('   3. Escribe el código que aparece arriba\n'));
            }
        });

        // Generar el código de vinculación
        if (!sock.authState.creds.registered) {
            try {
                await sock.requestPairingCode(numeroUsuario);
            } catch (err) {
                console.log(chalk.red(`⚠️ Error al generar el código: ${err.message}`));
                this.rl.close();
                throw err;
            }
        }

        return sock;
    }
}

export default LibConnection;
