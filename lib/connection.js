import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';
import P from 'pino';

class LibConnection {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.sock = null;
    }

    async connect() {
        console.log(chalk.blue.bold(`
╔═════════════════════════════════════════════════╗
║                                                 ║
║              CONEXIÓN ULTRABOT                  ║
║                                                 ║
╚═════════════════════════════════════════════════╝
`));

        console.log(chalk.cyan('📌 Formato: código de país + número, sin signos ni ceros al inicio'));
        console.log(chalk.gray('Ejemplo: 5213331234567\n'));

        return new Promise((resolver, rechazar) => {
            this.rl.question(chalk.white('Ingresa tu número: '), async (numero) => {
                const numeroLimpio = numero.trim();

                if (!/^\d+$/.test(numeroLimpio)) {
                    console.log(chalk.red('⚠️ Solo ingresa números válidos'));
                    this.rl.close();
                    return rechazar(new Error('Número en formato incorrecto'));
                }

                try {
                    const resultado = await this.iniciarProceso(numeroLimpio);
                    resolver(resultado);
                } catch (err) {
                    rechazar(err);
                }
            });
        });
    }

    async iniciarProceso(numeroUsuario) {
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');

        // 🛠️ Configuración corregida, sin errores y compatible
        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 120000,
            keepAliveIntervalMs: 30000,
            defaultQueryTimeoutMs: 60000,
            retryRequestDelayMs: 5000,
            browser: ['Windows', 'Chrome', '120.0.0'],
            version: [2, 3000, 1035194821],
            // ✅ Forma correcta de ocultar mensajes, sin errores
            logger: P({ level: 'silent' })
        });

        // Guardar cambios de sesión
        this.sock.ev.on('creds.update', saveCreds);

        // Manejar todo el ciclo de conexión
        return new Promise((resolver, rechazar) => {
            this.sock.ev.on('connection.update', async (actualizacion) => {
                const { connection, code, error } = actualizacion;

                if (connection === 'open') {
                    console.log(chalk.green.bold('\n✅ ¡CONECTADO EXITOSAMENTE!'));
                    console.log(chalk.gray('→ El bot está listo para funcionar\n'));
                    this.rl.close();
                    return resolver(this.sock);
                }

                if (connection === 'close') {
                    const motivo = error ? DisconnectReason[error?.output?.statusCode] || error.message : 'Desconocido';
                    console.log(chalk.red(`❌ Conexión cerrada: ${motivo}`));

                    if (motivo === DisconnectReason.loggedOut) {
                        console.log(chalk.yellow('🔄 Se requiere volver a vincular\n'));
                        this.rl.close();
                        return rechazar(new Error('Sesión cerrada'));
                    }
                }

                // Mostrar código cuando esté listo
                if (code) {
                    console.log(chalk.cyan.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN: ${code}`));
                    console.log(chalk.gray(`→ Número: ${numeroUsuario}`));
                    console.log(chalk.gray('📋 Pasos:'));
                    console.log(chalk.gray('   1. Abre WhatsApp > Ajustes'));
                    console.log(chalk.gray('   2. Entra en Dispositivos vinculados'));
                    console.log(chalk.gray('   3. Elige: "Vincular con número de teléfono"'));
                    console.log(chalk.gray('   4. Escribe el código mostrado arriba\n'));
                }
            });

            // Solicitar código en el momento adecuado
            setTimeout(async () => {
                try {
                    if (!this.sock.authState.creds.registered) {
                        await this.sock.requestPairingCode(numeroUsuario);
                    }
                } catch (err) {
                    console.log(chalk.red(`⚠️ No se pudo generar el código: ${err.message}`));
                    this.rl.close();
                    rechazar(err);
                }
            }, 4000);
        });
    }
}

export default LibConnection;
